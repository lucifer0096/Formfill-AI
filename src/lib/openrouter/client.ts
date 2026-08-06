/**
 * Minimal OpenRouter client. Server-side only — never import this from a
 * "use client" component, the API key must not reach the browser bundle.
 * OpenRouter exposes an OpenAI-compatible chat completions endpoint, so no
 * SDK is needed for a single call shape like this.
 */
import { Agent, fetch as undiciFetch } from "undici";

const OPENROUTER_URL = "https://openrouter.ai/api/v1/chat/completions";

// Node's global fetch is built on undici, whose default Agent has a 300s
// headersTimeout — the same root cause diagnosed in scripts/model-test-lib.ts
// for the local Ollama tooling (see that file's comment for the full
// writeup). A bare "fetch failed" seen retrying residential-tenancy-agreement
// through scripts/online-test-lib.ts (2026-08-04, §04d retry round) at 76s —
// under the 300s default — shows a *different* undici-level timeout can
// still fire unpredictably under real network conditions (e.g. a stalled
// connection) even when comfortably inside both this app's own timeoutMs
// and undici's 300s default. Using a dedicated Agent with an explicit,
// generous headersTimeout/bodyTimeout removes that ambiguity entirely,
// leaving AbortSignal.timeout as the only intended timeout mechanism.
const LONG_HEADERS_TIMEOUT_MS = 10 * 60 * 1000; // well above any realistic OpenRouter response time
const longRunningAgent = new Agent({
  headersTimeout: LONG_HEADERS_TIMEOUT_MS,
  bodyTimeout: LONG_HEADERS_TIMEOUT_MS,
});

/**
 * Nigel's original recommendation was google/gemma-3-27b-it. Real-form
 * testing (docs/MODELS.html §04-§04e) validated the Gemma 4 family first —
 * google/gemma-4-26b-a4b-it:free produced consistently accurate results
 * and it's free, but has a known gap: reliably fails on official NZ
 * government forms specifically (see docs/KNOWN-ISSUES.html).
 *
 * A later head-to-head (MODELS.html §06b, 2026-08-05) tested Nigel's
 * original pick directly: gemma-3-27b-it came back clean on every one of
 * 5 real forms (no accuracy regression vs. the free model), and paid
 * models in general resolved the free model's timeout problem on long
 * forms (confirmed: a 26-page form that failed 3× free succeeded in 5.3s
 * on a paid model). If switching to paid for reliability on long/complex
 * forms, gemma-3-27b-it is the evidence-backed choice — not every paid
 * model tested was a clean upgrade (some showed real accuracy
 * regressions, see KNOWN-ISSUES.html).
 */
export const CLASSIFICATION_MODEL = "google/gemma-4-26b-a4b-it:free";

/**
 * A second, independent model used only to sanity-check a filled-out form
 * before final output (Nigel's "different model checks the work" reliability
 * pass) — deliberately not the same model that did the classification, so
 * the same blind spot can't pass its own check. Text-only (no vision) and
 * low-token (just field labels + answers), so a free model is a strong fit.
 *
 * Nigel suggested a free DeepSeek model specifically, but no DeepSeek
 * listing on OpenRouter is currently free (checked 2026-08-04 against the
 * live models API — cheapest paid is deepseek/deepseek-v4-flash-0731 at
 * $0.09/M in). nvidia/nemotron-3-super-120b-a12b:free is the closest
 * substitute that still satisfies the actual requirement: free, genuinely
 * different model family from CLASSIFICATION_MODEL (Gemma), and large
 * enough (120B) to be a real reasoning check rather than a token-saving
 * shortcut. Revisit if a free DeepSeek tier appears later.
 */
export const VERIFICATION_MODEL = "nvidia/nemotron-3-super-120b-a12b:free";

export interface ChatMessage {
  role: "system" | "user" | "assistant";
  content: string | ChatContentPart[];
}

export type ChatContentPart =
  | { type: "text"; text: string }
  | { type: "image_url"; image_url: { url: string } }
  | { type: "file"; file: { filename: string; file_data: string } };

interface OpenRouterResponse {
  choices: { message: { content: string } }[];
}

interface OpenRouterResponseWithUsage extends OpenRouterResponse {
  usage?: { cost?: number };
}

export interface CallOpenRouterResult {
  content: string;
  costUsd?: number;
}

export async function callOpenRouter(
  messages: ChatMessage[],
  options?: { model?: string; timeoutMs?: number },
): Promise<string> {
  const result = await callOpenRouterWithUsage(messages, options);
  return result.content;
}

// Statuses observed to be transient in real testing (docs/MODELS.html
// §04c-§04e): 429 (free-tier rate limit — models_a-31b was rate-limited on
// 14/16 attempts in the cloud batch, but the *same* files succeeded on
// retry once alone), 502 (OpenRouter's Mistral-OCR PDF pre-processing step
// going down independently of any model — confirmed by a retry succeeding
// on the exact file that failed), 504 (upstream timeout/gateway). Not
// retried by default: 400/401/403 (bad request, auth, permission —
// retrying usually changes nothing) or a missing/malformed response body
// (a model or parsing problem, not a network one).
const RETRYABLE_STATUSES = new Set([429, 502, 504]);

// One specific 400 IS worth retrying: "Failed to parse" is OpenRouter's
// Mistral-OCR PDF pre-processing step rejecting the file before any model
// sees it — the same underlying outage as the 502 case above, just
// surfaced as a 400 instead. Confirmed transient: the exact form that hit
// this retried successfully, unmodified, minutes later (docs/MODELS.html
// §04e). A genuinely malformed request (bad model name, invalid payload)
// would fail with a different message and isn't matched by this.
const RETRYABLE_400_MESSAGE = /failed to parse/i;

const RETRY_DELAY_MS = 3_000;

async function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/** Same as callOpenRouter but also surfaces OpenRouter's reported per-call cost, for tooling that needs to track real spend (e.g. scripts/online-test-lib.ts). */
export async function callOpenRouterWithUsage(
  messages: ChatMessage[],
  options?: { model?: string; timeoutMs?: number },
): Promise<CallOpenRouterResult> {
  const apiKey = process.env.OPENROUTER_API_KEY;
  if (!apiKey) {
    throw new Error(
      "OPENROUTER_API_KEY is not set. Copy .env.local.example to .env.local and add your key.",
    );
  }

  for (let attempt = 0; attempt <= 1; attempt += 1) {
    if (attempt > 0) await sleep(RETRY_DELAY_MS);

    const response = await undiciFetch(OPENROUTER_URL, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: options?.model ?? CLASSIFICATION_MODEL,
        messages,
        response_format: { type: "json_object" },
        usage: { include: true },
      }),
      dispatcher: longRunningAgent,
      signal: options?.timeoutMs ? AbortSignal.timeout(options.timeoutMs) : undefined,
    }).catch((error): null => {
      // A thrown network/timeout error (not an HTTP status — e.g. the
      // AbortSignal firing, or a genuine connection failure). Treated the
      // same as a retryable status code below: null signals "try again if
      // there's an attempt left," and the real error is re-thrown once
      // attempts are exhausted.
      if (attempt === 0) return null;
      throw error instanceof Error ? error : new Error(String(error));
    });
    if (response === null) continue;

    if (!response.ok) {
      if (attempt === 0 && RETRYABLE_STATUSES.has(response.status)) continue;
      const body = await response.text();
      if (attempt === 0 && response.status === 400 && RETRYABLE_400_MESSAGE.test(body)) continue;
      throw new Error(`OpenRouter request failed (${response.status}): ${body}`);
    }

    const data = (await response.json()) as OpenRouterResponseWithUsage;
    // A 200 response with a missing/empty `choices` array (not just a
    // missing message.content) is real, observed behavior — confirmed live
    // on rahul immediately after a 429 rate-limit event upstream — not a
    // hypothetical. data.choices[0] on an undefined/empty array throws
    // before the ?. on .message ever runs, so `choices` itself needs its
    // own guard, not just the element access.
    const content = data.choices?.[0]?.message?.content;
    if (!content) throw new Error("OpenRouter returned no content.");
    return { content, costUsd: data.usage?.cost };
  }

  throw new Error("OpenRouter request failed after retry.");
}

/**
 * Every prompt in this app says "no markdown fencing," but not every model
 * honors that — confirmed directly: anthropic/claude-haiku-4.5 wrapped its
 * JSON in ```json fences on 5/5 real test calls (2026-08-05 paid-model
 * comparison), despite the instruction. A bare JSON.parse(raw) on that
 * output throws, which is exactly the kind of thing that should degrade
 * gracefully (or at least fail with a clear cause) rather than crash
 * classification/verification outright the day a model's behavior changes.
 * Strips a single leading/trailing fenced code block (```json or ```) if
 * present, then parses — a no-op for a model that already complies.
 */
export function parseJsonResponse<T>(raw: string): T {
  const fenced = raw.trim().match(/^```(?:json)?\s*\n([\s\S]*?)\n?```$/i);
  const cleaned = fenced ? fenced[1] : raw;
  return JSON.parse(cleaned) as T;
}
