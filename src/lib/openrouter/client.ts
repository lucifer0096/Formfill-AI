/**
 * Minimal OpenRouter client. Server-side only — never import this from a
 * "use client" component, the API key must not reach the browser bundle.
 * OpenRouter exposes an OpenAI-compatible chat completions endpoint, so no
 * SDK is needed for a single call shape like this.
 */
const OPENROUTER_URL = "https://openrouter.ai/api/v1/chat/completions";

/** Hardcoded for now to get the pipeline working; revisit static-vs-dynamic model selection later. */
export const CLASSIFICATION_MODEL = "anthropic/claude-sonnet-4.5";

export interface ChatMessage {
  role: "system" | "user" | "assistant";
  content: string;
}

interface OpenRouterResponse {
  choices: { message: { content: string } }[];
}

export async function callOpenRouter(messages: ChatMessage[]): Promise<string> {
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
      model: CLASSIFICATION_MODEL,
      messages,
      response_format: { type: "json_object" },
    }),
  });

  if (!response.ok) {
    const body = await response.text();
    throw new Error(`OpenRouter request failed (${response.status}): ${body}`);
  }

  const data = (await response.json()) as OpenRouterResponse;
  const content = data.choices[0]?.message.content;
  if (!content) throw new Error("OpenRouter returned no content.");
  return content;
}
