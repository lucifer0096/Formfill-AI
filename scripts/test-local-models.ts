/**
 * Local model accuracy test harness — NOT part of the app, never imported
 * by anything under src/. Run manually from a terminal while iterating on
 * which classification model to commit to (see docs/MODELS.html §03).
 *
 * What it does: renders each page of a real PDF to a PNG (Ollama's local
 * API only accepts images, not raw PDF bytes — unlike OpenRouter, which
 * accepts a `file` part for some providers; this is a real, permanent
 * difference between local testing and production, not a shortcut), sends
 * every page plus the EXACT SYSTEM_PROMPT from
 * src/lib/openrouter/classify-pdf.ts to each local Ollama model in turn,
 * and writes each model's raw JSON response to its own file so they can be
 * diffed side by side.
 *
 * Usage:
 *   npx tsx scripts/test-local-models.ts path/to/form.pdf
 *   npx tsx scripts/test-local-models.ts path/to/form.pdf --models=gemma4:26b,qwen2.5vl:7b
 *
 * Requires Ollama running locally (default http://localhost:11434) with
 * the models below already pulled.
 */
import { readFile, mkdir, writeFile } from "node:fs/promises";
import { basename, join, extname } from "node:path";
import { createCanvas } from "@napi-rs/canvas";

const OLLAMA_URL = process.env.OLLAMA_URL ?? "http://localhost:11434";

// Kept in sync by hand with the local models pulled for this comparison —
// see docs/MODELS.html §03 for the reasoning behind this specific set.
const DEFAULT_MODELS = [
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
// keep these in sync manually if that prompt changes, so this test stays
// representative of what production actually sends. No acroFieldName
// context here since this harness doesn't run the local pdf-lib field
// enumeration step; it's testing raw visual field detection only.
const SYSTEM_PROMPT = `You read a PDF form (attached as page images) and turn it into a structured list of questions a person would need to answer to fill it out.

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

async function renderPdfToPngs(pdfPath: string): Promise<string[]> {
  // Dynamic import: pdfjs-dist's legacy Node build needs to be loaded this
  // way to avoid pulling in browser-only globals at module-eval time.
  const pdfjs = await import("pdfjs-dist/legacy/build/pdf.mjs");
  const bytes = await readFile(pdfPath);
  const doc = await pdfjs.getDocument({ data: new Uint8Array(bytes) }).promise;

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

interface OllamaChatResponse {
  message?: { content: string };
  error?: string;
}

async function runModel(model: string, images: string[]): Promise<{ ok: boolean; raw: string; ms: number }> {
  const start = Date.now();
  try {
    const response = await fetch(`${OLLAMA_URL}/api/chat`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        model,
        stream: false,
        format: "json",
        messages: [
          { role: "user", content: SYSTEM_PROMPT, images },
        ],
      }),
    });
    const data = (await response.json()) as OllamaChatResponse;
    const ms = Date.now() - start;
    if (!response.ok || data.error) {
      return { ok: false, raw: data.error ?? `HTTP ${response.status}`, ms };
    }
    return { ok: true, raw: data.message?.content ?? "", ms };
  } catch (error) {
    return { ok: false, raw: error instanceof Error ? error.message : String(error), ms: Date.now() - start };
  }
}

async function main() {
  const [, , pdfPathArg, ...rest] = process.argv;
  if (!pdfPathArg) {
    console.error("Usage: npx tsx scripts/test-local-models.ts <path-to-pdf> [--models=a,b,c]");
    process.exit(1);
  }

  const modelsArg = rest.find((a) => a.startsWith("--models="));
  const models = modelsArg ? modelsArg.slice("--models=".length).split(",") : DEFAULT_MODELS;

  console.log(`Rendering ${pdfPathArg} to page images...`);
  const images = await renderPdfToPngs(pdfPathArg);
  console.log(`  ${images.length} page(s) rendered.`);

  const formName = basename(pdfPathArg, extname(pdfPathArg));
  const outDir = join("scripts", "results", formName);
  await mkdir(outDir, { recursive: true });

  for (const model of models) {
    console.log(`\nRunning ${model}...`);
    const result = await runModel(model, images);
    const status = result.ok ? "ok" : "FAILED";
    console.log(`  ${status} in ${(result.ms / 1000).toFixed(1)}s`);

    const safeName = model.replace(/[/:]/g, "_");
    const outFile = join(outDir, `${safeName}.json`);
    await writeFile(
      outFile,
      JSON.stringify({ model, ok: result.ok, ms: result.ms, response: tryParse(result.raw) ?? result.raw }, null, 2),
    );
    console.log(`  saved to ${outFile}`);
  }

  console.log(`\nDone. Compare outputs in ${outDir}/`);
}

function tryParse(raw: string): unknown {
  try {
    return JSON.parse(raw);
  } catch {
    return undefined;
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
