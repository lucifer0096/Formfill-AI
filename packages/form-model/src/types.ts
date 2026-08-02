/**
 * The Form IR — the single normalised representation that paper, PDF and web
 * forms all collapse into. See docs/ARCHITECTURE.md §2.
 *
 * Everything downstream of ingest (the conversation engine, validation, review,
 * autofill) operates ONLY on these types. The only source-specific knowledge
 * that survives normalisation is `Field.anchor`.
 */

export type FieldType =
  | 'text'
  | 'longtext'
  | 'number'
  | 'currency'
  | 'date'
  | 'email'
  | 'phone'
  | 'name'
  | 'address'
  | 'choice'
  | 'multichoice'
  | 'boolean'
  | 'signature'
  | 'unknown';

/**
 * Drives what may cross the network and what may be captured by cloud speech
 * recognition. Enforced in `redact` and `speech`, never in UI code.
 */
export type Sensitivity = 'none' | 'pii' | 'sensitive';

export type SourceKind = 'pdf' | 'image' | 'dom';

export interface Rect {
  x: number;
  y: number;
  width: number;
  height: number;
}

/**
 * How to write a value back to wherever the field came from. This tagged union
 * is what lets one conversation engine serve three input sources.
 */
export type Anchor =
  /** A real PDF form field. Exact fidelity, no OCR involved. */
  | { kind: 'acroform'; fieldName: string }
  /** A rectangle on a flat PDF page or captured photo. Text is drawn at `rect`. */
  | { kind: 'region'; page: number; rect: Rect }
  /** A live DOM input, addressed by the browser extension. */
  | { kind: 'dom'; selector: string; frame?: string };

export interface Choice {
  value: string;
  /** Verbatim option text from the form. */
  label: string;
  /** Plain-language rewrite, used when reading options aloud. */
  spokenLabel?: string;
}

export interface Constraints {
  maxLength?: number;
  pattern?: string;
  min?: number;
  max?: number;
  options?: Choice[];
}

/**
 * Skip logic. Evaluated on advance so irrelevant branches are never read aloud —
 * the single biggest time saving available in a linear voice interface.
 */
export interface Condition {
  fieldId: string;
  op: 'equals' | 'notEquals' | 'isAnswered' | 'isEmpty';
  value?: string;
}

export interface Field {
  id: string;
  /**
   * VERBATIM label from the form. Never paraphrased, never dropped. Always
   * retrievable by the user (the `L` key). We paraphrase to help; we never hide
   * the original.
   */
  label: string;
  /** Plain-language rewrite. This is what gets spoken. */
  spokenLabel: string;
  /** What the question is actually asking, in concrete terms. */
  help?: string;
  /** Spoken before input is expected, e.g. "day month year, for example 3 3 1954". */
  formatHint?: string;
  type: FieldType;
  required: boolean;
  constraints: Constraints;
  sensitivity: Sensitivity;
  /** 0..1 — from OCR and/or model classification. Low values are surfaced, never hidden. */
  confidence: number;
  anchor: Anchor;
  dependsOn?: Condition;
  /** Semantic key used to match against the local profile for autofill. */
  profileKey?: ProfileKey;
}

export type ProfileKey =
  | 'givenName'
  | 'familyName'
  | 'fullName'
  | 'dateOfBirth'
  | 'email'
  | 'phone'
  | 'addressLine1'
  | 'addressLine2'
  | 'city'
  | 'postalCode'
  | 'country'
  | 'nationalId';

export interface Section {
  id: string;
  title?: string;
  fields: Field[];
}

export interface Provenance {
  capturedAt: string;
  pageCount: number;
  /** e.g. 'acroform', 'pdfjs-textlayer', 'tesseract', 'dom' */
  extractor: string;
  /** Present only when a model was involved in classification. */
  modelVersion?: string;
  /** True when the IR was built without any network call. */
  localOnly: boolean;
}

export interface Form {
  id: string;
  title: string;
  source: SourceKind;
  locale: string;
  provenance: Provenance;
  sections: Section[];
}

/* -------------------------------------------------------------------------- */
/* Answers                                                                     */
/* -------------------------------------------------------------------------- */

/**
 * Answers are deliberately stored OUTSIDE the Form. Keeping the two in separate
 * object graphs is what makes "structure may go to the cloud, answers never do"
 * enforceable rather than aspirational — you cannot serialise a Form and
 * accidentally include a value. See docs/PRIVACY.md §1.
 */
export type AnswerState = 'empty' | 'filled' | 'skipped' | 'needsReview' | 'confirmed';

export type AnswerSource = 'typed' | 'dictated' | 'profile' | 'extracted';

export interface Answer {
  fieldId: string;
  value: string | string[] | boolean | null;
  state: AnswerState;
  source: AnswerSource;
  enteredAt: string;
}

export type AnswerSet = Readonly<Record<string, Answer>>;
