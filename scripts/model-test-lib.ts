/**
 * Shared logic for the local model test tooling — used by both
 * test-local-models.ts (CLI) and test-ui-server.ts (browser UI). Not part
 * of the app; nothing under src/ imports this.
 */
import { readFile } from "node:fs/promises";

export const OLLAMA_URL = process.env.OLLAMA_URL ?? "http://localhost:11434";

// Every locally-pulled model worth comparing — see docs/MODELS.html §03
// for the reasoning behind this set. Ordered smallest/fastest first: this
// machine has no usable GPU (Intel UHD, ~1GB VRAM), so every model runs on
// a 4C/8T mobile CPU (i7-10610U) and parameter count is the dominant
// factor in response time. All 8 are listed here so the UI/CLI can offer
// every model (e.g. for a group demo), but see SAFE_DEFAULT_MODELS below
// for which ones are pre-selected by default.
export const ALL_MODELS = [
  "gemma3:4b",           // ~4.3B params, smallest/fastest
  "qwen2.5vl:3b",         // ~3B params
  "gemma4:e4b",           // "effective 4B" — small/fast by design
  "qwen2.5vl:7b",         // ~7B params
  "minicpm-v",            // ~7.6B params
  "llama3.2-vision:11b",  // ~11B params
  "gemma4:26b",           // ~26B params, by far the slowest/heaviest on this hardware
];

// Running several models here, even sequentially, has caused real system
// slowdowns (orphaned llama-server processes piling up after an
// interrupted run — see runModel's unloadModel calls below for the actual
// fix). As a second layer of safety on top of that, only the single
// smallest model is pre-checked/run by default — the rest are still fully
// available (in ALL_MODELS, and as UI checkboxes), just not auto-selected,
// so a run can't accidentally include more than one model, let alone the
// heaviest ones, unless chosen deliberately.
export const SAFE_DEFAULT_MODELS = ["gemma3:4b"];

// Back-compat name — CLI's `models` arg (no --models= override) uses this.
export const DEFAULT_MODELS = SAFE_DEFAULT_MODELS;

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

/**
 * Unloads a model from memory immediately (keep_alive: 0 tells Ollama not
 * to keep it resident after responding). Best-effort — failures here are
 * swallowed, since this is a cleanup step, not the actual test; a failed
 * unload shouldn't mask or replace the real result. Safe to call with no
 * model loaded at all.
 */
async function unloadModel(model: string): Promise<void> {
  try {
    await fetch(`${OLLAMA_URL}/api/generate`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ model, keep_alive: 0 }),
      signal: AbortSignal.timeout(30_000),
    });
  } catch {
    // Best-effort — if Ollama itself is unresponsive, there's nothing more
    // to do here; the caller's own request will surface that separately.
  }
}

/** Asks Ollama what's currently loaded, so a caller can unload leftovers from a crashed/interrupted prior run before starting a new one. */
export async function listLoadedModels(): Promise<string[]> {
  try {
    const response = await fetch(`${OLLAMA_URL}/api/ps`, { signal: AbortSignal.timeout(10_000) });
    const data = (await response.json()) as { models?: { name: string }[] };
    return (data.models ?? []).map((m) => m.name);
  } catch {
    return [];
  }
}

/**
 * Unloads every currently-loaded model. Call this before starting a run —
 * a prior run that was interrupted (browser tab closed mid-request, server
 * restarted) can leave a model's llama-server process resident, and on a
 * CPU-only machine with no VRAM headroom, letting those pile up is exactly
 * what caused real system slowdowns during testing (three orphaned
 * llama-server processes using ~19GB combined, confirmed via `ollama ps`).
 */
export async function unloadAllModels(): Promise<void> {
  const loaded = await listLoadedModels();
  await Promise.all(loaded.map((m) => unloadModel(m)));
}

const UNLOAD_POLL_INTERVAL_MS = 2_000;
const UNLOAD_WAIT_TIMEOUT_MS = 60_000;

/**
 * Unloads a model and actually waits (polling `ollama ps`) until it no
 * longer shows as loaded, instead of firing the unload request and
 * trusting it worked. On a RAM-constrained CPU-only machine, moving on to
 * the next model before the previous one's memory is genuinely freed is
 * the exact failure mode that caused real slowdowns — this makes "next
 * model starts" and "previous model's RAM is freed" actually sequential,
 * not just requested-in-order. Gives up after UNLOAD_WAIT_TIMEOUT_MS
 * rather than hanging forever if Ollama itself is stuck.
 */
export async function unloadModelAndWait(model: string): Promise<void> {
  await unloadModel(model);
  const deadline = Date.now() + UNLOAD_WAIT_TIMEOUT_MS;
  while (Date.now() < deadline) {
    const loaded = await listLoadedModels();
    if (!loaded.includes(model)) return;
    await new Promise((resolve) => setTimeout(resolve, UNLOAD_POLL_INTERVAL_MS));
  }
  // Timed out waiting — proceed anyway rather than hang the whole run;
  // the next runModel() call will still try its own unload/keep_alive:0.
}

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
        keep_alive: 0, // unload immediately after this response, don't linger resident
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
  } finally {
    // keep_alive:0 above should already unload it, but a timed-out or
    // failed request may never have reached Ollama in a state where that
    // took effect — explicitly unload again as a backstop. Never skipped,
    // including on the error path, since a leaked model is the actual
    // system-slowdown risk this whole function exists to prevent.
    //
    // Waits for the unload to actually complete (polls `ollama ps`) rather
    // than firing the request and returning immediately — this is what
    // makes runModel() genuinely block until this model's RAM is freed
    // before the caller's loop starts the next one, not just "requested
    // unload, moved on."
    await unloadModelAndWait(model);
  }
}

export function tryParseJson(raw: string): unknown {
  try {
    return JSON.parse(raw);
  } catch {
    return undefined;
  }
}
