import { NextResponse } from "next/server";
import { verifyAnswers } from "@/lib/openrouter/verify-answers";
import type { AnswerSet, Field } from "@/lib/form-model/types";

/**
 * Second-pass reliability check, per the 2026-08-02 meeting with Nigel — see
 * src/lib/openrouter/verify-answers.ts for the reasoning. Kept as its own
 * route rather than folded into /api/understand or called directly from a
 * page component, so either the current UI (branch rahul) or Arya's UI can
 * call it independently once wired in.
 */
export async function POST(request: Request) {
  let body: { fields: Field[]; answers: AnswerSet };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
  }

  if (!Array.isArray(body.fields) || !body.answers) {
    return NextResponse.json({ error: "fields and answers are required." }, { status: 400 });
  }

  try {
    const result = await verifyAnswers(body.fields, body.answers);
    return NextResponse.json(result);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Verification failed.";
    return NextResponse.json({ error: message }, { status: 502 });
  }
}
