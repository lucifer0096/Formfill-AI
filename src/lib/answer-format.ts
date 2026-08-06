import type { Field, FieldOption } from "@/lib/form-model";

/** Renders a stored answer as plain text. Empty string for "nothing yet" — callers decide the fallback wording. */
export function answerToText(value: Field["answer"]): string {
  if (typeof value === "string") return value;
  if (Array.isArray(value)) return value.join(", ");
  if (value === true) return "Yes";
  if (value === false) return "No";
  return "";
}

/**
 * Whether a boolean field's option represents "true". The model isn't
 * constrained to literally use "true"/"false" as option values (it might
 * return {value: "yes", label: "Yes"}), so a strict `option.value === "true"`
 * comparison silently mis-stores the answer whenever the model phrases it
 * differently. Recognizes common affirmative/negative wording first, then
 * falls back to "first option is the affirmative one" (matches how forms are
 * conventionally printed, and this module's own default Yes/No pair).
 * Shared by AnswerControl (storing the answer) and fillAcroForm (deciding a
 * matched checkbox's checked state) so both agree on the same field's boolean.
 */
export function isAffirmativeOption(option: FieldOption, index: number): boolean {
  const value = option.value.trim().toLowerCase();
  const label = option.label.trim().toLowerCase();
  if (["true", "yes", "y"].includes(value) || label === "yes") return true;
  if (["false", "no", "n"].includes(value) || label === "no") return false;
  return index === 0;
}
