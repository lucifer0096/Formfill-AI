/**
 * Minimal OpenRouter client. Server-side only — never import this from a
 * "use client" component, the API key must not reach the browser bundle.
 * OpenRouter exposes an OpenAI-compatible chat completions endpoint, so no
 * SDK is needed for a single call shape like this.
 */
const OPENROUTER_URL = "https://openrouter.ai/api/v1/chat/completions";

/**
 * Chosen per the 2026-08-02 meeting with Nigel: forms now go straight to a
 * multimodal model instead of local text/AcroForm extraction, so the model
 * needs real vision capability, not just text. Gemma 3 27B via OpenRouter is
 * his recommendation — cheap (~$0.07/M input, ~$0.30/M output at time of
 * writing) and multimodal. Test locally against Ollama first (same model
 * family, e.g. `ollama pull gemma3:27b`) before spending on cloud calls;
 * swap this constant once real-form testing picks a final model.
 */
export const CLASSIFICATION_MODEL = "google/gemma-3-27b-it";

/**
 * A second, independent model used only to sanity-check a filled-out form
 * before final output (Nigel's "different model checks the work" reliability
 * pass) — deliberately not the same model that did the classification, so
 * the same blind spot can't pass its own check. Cheap text-only models are
 * fine here since there's no vision need at this stage.
 */
export const VERIFICATION_MODEL = "anthropic/claude-haiku-4.5";

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

  const response = await fetch(OPENROUTER_URL, {
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
    signal: options?.timeoutMs ? AbortSignal.timeout(options.timeoutMs) : undefined,
  });

  if (!response.ok) {
    const body = await response.text();
    throw new Error(`OpenRouter request failed (${response.status}): ${body}`);
  }

  const data = (await response.json()) as OpenRouterResponseWithUsage;
  const content = data.choices[0]?.message.content;
  if (!content) throw new Error("OpenRouter returned no content.");
  return { content, costUsd: data.usage?.cost };
}
