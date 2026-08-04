/**
 * Shared logic for the local model test tooling — used by both
 * test-local-models.ts (CLI) and test-ui-server.ts (browser UI). Not part
 * of the app; nothing under src/ imports this.
 */
import { readFile } from "node:fs/promises";
import { Agent, fetch as undiciFetch } from "undici";

export const OLLAMA_URL = process.env.OLLAMA_URL ?? "http://localhost:11434";

// Shrunk after the 2026-08-04 test cycle (see docs/MODELS.html §04 for the
// full results table) — this is no longer "every model worth comparing",
// it's the models that earned a further look on the next real form:
//   - gemma3:4b: the only confirmed-correct result (628s, clean structure).
//   - gemma4:e4b: same family as the one confirmed win, worth a retest —
//     previously failed with a wrong "no PDF received" response rather
//     than a timeout, so a single earlier run isn't enough to rule it out.
//   - qwen2.5vl:7b, gemma4:26b: timed out at the 20-minute cap used for
//     that cycle, but `ollama ps` confirmed both stayed genuinely active
//     the whole time, not stuck — unresolved, not ruled out, and worth a
//     retest now that REQUEST_TIMEOUT_MS is 60 minutes. gemma4:26b is also
//     the mentor's own recommendation.
// Dropped, not deleted from history: qwen2.5vl:3b and minicpm-v both
// finished but produced wrong or schema-breaking output — real
// correctness failures, not something a longer timeout fixes.
// llama3.2-vision:11b hit a hard Ollama build incompatibility (unsupported
// 'mllama' architecture) unrelated to timeout or prompting. Restore any of
// these individually via --models= (CLI) or by typing the name into the
// UI if a reason comes up to revisit one specifically.
export const ALL_MODELS = [
  "gemma3:4b",     // ~4.3B params, confirmed working — best result so far
  "gemma4:e4b",     // ~8B params, worth a retest: previously failed with a
                     // "no PDF received" response rather than a timeout,
                     // so a longer timeout won't fix it if reproducible,
                     // but a single run isn't enough to rule it out either
  "qwen2.5vl:7b",   // ~7B params, unresolved — retest at 60 min
  "gemma4:26b",     // ~26B params, unresolved — retest at 60 min, mentor's pick
];

// Running several models here, even sequentially, previously caused real
// system slowdowns — not because of batching itself, but because the
// unload between models was fire-and-forget (requested, not confirmed),
// so a slow/failed unload let the next model start on top of the last
// one's still-resident memory. runModel()'s cleanup now waits (polls
// `ollama ps`) until each model is actually confirmed unloaded before
// returning — see unloadModelAndWait below — which is what makes running
// the full ALL_MODELS batch in one go safe again. Kept as a separate name
// from ALL_MODELS in case a narrower "quick smoke test" default is wanted
// later; currently just the same full list.
export const SAFE_DEFAULT_MODELS = ALL_MODELS;

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
// ~4-8B-param model here has been observed taking just over 5 minutes for
// a single form image; a ~26B model can take much longer. Not a sign
// anything is broken.
//
// ROOT CAUSE this actually fixes: Node's global fetch is built on undici,
// whose default Agent has a 300s (5-minute) headersTimeout — the time
// allowed for the server to finish sending response headers. Ollama with
// stream:false only sends headers once generation is FULLY done, so any
// model taking longer than 5 minutes hit this and failed with a bare
// "fetch failed", regardless of the AbortSignal.timeout below (that's a
// separate, higher-level abort — the undici default fires first and
// can't be configured through it). Confirmed via repeated real runs: 3
// different models all failed at ~304s with the same generic message,
// which is undici's headersTimeout, not this file's own timeout value.
//
// Fix: use undici's fetch directly with an Agent whose headersTimeout and
// bodyTimeout are both raised to match REQUEST_TIMEOUT_MS, instead of the
// global fetch (which can't have its Agent reconfigured after the fact).
//
// Raised from 20 to 60 minutes after a real test cycle: on
// FHP-Statutory-Declaration-Form, qwen2.5vl:3b, qwen2.5vl:7b, and
// gemma4:26b all hit the 20-minute cap without finishing (confirmed via
// `ollama ps` staying warm/active the whole time, not stuck) — genuinely
// still working, just slower than 20 minutes allowed for on this
// CPU-only hardware, not stuck or broken.
const REQUEST_TIMEOUT_MS = 60 * 60 * 1000; // 60 minutes

const longRunningAgent = new Agent({
  headersTimeout: REQUEST_TIMEOUT_MS,
  bodyTimeout: REQUEST_TIMEOUT_MS,
});

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
    // undiciFetch + longRunningAgent, not the global fetch — see that
    // constant's comment for why this matters (undici's default 300s
    // headersTimeout was silently failing every model that took longer
    // than 5 minutes, before this REQUEST_TIMEOUT_MS ever got a chance to
    // apply).
    const response = await undiciFetch(`${OLLAMA_URL}/api/chat`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        model,
        stream: false,
        format: "json",
        keep_alive: 0, // unload immediately after this response, don't linger resident
        messages: [{ role: "user", content: SYSTEM_PROMPT, images }],
      }),
      dispatcher: longRunningAgent,
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
