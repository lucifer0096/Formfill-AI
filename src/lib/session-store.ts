import type { AnswerSet, Field, Form } from "@/lib/form-model/types";

/**
 * Hands data between the session's pages without a network round-trip.
 * sessionStorage, not a global store: this is throwaway data for one
 * session, and PRIVACY.md's "answers never leave the device" bar means we
 * should default to the least persistent option that works.
 */
const INGEST_KEY = "formfill:ingest";
const ANSWERS_KEY = "formfill:answers";

export type StoredIngest = { kind: "form"; form: Form } | { kind: "needs-vision"; fileName: string };

export function saveIngestResult(value: StoredIngest): void {
  sessionStorage.setItem(INGEST_KEY, JSON.stringify(value));
}

/**
 * Cache keyed on the raw sessionStorage string, not just memoized once —
 * useSyncExternalStore's getSnapshot MUST return the same reference across
 * calls when nothing changed, or React treats every render as "the store
 * changed" and loops forever (its own console warning: "The result of
 * getSnapshot should be cached to avoid an infinite loop"). A plain
 * JSON.parse on every call produces a new object every time even when the
 * underlying data is identical, which is exactly that bug.
 */
let ingestCache: { raw: string | null; value: StoredIngest | null } = {
  raw: undefined as unknown as string | null, // never equals a real getItem() result, forces first parse
  value: null,
};

export function loadIngestResult(): StoredIngest | null {
  const raw = sessionStorage.getItem(INGEST_KEY);
  if (raw === ingestCache.raw) return ingestCache.value;

  let value: StoredIngest | null = null;
  if (raw) {
    try {
      value = JSON.parse(raw) as StoredIngest;
    } catch {
      value = null;
    }
  }
  ingestCache = { raw, value };
  return value;
}

export function clearIngestResult(): void {
  sessionStorage.removeItem(INGEST_KEY);
}

/* -------------------------------------------------------------------------- */
/* Answers                                                                     */
/* -------------------------------------------------------------------------- */

/**
 * Stores the conversation engine's real AnswerSet (fieldId -> Answer, with
 * state/source/enteredAt), not just raw strings — the engine's review gate
 * and skip-logic depend on Answer.state, and emit (fill-acroform, summary
 * PDF) needs a real Answer.value to read from.
 */
export function saveAnswers(answers: AnswerSet): void {
  sessionStorage.setItem(ANSWERS_KEY, JSON.stringify(answers));
}

const EMPTY_ANSWERS: AnswerSet = {};

// Same raw-string cache as loadIngestResult above, and for the same reason:
// callers using this via useSyncExternalStore need a stable reference when
// the underlying sessionStorage value hasn't actually changed.
let answersCache: { raw: string | null; value: AnswerSet } = {
  raw: undefined as unknown as string | null,
  value: EMPTY_ANSWERS,
};

export function loadAnswers(): AnswerSet {
  const raw = sessionStorage.getItem(ANSWERS_KEY);
  if (raw === answersCache.raw) return answersCache.value;

  let value: AnswerSet = EMPTY_ANSWERS;
  if (raw) {
    try {
      value = JSON.parse(raw) as AnswerSet;
    } catch {
      value = EMPTY_ANSWERS;
    }
  }
  answersCache = { raw, value };
  return value;
}

export function clearAnswers(): void {
  sessionStorage.removeItem(ANSWERS_KEY);
}

/* -------------------------------------------------------------------------- */
/* Demo fallback                                                              */
/* -------------------------------------------------------------------------- */

/**
 * Used when a page is opened directly with nothing in session storage yet
 * (no upload has happened this session), so /overview, /questions and
 * /confirm are still browsable on their own during development.
 */
export const PLACEHOLDER_FIELDS: Field[] = [
  {
    id: "fullName",
    label: "Full name",
    spokenLabel: "What is your full name?",
    help: "Enter your name exactly as it appears on official documents.",
    type: "name",
    required: true,
    constraints: {},
    sensitivity: "pii",
    confidence: 0.9,
    anchor: { kind: "region", page: 0, rect: { x: 0, y: 0, width: 0, height: 0 } },
  },
  {
    id: "dob",
    label: "Date of birth",
    spokenLabel: "What is your date of birth?",
    help: "Use the format day, month, year.",
    type: "date",
    required: true,
    constraints: {},
    sensitivity: "pii",
    confidence: 0.9,
    anchor: { kind: "region", page: 0, rect: { x: 0, y: 0, width: 0, height: 0 } },
  },
  {
    id: "nationalId",
    label: "National Insurance number",
    spokenLabel: "What is your National Insurance number?",
    type: "text",
    required: true,
    constraints: {},
    sensitivity: "sensitive",
    confidence: 0.6,
    anchor: { kind: "region", page: 0, rect: { x: 0, y: 0, width: 0, height: 0 } },
  },
  {
    id: "address",
    label: "Home address",
    spokenLabel: "What is your home address?",
    help: "Include your street, city, and postcode.",
    type: "address",
    required: true,
    constraints: {},
    sensitivity: "pii",
    confidence: 0.9,
    anchor: { kind: "region", page: 0, rect: { x: 0, y: 0, width: 0, height: 0 } },
  },
  {
    id: "declaration",
    label: "Applicant's declaration of relevant prior interests",
    spokenLabel: "Have you had a financial interest in this before?",
    type: "choice",
    required: false,
    constraints: {
      options: [
        { value: "yes", label: "Yes" },
        { value: "no", label: "No" },
      ],
    },
    sensitivity: "none",
    confidence: 0.3,
    anchor: { kind: "region", page: 0, rect: { x: 0, y: 0, width: 0, height: 0 } },
  },
];

const PLACEHOLDER_FORM: Form = {
  id: "placeholder",
  title: "Sample form",
  description: "A sample form used to preview this page directly, without uploading a real document first.",
  source: "pdf",
  locale: "en-GB",
  provenance: {
    capturedAt: new Date(0).toISOString(),
    pageCount: 1,
    extractor: "placeholder",
    localOnly: true,
  },
  sections: [{ id: "section_1", fields: PLACEHOLDER_FIELDS }],
};

/**
 * The Form the rest of the session should work from: whatever was actually
 * extracted from an upload this session, or the placeholder if the page is
 * being browsed directly (dev/demo convenience — see docs/ARCHITECTURE.md
 * for what "extracted" actually means once /api/understand exists).
 */
export function loadWorkingForm(): { form: Form; isPlaceholder: boolean } {
  const stored = loadIngestResult();
  if (stored?.kind === "form") return { form: stored.form, isPlaceholder: false };
  return { form: PLACEHOLDER_FORM, isPlaceholder: true };
}
