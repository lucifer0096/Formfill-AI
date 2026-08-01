import type { Field, FieldType, Form, Section } from "@/lib/form-model/types";
import type { TextBlock } from "@/lib/ingest/text-layer";
import { callOpenRouter } from "./client";

const FIELD_TYPES: FieldType[] = [
  "text", "longtext", "number", "currency", "date", "email", "phone",
  "name", "address", "choice", "multichoice", "boolean", "signature", "unknown",
];

const SYSTEM_PROMPT = `You turn raw text extracted from a flat/scanned PDF form into a structured list of questions.

The text was read by a PDF text-extraction tool and has NO reliable layout information beyond rough reading order — labels and their answer boxes are only related by proximity and common sense, exactly like a human skimming the page would infer.

Group the text into logical SECTIONS (e.g. "Personal details", "Contribution rate") and, within each section, individual FIELDS (one per question a person would need to answer).

For each field, output:
- "label": the label VERBATIM as it appears in the source text. Never paraphrase this one.
- "spokenLabel": a plain-language rewrite of what is actually being asked, phrased as a question, suitable to read aloud to someone who cannot see the form. Never omit a negation.
- "help": (optional) one sentence explaining what the question is actually asking, only if the label alone is not self-explanatory.
- "type": one of ${FIELD_TYPES.join(", ")}
- "required": boolean, best guess — true unless there's a clear signal it's optional
- "options": if type is "choice" or "multichoice", an array of {"value": string, "label": string} for each option found in the source text (e.g. checkbox options, Yes/No, a list of choices)
- "confidence": 0 to 1, your genuine confidence this is a real, correctly-identified question. Use LOW confidence (below 0.5) for anything ambiguous, garbled, or where you are guessing at structure. Never fake high confidence.

Do not invent fields that aren't in the source text. Do not merge unrelated questions together. Skip pure instructional/legal text that isn't asking the user anything (e.g. boilerplate about how a form will be used) unless it requires an explicit consent action (e.g. a Yes/No agreement), in which case that IS a field.

Respond with ONLY a JSON object of this exact shape, no markdown fencing, no commentary:
{
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
          "confidence": number
        }
      ]
    }
  ]
}`;

interface ClassifiedField {
  label: string;
  spokenLabel: string;
  help?: string;
  type: string;
  required: boolean;
  options?: { value: string; label: string }[];
  confidence: number;
}

interface ClassifiedSection {
  title: string;
  fields: ClassifiedField[];
}

interface ClassificationResponse {
  sections: ClassifiedSection[];
}

function isFieldType(value: string): value is FieldType {
  return (FIELD_TYPES as string[]).includes(value);
}

/**
 * Turns text-layer blocks into a classified Form. This is the step
 * ARCHITECTURE.md §5.1 assigns to a model call — there is no local shortcut
 * for associating a label with what it's actually asking on a flat PDF.
 */
export async function classifyTextLayer(
  blocks: TextBlock[],
  fileName: string,
  pageCount: number,
): Promise<Form> {
  const sourceText = blocksToPlainText(blocks);

  const raw = await callOpenRouter([
    { role: "system", content: SYSTEM_PROMPT },
    { role: "user", content: sourceText },
  ]);

  const parsed = JSON.parse(raw) as ClassificationResponse;

  let fieldIndex = 0;
  const sections: Section[] = parsed.sections.map((section, sectionIndex) => ({
    id: `section_${sectionIndex}`,
    title: section.title,
    fields: section.fields.map((f): Field => {
      const id = `field_${fieldIndex++}`;
      const type = isFieldType(f.type) ? f.type : "unknown";
      return {
        id,
        label: f.label,
        spokenLabel: f.spokenLabel,
        help: f.help,
        type,
        required: f.required,
        constraints: f.options ? { options: f.options } : {},
        // Never let a bad/missing value from the model look more certain
        // than it is — clamp, and default to "uncertain" rather than "sure".
        sensitivity: "none",
        confidence: Number.isFinite(f.confidence) ? Math.min(1, Math.max(0, f.confidence)) : 0.3,
        anchor: { kind: "region", page: 0, rect: { x: 0, y: 0, width: 0, height: 0 } },
      };
    }),
  }));

  return {
    id: crypto.randomUUID(),
    title: fileName.replace(/\.pdf$/i, ""),
    source: "pdf",
    locale: "en-GB",
    provenance: {
      capturedAt: new Date().toISOString(),
      pageCount,
      extractor: "pdfjs-textlayer+openrouter",
      modelVersion: "anthropic/claude-sonnet-4.5",
      localOnly: false,
    },
    sections,
  };
}

/** Reading order: top of page first, then left to right within a line. Mirrors src/app/review/page.tsx's orderedText. */
function blocksToPlainText(blocks: TextBlock[]): string {
  const byPage = new Map<number, TextBlock[]>();
  for (const block of blocks) {
    const list = byPage.get(block.page) ?? [];
    list.push(block);
    byPage.set(block.page, list);
  }

  const pages = [...byPage.entries()].sort(([a], [b]) => a - b);

  return pages
    .map(([page, pageBlocks]) => {
      const sorted = [...pageBlocks].sort((a, b) => a.y - b.y || a.x - b.x);
      const lines: string[][] = [];
      let currentY: number | null = null;

      for (const block of sorted) {
        if (currentY === null || Math.abs(block.y - currentY) > block.height * 0.5) {
          lines.push([]);
          currentY = block.y;
        }
        lines[lines.length - 1]!.push(block.text);
      }

      return `--- Page ${page} ---\n${lines.map((line) => line.join(" ")).join("\n")}`;
    })
    .join("\n\n");
}
