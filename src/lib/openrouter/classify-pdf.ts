import type { Field, FieldType, Form, Section, Anchor } from "@/lib/form-model/types";
import { formatHintFor } from "@/lib/form-model/format-hint";
import { callOpenRouter, parseJsonResponse, type ChatContentPart } from "./client";
import type { AcroFormFieldSummary } from "@/lib/ingest/acroform-fields";

const FIELD_TYPES: FieldType[] = [
  "text", "longtext", "number", "currency", "date", "email", "phone",
  "name", "address", "choice", "multichoice", "boolean", "signature", "unknown",
];

/**
 * Replaces the old local AcroForm/text-layer detection pipeline (see
 * src/lib/ingest/_archive/README.md) per the 2026-08-02 meeting with Nigel:
 * PDF structure isn't standardised enough for local heuristics to be
 * reliable across real-world forms, so the whole document is handed to a
 * multimodal model in one call, for every PDF, fillable or flat alike.
 *
 * PRIVACY NOTE — deliberate, disclosed tradeoff: redaction (src/lib/redact)
 * only operates on extracted text, and cannot inspect or redact PII rendered
 * inside a PDF/image before it's sent. Nigel's framing: most of these forms
 * are public forms already in the cloud, and the pivot's whole point is that
 * local text extraction was too unreliable to trust anyway. See
 * docs/PRIVACY.md's note on this branch for the full tradeoff writeup.
 */

const SYSTEM_PROMPT = `You read a PDF form (attached) and turn it into a structured list of questions a person would need to answer to fill it out.

If a list of the PDF's real fillable field names is provided below, match each question you find to the correct real field name whenever the visual field on the page corresponds to one of them — this lets the app write the answer back into the real PDF field later. If a question has no matching real field name (the form has no fillable fields, or this particular question isn't one), omit acroFieldName for it.

Group the content into logical SECTIONS (e.g. "Personal details", "Contribution rate") and, within each section, individual FIELDS (one per question a person would need to answer).

For each field, output:
- "label": the label VERBATIM as it appears on the form. Never paraphrase this one.
- "spokenLabel": a plain-language rewrite of what is actually being asked, phrased as a question, suitable to read aloud to someone who cannot see the form. Never omit a negation.
- "help": (optional) one sentence explaining what the question is actually asking, only if the label alone is not self-explanatory.
- "type": one of ${FIELD_TYPES.join(", ")}
- "required": boolean, best guess — true unless there's a clear signal it's optional
- "options": if type is "choice", "multichoice", or "boolean", an array of {"value": string, "label": string, "acroFieldName": string or omit} for each option visible on the form (checkbox options, Yes/No, a list of choices). IMPORTANT: a single Yes/No question is always ONE field with two options, never two separate fields — even when the real PDF represents "Yes" and "No" as two independent checkboxes rather than one field. In that case, give each option its own "acroFieldName" (the specific checkbox field for that one option), and omit the top-level "acroFieldName" on the field itself. Only set the field-level "acroFieldName" when one single real field (a radio group, a dropdown, one checkbox) covers the whole question.
- "acroFieldName": the matching real AcroForm field name, if one real field covers this whole question. Omit if the mapping is per-option instead (see above), or if there is no match at all.
- "page": the 1-indexed page number this question appears on
- "confidence": 0 to 1, your genuine confidence this is a real, correctly-identified question and its type is correct. Use LOW confidence (below 0.5) for anything ambiguous, hard to read, or where you are guessing at structure. Never fake high confidence.

Do not invent fields that aren't on the form. Do not merge unrelated questions together. Skip pure instructional/legal text that isn't asking the user anything, unless it requires an explicit consent action (e.g. a Yes/No agreement), in which case that IS a field.

Respond with ONLY a JSON object of this exact shape, no markdown fencing, no commentary:
{
  "title": "string, the form's own title if visible, otherwise a short descriptive name",
  "sections": [
    {
      "title": "string",
      "fields": [
        {
          "label": "string",
          "spokenLabel": "string",
          "help": "string or omit",
          "type": "one of the allowed types",
          "required": boolean,
          "options": [{"value": "string", "label": "string", "acroFieldName": "string or omit"}] or omit,
          "acroFieldName": "string or omit",
          "page": number,
          "confidence": number
        }
      ]
    }
  ]
}`;

interface ClassifiedOption {
  value: string;
  label: string;
  acroFieldName?: string;
}

interface ClassifiedField {
  label: string;
  spokenLabel: string;
  help?: string;
  type: string;
  required: boolean;
  options?: ClassifiedOption[];
  acroFieldName?: string;
  page?: number;
  confidence: number;
}

interface ClassifiedSection {
  title: string;
  fields: ClassifiedField[];
}

interface ClassificationResponse {
  title?: string;
  sections: ClassifiedSection[];
}

function isFieldType(value: string): value is FieldType {
  return (FIELD_TYPES as string[]).includes(value);
}

/**
 * The model's response is asserted to be a ClassificationResponse by
 * parseJsonResponse<T>'s type parameter, but that's a compile-time cast, not
 * a runtime check — the model is free to return anything shaped like valid
 * JSON, correct or not. Three separate crashes were found and fixed
 * one-by-one today (an empty {} body with no sections, an empty choices
 * array upstream in client.ts, and the field-mapping fallout from both):
 * same root cause each time, code trusting the response shape without
 * checking it. This walks the whole shape defensively once, instead of
 * leaving that same gap open in every field a malformed response could
 * still hit (a section with no fields array, a field that isn't an object
 * at all, and so on) — none of which crashed live yet, but all of which
 * are the exact same class of bug already found three times.
 *
 * Deliberately permissive, not strict: a genuinely malformed field is
 * dropped rather than the whole response rejected, so one bad field in an
 * otherwise-good 20-field response doesn't take the other 19 down with it.
 */
function normalizeClassificationResponse(parsed: unknown): ClassificationResponse {
  if (!parsed || typeof parsed !== "object") {
    throw new Error("The model returned a response that wasn't a JSON object.");
  }
  const obj = parsed as Record<string, unknown>;
  if (!Array.isArray(obj.sections)) {
    throw new Error("The model returned a response with no sections.");
  }

  const sections: ClassifiedSection[] = obj.sections
    .filter((s): s is Record<string, unknown> => Boolean(s) && typeof s === "object")
    .map((s) => ({
      title: typeof s.title === "string" ? s.title : "",
      fields: Array.isArray(s.fields)
        ? s.fields
            .filter((f): f is Record<string, unknown> => Boolean(f) && typeof f === "object")
            .filter((f) => typeof f.label === "string" && typeof f.spokenLabel === "string")
            .map((f) => ({
              label: f.label as string,
              spokenLabel: f.spokenLabel as string,
              help: typeof f.help === "string" ? f.help : undefined,
              type: typeof f.type === "string" ? f.type : "unknown",
              required: Boolean(f.required),
              options: Array.isArray(f.options)
                ? f.options
                    .filter((o): o is Record<string, unknown> => Boolean(o) && typeof o === "object")
                    .filter((o) => typeof o.value === "string" && typeof o.label === "string")
                    .map((o) => ({
                      value: o.value as string,
                      label: o.label as string,
                      acroFieldName: typeof o.acroFieldName === "string" ? o.acroFieldName : undefined,
                    }))
                : undefined,
              acroFieldName: typeof f.acroFieldName === "string" ? f.acroFieldName : undefined,
              page: typeof f.page === "number" ? f.page : undefined,
              confidence: typeof f.confidence === "number" ? f.confidence : 0.3,
            }))
        : [],
    }));

  return {
    title: typeof obj.title === "string" ? obj.title : undefined,
    sections,
  };
}

const YES_NO_PAIRS = [
  ["yes", "no"],
  ["true", "false"],
];

function yesNoPairKey(value: string): { pair: number; side: 0 | 1 } | null {
  const normalized = value.trim().toLowerCase();
  for (let pair = 0; pair < YES_NO_PAIRS.length; pair += 1) {
    const side = YES_NO_PAIRS[pair].indexOf(normalized);
    if (side !== -1) return { pair, side: side as 0 | 1 };
  }
  return null;
}

/**
 * Some models (confirmed on both gemini-2.5-flash-lite and gemma-3-27b-it,
 * see docs/MODELS.html) occasionally model a single Yes/No question as two
 * separate `choice` fields — one with a single "Yes" option, one with a
 * single "No" option — instead of one real choice/boolean field. Left
 * as-is, that produces two dead-end questions on /questions where
 * answering one still leaves an unanswerable "is this NOT a new claim"
 * duplicate. This collapses any adjacent pair like that, within the same
 * section, back into a single boolean field before IDs are assigned.
 * Model-output cleanup, not a prompt fix — works regardless of which
 * model produced the split.
 */
function mergeYesNoSplits(fields: ClassifiedField[]): ClassifiedField[] {
  const merged: ClassifiedField[] = [];
  for (let i = 0; i < fields.length; i += 1) {
    const field = fields[i];
    const next = fields[i + 1];
    const options = field.options;
    const nextOptions = next?.options;

    if (
      next &&
      field.type === "choice" &&
      next.type === "choice" &&
      options?.length === 1 &&
      nextOptions?.length === 1
    ) {
      const a = yesNoPairKey(options[0].value);
      const b = yesNoPairKey(nextOptions[0].value);
      if (a && b && a.pair === b.pair && a.side !== b.side) {
        // Keep whichever half reads as the affirmative phrasing ("Is this a
        // new claim?" over "Is this NOT a new claim?") as the merged
        // question, since a positive boolean question reads more naturally.
        const affirmative = a.side === 0 ? field : next;
        merged.push({
          ...affirmative,
          type: "boolean",
          options: undefined,
        });
        i += 1; // consumed both fields
        continue;
      }
    }

    merged.push(field);
  }
  return merged;
}

// Matches src/lib/ingest/index.ts's SUPPORTED_IMAGE_TYPES — keep in sync.
const IMAGE_MIME_TYPES = new Set(["image/jpeg", "image/png"]);

function isImageMimeType(mimeType: string): boolean {
  return IMAGE_MIME_TYPES.has(mimeType.toLowerCase());
}

export async function classifyPdf(
  fileBytes: ArrayBuffer,
  fileName: string,
  acroFields: AcroFormFieldSummary[],
  pageCount: number,
  mimeType: string = "application/pdf",
): Promise<Form> {
  const base64 = Buffer.from(fileBytes).toString("base64");
  const isImage = isImageMimeType(mimeType);

  // A photo or standalone image scan can never have real AcroForm fields
  // (those only exist inside a PDF's own structure) — acroFields is always
  // empty on this path, but the same "no fillable fields" phrasing already
  // used for a flat/scanned PDF applies just as well here, so no separate
  // prompt branch is needed for it.
  const fieldContext =
    acroFields.length > 0
      ? `\n\nThis PDF has real fillable fields. Match questions to these where they correspond:\n${JSON.stringify(acroFields, null, 2)}`
      : "\n\nThis PDF has no real fillable fields (a flat/scanned form) — do not include acroFieldName on any field.";

  // OpenRouter's multimodal call shape differs by media kind: a PDF goes
  // through the `file` content part (its own OCR/text pre-processing step),
  // an image goes through the standard OpenAI-compatible `image_url` part
  // with a data URI. Same system prompt, same response shape, same
  // downstream parsing either way — only how the document reaches the
  // model changes.
  const content: ChatContentPart[] = [
    { type: "text", text: SYSTEM_PROMPT + fieldContext },
    isImage
      ? { type: "image_url", image_url: { url: `data:${mimeType};base64,${base64}` } }
      : {
          type: "file",
          file: { filename: fileName, file_data: `data:application/pdf;base64,${base64}` },
        },
  ];

  const raw = await callOpenRouter([{ role: "user", content }]);
  const parsed = normalizeClassificationResponse(parseJsonResponse<unknown>(raw));

  let fieldIndex = 0;
  const sections: Section[] = parsed.sections.map((section, sectionIndex) => ({
    id: `section_${sectionIndex}`,
    title: section.title,
    fields: mergeYesNoSplits(section.fields).map((f): Field => {
      const id = `field_${fieldIndex++}`;
      const type = isFieldType(f.type) ? f.type : "unknown";
      const anchor: Anchor = f.acroFieldName
        ? { kind: "acroform", fieldName: f.acroFieldName }
        : { kind: "region", page: (f.page ?? 1) - 1, rect: { x: 0, y: 0, width: 0, height: 0 } };

      return {
        id,
        label: f.label,
        spokenLabel: f.spokenLabel,
        help: f.help,
        type,
        formatHint: formatHintFor(type),
        required: f.required,
        constraints: f.options ? { options: f.options } : {},
        sensitivity: "none",
        confidence: Number.isFinite(f.confidence) ? Math.min(1, Math.max(0, f.confidence)) : 0.3,
        anchor,
      };
    }),
  }));

  return {
    id: crypto.randomUUID(),
    title: parsed.title || fileName.replace(/\.[a-z0-9]+$/i, ""),
    source: isImage ? "image" : "pdf",
    locale: "en-GB",
    provenance: {
      capturedAt: new Date().toISOString(),
      pageCount,
      extractor: "openrouter-multimodal",
      localOnly: false,
    },
    sections,
  };
}
