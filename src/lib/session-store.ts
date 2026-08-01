import type { Field, Form } from "@/lib/form-model/types";
import type { TextLayerResult } from "@/lib/ingest/text-layer";

/**
 * Hands data between the session's pages without a network round-trip.
 * sessionStorage, not a global store: this is throwaway data for one
 * session, and PRIVACY.md's "answers never leave the device" bar means we
 * should default to the least persistent option that works.
 */
const INGEST_KEY = "formfill:ingest";
const ANSWERS_KEY = "formfill:answers";

export type StoredIngest =
  | { kind: "form"; form: Form }
  | { kind: "text-layer"; result: TextLayerResult; fileName: string }
  | { kind: "needs-vision"; fileName: string };

export function saveIngestResult(value: StoredIngest): void {
  sessionStorage.setItem(INGEST_KEY, JSON.stringify(value));
}

export function loadIngestResult(): StoredIngest | null {
  const raw = sessionStorage.getItem(INGEST_KEY);
  if (!raw) return null;
  try {
    return JSON.parse(raw) as StoredIngest;
  } catch {
    return null;
  }
}

export function clearIngestResult(): void {
  sessionStorage.removeItem(INGEST_KEY);
}

/* -------------------------------------------------------------------------- */
/* Answers                                                                     */
/* -------------------------------------------------------------------------- */

export type AnswerMap = Record<string, string>;

export function saveAnswers(answers: AnswerMap): void {
  sessionStorage.setItem(ANSWERS_KEY, JSON.stringify(answers));
}

export function loadAnswers(): AnswerMap {
  const raw = sessionStorage.getItem(ANSWERS_KEY);
  if (!raw) return {};
  try {
    return JSON.parse(raw) as AnswerMap;
  } catch {
    return {};
  }
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
