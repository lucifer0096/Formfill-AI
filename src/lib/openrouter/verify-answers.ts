import type { AnswerSet, Field } from "@/lib/form-model/types";
import { callOpenRouter, parseJsonResponse, VERIFICATION_MODEL } from "./client";

/**
 * Second-pass reliability check per the 2026-08-02 meeting with Nigel:
 * "you should use a different model as well, and your different model
 * should check at the end, once you've filled out the form... to make sure
 * that you've done a good job." Deliberately a different model from
 * classification (VERIFICATION_MODEL, not CLASSIFICATION_MODEL) so the same
 * blind spot can't pass its own check.
 *
 * Text-only — no PDF/image needed here, just the field labels and the
 * answers about to be submitted, so this stays cheap regardless of which
 * model was used to classify the form.
 */

export interface VerificationIssue {
  fieldId: string;
  label: string;
  concern: string;
}

export interface VerificationResult {
  ok: boolean;
  issues: VerificationIssue[];
}

const SYSTEM_PROMPT = `You are the last check before a filled-out form is submitted. You will be given a list of questions and the answers a person gave for each. Check for genuine problems only:

- An answer that clearly doesn't match what the question asked (e.g. a name in a date field, a phone number in an email field).
- An answer that's internally inconsistent with another answer on the same form (e.g. a date of birth that would make someone impossibly old, or contradictory yes/no answers to related questions).
- An answer left in an obviously wrong format that a strict field on the real form is likely to reject (e.g. letters in a postcode field).

Do NOT flag: answers that are just short or plain, low-effort but valid answers ("N/A" for an optional field), or stylistic choices. This is a safety net for real mistakes, not a style check — flag sparingly, only when you're genuinely confident something is wrong.

Respond with ONLY a JSON object of this exact shape, no markdown fencing, no commentary:
{
  "ok": boolean,
  "issues": [
    {"fieldId": "string", "label": "string", "concern": "one sentence, plain language, said directly to the person filling the form"}
  ]
}
"ok" is true only when "issues" is empty.`;

export async function verifyAnswers(fields: Field[], answers: AnswerSet): Promise<VerificationResult> {
  const rows = fields
    .map((f) => {
      const answer = answers[f.id];
      const value = answer?.value;
      if (value === null || value === undefined || value === "") return null;
      return { fieldId: f.id, label: f.label, type: f.type, value };
    })
    .filter((r): r is NonNullable<typeof r> => r !== null);

  if (rows.length === 0) return { ok: true, issues: [] };

  const raw = await callOpenRouter(
    [
      { role: "system", content: SYSTEM_PROMPT },
      { role: "user", content: JSON.stringify(rows) },
    ],
    { model: VERIFICATION_MODEL },
  );

  const parsed = parseJsonResponse<unknown>(raw);
  const obj = parsed && typeof parsed === "object" ? (parsed as Record<string, unknown>) : {};
  // Same defensive-normalization reasoning as classify-pdf.ts's
  // normalizeClassificationResponse: an issue object with a missing or
  // non-string field would otherwise reach the confirm page's banner
  // (src/app/confirm/page.tsx) unvalidated. Verification is already
  // best-effort and never blocks the download on its own failure, so a
  // malformed issue is dropped rather than the whole result discarded.
  const issues: VerificationIssue[] = Array.isArray(obj.issues)
    ? obj.issues
        .filter((i): i is Record<string, unknown> => Boolean(i) && typeof i === "object")
        .filter((i) => typeof i.fieldId === "string" && typeof i.label === "string" && typeof i.concern === "string")
        .map((i) => ({ fieldId: i.fieldId as string, label: i.label as string, concern: i.concern as string }))
    : [];
  return {
    ok: Boolean(obj.ok) && issues.length === 0,
    issues,
  };
}
