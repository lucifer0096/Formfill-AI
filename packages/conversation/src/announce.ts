import type { Answer, Field } from '@formfill/form-model';

/**
 * Announcements are the engine's only output. The engine never speaks and never
 * touches the DOM — the presentation layer decides whether an announcement
 * becomes an ARIA live region update, a spoken utterance, or both, depending on
 * whether a screen reader is present. See docs/ACCESSIBILITY.md §1.
 */
export interface Announcement {
  text: string;
  priority: 'polite' | 'assertive';
  /** Whether a later announcement may cut this one off mid-sentence. */
  interruptible: boolean;
  /** Debug/test tag. Never spoken. */
  kind: AnnouncementKind;
}

export type AnnouncementKind =
  | 'intro'
  | 'question'
  | 'hint'
  | 'help'
  | 'verbatim'
  | 'suggestion'
  | 'accepted'
  | 'error'
  | 'progress'
  | 'section'
  | 'review'
  | 'summary'
  | 'complete';

export const say = (
  kind: AnnouncementKind,
  text: string,
  priority: Announcement['priority'] = 'polite',
  interruptible = true,
): Announcement => ({ kind, text, priority, interruptible });

/* -------------------------------------------------------------------------- */
/* Speaking values naturally                                                   */
/* -------------------------------------------------------------------------- */

const MONTHS = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];

function ordinal(n: number): string {
  const s = ['th', 'st', 'nd', 'rd'];
  const v = n % 100;
  return n + (s[(v - 20) % 10] ?? s[v] ?? s[0]!);
}

/**
 * Renders a stored value the way a person would say it. "1954-03-03" read out
 * as digits is unintelligible; as "the 3rd of March 1954" it is unambiguous —
 * which matters most at review, where the user is checking for errors by ear.
 */
export function speakValue(
  field: Field,
  value: Answer['value'],
  locale = 'en-GB',
): string {
  if (value === null || value === '') return 'not answered';
  if (typeof value === 'boolean') return value ? 'yes' : 'no';

  if (Array.isArray(value)) {
    const labels = value.map((v) => optionLabel(field, v));
    if (labels.length === 0) return 'nothing selected';
    if (labels.length === 1) return labels[0]!;
    return `${labels.slice(0, -1).join(', ')} and ${labels.at(-1)}`;
  }

  switch (field.type) {
    case 'date': {
      const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
      if (!m) return value;
      const day = Number(m[3]);
      const month = MONTHS[Number(m[2]) - 1];
      return locale.startsWith('en-US')
        ? `${month} ${ordinal(day)}, ${m[1]}`
        : `the ${ordinal(day)} of ${month} ${m[1]}`;
    }
    case 'currency': {
      const n = Number(value);
      if (Number.isNaN(n)) return value;
      const symbol = locale.startsWith('en-US') ? 'dollars' : 'pounds';
      return `${n.toLocaleString(locale)} ${symbol}`;
    }
    case 'choice':
      return optionLabel(field, value);
    case 'email':
      // Screen readers and TTS both mangle these; spell out the structure.
      return value.replace('@', ' at ').replace(/\./g, ' dot ');
    default:
      return value;
  }
}

function optionLabel(field: Field, value: string): string {
  const opt = field.constraints.options?.find((o) => o.value === value);
  return opt?.spokenLabel ?? opt?.label ?? value;
}

/* -------------------------------------------------------------------------- */
/* Question phrasing                                                           */
/* -------------------------------------------------------------------------- */

/**
 * Ensures a fragment ends in terminal punctuation before it is concatenated
 * with another. Without this, "Signature" + "This one is optional." is spoken
 * as one run-on breath. Labels come from OCR and model output, so we cannot
 * assume they are punctuated.
 */
export function terminated(text: string): string {
  const trimmed = text.trim();
  return /[.?!]$/.test(trimmed) ? trimmed : `${trimmed}.`;
}

/**
 * Read-back after an answer is accepted. Deliberately NOT "label: value" —
 * a spoken colon after a question mark ("What is your full name?: Priya")
 * is jarring, and TTS engines render it inconsistently.
 */
export function confirmationText(field: Field, spokenValue: string): string {
  return `${terminated(field.spokenLabel)} ${terminated(spokenValue)}`;
}

export function questionText(field: Field, position: number, total: number): string {
  const parts: string[] = [`Question ${position} of ${total}.`, terminated(field.spokenLabel)];

  if (field.type === 'choice' || field.type === 'multichoice') {
    const opts = field.constraints.options ?? [];
    const list = opts
      .map((o, i) => `${i + 1}, ${o.spokenLabel ?? o.label}`)
      .join('. ');
    parts.push(
      field.type === 'multichoice'
        ? `Choose any that apply. ${list}.`
        : `Choose one. ${list}.`,
    );
  } else if (field.formatHint) {
    parts.push(field.formatHint);
  }

  if (!field.required) parts.push('This one is optional.');

  // Low confidence is surfaced, never hidden — the user decides whether to trust it.
  if (field.confidence < 0.6) {
    parts.push("I'm not certain I read this question correctly. Press L to hear it exactly as printed.");
  }

  return parts.join(' ');
}
