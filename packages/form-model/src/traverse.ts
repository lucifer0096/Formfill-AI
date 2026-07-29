import type { Answer, AnswerSet, Condition, Field, Form } from './types.js';

/** All fields in reading order, flattened across sections. */
export function allFields(form: Form): Field[] {
  return form.sections.flatMap((s) => s.fields);
}

export function fieldById(form: Form, id: string): Field | undefined {
  return allFields(form).find((f) => f.id === id);
}

export function sectionOf(form: Form, fieldId: string) {
  return form.sections.find((s) => s.fields.some((f) => f.id === fieldId));
}

function isAnswered(a: Answer | undefined): boolean {
  if (!a) return false;
  if (a.state === 'empty' || a.state === 'skipped') return false;
  if (a.value === null || a.value === '') return false;
  if (Array.isArray(a.value) && a.value.length === 0) return false;
  return true;
}

/** Evaluate skip logic. Unknown references resolve to `true` (ask, don't hide). */
export function conditionMet(cond: Condition | undefined, answers: AnswerSet): boolean {
  if (!cond) return true;
  const answer = answers[cond.fieldId];
  switch (cond.op) {
    case 'isAnswered':
      return isAnswered(answer);
    case 'isEmpty':
      return !isAnswered(answer);
    case 'equals':
      return String(answer?.value ?? '') === String(cond.value ?? '');
    case 'notEquals':
      return String(answer?.value ?? '') !== String(cond.value ?? '');
  }
}

/** Fields currently applicable given the answers so far, in reading order. */
export function applicableFields(form: Form, answers: AnswerSet): Field[] {
  return allFields(form).filter((f) => conditionMet(f.dependsOn, answers));
}

/** Required, applicable fields that still have no usable answer. */
export function outstandingFields(form: Form, answers: AnswerSet): Field[] {
  return applicableFields(form, answers).filter(
    (f) => f.required && !isAnswered(answers[f.id]),
  );
}

/** Fields the user should look at again: low confidence, skipped, or unresolved. */
export function needsAttention(
  form: Form,
  answers: AnswerSet,
  confidenceThreshold = 0.6,
): Field[] {
  return applicableFields(form, answers).filter((f) => {
    const a = answers[f.id];
    if (a?.state === 'skipped' || a?.state === 'needsReview') return true;
    if (f.confidence < confidenceThreshold) return true;
    if (f.type === 'signature') return true;
    return f.required && !isAnswered(a);
  });
}

export { isAnswered };
