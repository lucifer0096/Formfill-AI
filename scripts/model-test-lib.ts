/**
 * Shared logic for the local model test tooling — used by both
 * test-local-models.ts (CLI) and test-ui-server.ts (browser UI). Not part
 * of the app; nothing under src/ imports this.
 */
import { readFile } from "node:fs/promises";

export const OLLAMA_URL = process.env.OLLAMA_URL ?? "http://localhost:11434";

// Kept in sync by hand with the local models pulled for this comparison —
// see docs/MODELS.html §03 for the reasoning behind this specific set.
export const DEFAULT_MODELS = [
  "gemma4:e4b",
  "gemma4:26b",
  "gemma3:4b",
  "qwen2.5vl:3b",
  "qwen2.5vl:7b",
  "llama3.2-vision:11b",
  "minicpm-v",
];

const FIELD_TYPES = [
  "text", "longtext", "number", "currency", "date", "email", "phone",
  "name", "address", "choice", "multichoice", "boolean", "signature", "unknown",
];

// Copied by hand from src/lib/openrouter/classify-pdf.ts's SYSTEM_PROMPT —
// keep in sync manually if that prompt changes, so this test stays
// representative of what production actually sends. No acroFieldName
// context here since this harness doesn't run the local pdf-lib field
// enumeration step; it's testing raw visual field detection only.
export const SYSTEM_PROMPT = `You read a PDF form (attached as page images) and turn it into a structured list of questions a person would need to answer to fill it out.

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

/** Renders every page of a PDF (given as bytes, not a path) to base64 PNGs. */
export async function renderPdfBytesToPngs(bytes: Uint8Array): Promise<string[]> {
  const { createCanvas } = await import("@napi-rs/canvas");
  // Dynamic import: pdfjs-dist's legacy Node build needs to be loaded this
  // way to avoid pulling in browser-only globals at module-eval time.
  const pdfjs = await import("pdfjs-dist/legacy/build/pdf.mjs");
  const doc = await pdfjs.getDocument({ data: bytes }).promise;

  const pages: string[] = [];
  for (let pageNum = 1; pageNum <= doc.numPages; pageNum += 1) {
    const page = await doc.getPage(pageNum);
    const viewport = page.getViewport({ scale: 2 }); // 2x for legible text in the rendered image
    const canvas = createCanvas(viewport.width, viewport.height);
    const ctx = canvas.getContext("2d");

    await page.render({
      canvasContext: ctx as unknown as CanvasRenderingContext2D,
      viewport,
      canvas: canvas as unknown as HTMLCanvasElement,
    }).promise;

    pages.push(canvas.toDataURL("image/png").replace(/^data:image\/png;base64,/, ""));
  }
  return pages;
}

export async function renderPdfFileToPngs(pdfPath: string): Promise<string[]> {
  const bytes = await readFile(pdfPath);
  return renderPdfBytesToPngs(new Uint8Array(bytes));
}

interface OllamaChatResponse {
  message?: { content: string };
  error?: string;
}

export interface ModelRunResult {
  ok: boolean;
  raw: string;
  ms: number;
}

// Tuned for this machine: Intel i7-10610U (4C/8T mobile CPU), 32GB RAM,
// no usable GPU (Intel UHD, ~1GB VRAM) — every model runs on CPU. A
// ~26B-param model (gemma4:26b, ~17GB on disk) on this hardware is
// genuinely slow, plausibly 5-15+ minutes for a dense multi-page form
// image, not a sign anything is broken. Node's fetch has no timeout by
// default, but the underlying connection can still drop as "fetch failed"
// under some conditions well before a real result would arrive. An
// explicit, generous timeout makes a real timeout distinguishable from
// Ollama actually being down, instead of both looking like the same
// opaque error. Raise this further if even the smaller models
// (gemma3:4b, qwen2.5vl:3b) are timing out on a large form.
const REQUEST_TIMEOUT_MS = 20 * 60 * 1000; // 20 minutes

export async function runModel(model: string, images: string[]): Promise<ModelRunResult> {
  const start = Date.now();
  try {
    const response = await fetch(`${OLLAMA_URL}/api/chat`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        model,
        stream: false,
        format: "json",
        messages: [{ role: "user", content: SYSTEM_PROMPT, images }],
      }),
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    });
    const data = (await response.json()) as OllamaChatResponse;
    const ms = Date.now() - start;
    if (!response.ok || data.error) {
      return { ok: false, raw: data.error ?? `HTTP ${response.status}`, ms };
    }
    return { ok: true, raw: data.message?.content ?? "", ms };
  } catch (error) {
    const ms = Date.now() - start;
    const isTimeout = error instanceof Error && error.name === "TimeoutError";
    const message = isTimeout
      ? `Timed out after ${(REQUEST_TIMEOUT_MS / 1000).toFixed(0)}s — model may be too slow on this hardware, or Ollama isn't responding. Check 'ollama ps' and try again.`
      : error instanceof Error
        ? error.message
        : String(error);
    return { ok: false, raw: message, ms };
  }
}

export function tryParseJson(raw: string): unknown {
  try {
    return JSON.parse(raw);
  } catch {
    return undefined;
  }
}
