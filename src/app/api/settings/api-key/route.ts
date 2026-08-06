import { NextResponse } from "next/server";
import { clearApiKey, hasApiKey, saveApiKey } from "@/lib/server/api-key-store";

const MAX_KEY_LENGTH = 200;

/** Whether a key is currently saved. Never returns the key itself. */
export async function GET() {
  return NextResponse.json({ connected: await hasApiKey() });
}

/** Encrypts and stores the OpenRouter API key in an httpOnly cookie. */
export async function POST(request: Request) {
  let body: { apiKey?: unknown };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
  }

  const apiKey = typeof body.apiKey === "string" ? body.apiKey.trim() : "";
  if (!apiKey) {
    return NextResponse.json({ error: "API key is required." }, { status: 400 });
  }
  if (apiKey.length > MAX_KEY_LENGTH) {
    return NextResponse.json({ error: "That doesn't look like a valid API key." }, { status: 400 });
  }

  try {
    await saveApiKey(apiKey);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Could not save the key.";
    return NextResponse.json({ error: message }, { status: 500 });
  }

  return NextResponse.json({ connected: true });
}

/** Removes the stored key. */
export async function DELETE() {
  await clearApiKey();
  return NextResponse.json({ connected: false });
}
