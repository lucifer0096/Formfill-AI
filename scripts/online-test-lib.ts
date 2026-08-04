/**
 * Shared logic for the OpenRouter (cloud) model comparison tool — mirrors
 * model-test-lib.ts's shape, but calls OpenRouter instead of local Ollama.
 * Not part of the app; nothing under src/ imports this.
 *
 * FREE MODELS ONLY, deliberately: no money has been loaded into the
 * OpenRouter account, so paid models are excluded from this list entirely
 * rather than merely gated behind a confirmation dialog — the simplest way
 * to guarantee a run here can never spend money. Add a paid model back
 * (e.g. google/gemma-3-27b-it, the current production CLASSIFICATION_MODEL)
 * once there's actually budget to test with.
 */
import { formatHintFor } from "@/lib/form-model/format-hint";
import { callOpenRouterWithUsage, type ChatContentPart } from "@/lib/openrouter/client";
import type { Field, FieldType, Form, Section, Anchor } from "@/lib/form-model/types";

// All free-tier, vision-capable models on OpenRouter worth comparing:
//   - gemma-4-26b-a4b-it: closest listing to the locally-tested gemma4:26b
//     (Nigel's pick, passed every local form so far — see docs/MODELS.html
//     §04/§04b). Already tested on 5 real forms in §04c with strong results.
//   - gemma-4-31b-it: same family, one size up — worth comparing against
//     the 26B variant to see if the larger size helps on harder forms
//     (e.g. the NZ citizenship form that failed/timed out on 26B).
//   - nemotron-nano-12b-v2-vl: a genuinely different model family (Nvidia,
//     not Google), smaller, named as vision-language specific rather than
//     a general chat model with vision added on — a real alternative to
//     compare against the Gemma family, not just another size variant.
export const ALL_MODELS = [
  "google/gemma-4-26b-a4b-it:free",
  "google/gemma-4-31b-it:free",
  "nvidia/nemotron-nano-12b-v2-vl:free",
];

export const DEFAULT_MODELS = ALL_MODELS;

// Safety cap: OpenRouter's own request timeout can otherwise hang
// indefinitely on a stuck upstream provider, unlike local Ollama calls
// which are inherently bounded by this machine's own process lifetime.
// Cloud inference should be fast (seconds, not local's CPU-bound minutes) —
// 2 minutes is generous headroom, not a tuned expectation.
export const REQUEST_TIMEOUT_MS = 2 * 60 * 1000;

const FIELD_TYPES: FieldType[] = [
  "text", "longtext", "number", "currency", "date", "email", "phone",
  "name", "address", "choice", "multichoice", "boolean", "signature", "unknown",
];

// Copied by hand from src/lib/openrouter/classify-pdf.ts's SYSTEM_PROMPT —
// keep in sync manually if that prompt changes. Unlike the local test
// harness, this one CAN use the real prompt including acroFieldName
// context, since OpenRouter's file content-part accepts a raw PDF the same
// way production does — no page-image rendering step needed here.
const SYSTEM_PROMPT = `You read a PDF form (attached) and turn it into a structured list of questions a person would need to answer to fill it out.

Group the content into logical SECTIONS (e.g. "Personal details", "Contribution rate") and, within each section, individual FIELDS (one per question a person would need to answer).

For each field, output:
- "label": the label VERBATIM as it appears on the form. Never paraphrase this one.
- "spokenLabel": a plain-language rewrite of what is actually being asked, phrased as a question, suitable to read aloud to someone who cannot see the form. Never omit a negation.
- "help": (optional) one sentence explaining what the question is actually asking, only if the label alone is not self-explanatory.
- "type": one of ${FIELD_TYPES.join(", ")}
- "required": boolean, best guess — true unless there's a clear signal it's optional
- "options": if type is "choice" or "multichoice", an array of {"value": string, "label": string} for each option visible on the form
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
          "options": [{"value": "string", "label": "string"}] or omit,
          "page": number,
          "confidence": number
        }
      ]
    }
  ]
}`;

export interface OnlineModelRunResult {
  ok: boolean;
  raw: string;
  ms: number;
  costUsd?: number;
}

/** Sends the whole PDF to an OpenRouter model in one call, same shape as classifyPdf(). */
export async function runOnlineModel(model: string, pdfBytes: Uint8Array, fileName: string): Promise<OnlineModelRunResult> {
  const start = Date.now();
  try {
    const base64 = Buffer.from(pdfBytes).toString("base64");
    const content: ChatContentPart[] = [
      { type: "text", text: SYSTEM_PROMPT },
      { type: "file", file: { filename: fileName, file_data: `data:application/pdf;base64,${base64}` } },
    ];
    const { content: raw, costUsd } = await callOpenRouterWithUsage(
      [{ role: "user", content }],
      { model, timeoutMs: REQUEST_TIMEOUT_MS },
    );
    return { ok: true, raw, ms: Date.now() - start, costUsd };
  } catch (error) {
    const isTimeout = error instanceof Error && error.name === "TimeoutError";
    const message = isTimeout
      ? `Timed out after ${(REQUEST_TIMEOUT_MS / 1000).toFixed(0)}s waiting on OpenRouter/${model}.`
      : error instanceof Error
        ? error.message
        : String(error);
    return { ok: false, raw: message, ms: Date.now() - start };
  }
}

export function tryParseJson(raw: string): unknown {
  try {
    return JSON.parse(raw);
  } catch {
    return undefined;
  }
}

interface ClassifiedField {
  label: string;
  spokenLabel: string;
  help?: string;
  type: string;
  required: boolean;
  options?: { value: string; label: string }[];
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
 * Converts raw model JSON into the same Form shape the app uses, for a true
 * apples-to-apples comparison with local results. Models occasionally
 * return JSON that parses fine but doesn't match the expected shape (e.g.
 * missing "sections" entirely) — guard against that here rather than
 * letting toForm() throw and losing the raw result the caller already has.
 */
export function toForm(parsed: ClassificationResponse, fileName: string, pageCount: number): Form {
  let fieldIndex = 0;
  const rawSections = Array.isArray(parsed.sections) ? parsed.sections : [];
  const sections: Section[] = rawSections.map((section, sectionIndex) => ({
    id: `section_${sectionIndex}`,
    title: section.title,
    fields: (Array.isArray(section.fields) ? section.fields : []).map((f): Field => {
      const id = `field_${fieldIndex++}`;
      const type = isFieldType(f.type) ? f.type : "unknown";
      const anchor: Anchor = { kind: "region", page: (f.page ?? 1) - 1, rect: { x: 0, y: 0, width: 0, height: 0 } };
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
    title: parsed.title || fileName.replace(/\.pdf$/i, ""),
    source: "pdf",
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
