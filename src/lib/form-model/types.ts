/**
 * The Form IR — the single normalised representation that paper, PDF and web
 * forms all collapse into. See docs/ARCHITECTURE.md §2 on `main`.
 *
 * Mirrors packages/form-model/src/types.ts on `main`. Duplicated here (not
 * imported) because this branch isn't wired into the npm workspace yet — see
 * the repo reconciliation plan. Keep this in sync by hand until that merge
 * happens; at that point this file should be deleted in favour of the real
 * `@formfill/form-model` package.
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

export type Sensitivity = 'none' | 'pii' | 'sensitive';

export type SourceKind = 'pdf' | 'image' | 'dom';

export interface Rect {
  x: number;
  y: number;
  width: number;
  height: number;
}

export type Anchor =
  | { kind: 'acroform'; fieldName: string }
  | { kind: 'region'; page: number; rect: Rect }
  | { kind: 'dom'; selector: string; frame?: string };

export interface Choice {
  value: string;
  label: string;
  spokenLabel?: string;
}

export interface Constraints {
  maxLength?: number;
  pattern?: string;
  min?: number;
  max?: number;
  options?: Choice[];
}

export interface Condition {
  fieldId: string;
  op: 'equals' | 'notEquals' | 'isAnswered' | 'isEmpty';
  value?: string;
}

export interface Field {
  id: string;
  label: string;
  spokenLabel: string;
  help?: string;
  formatHint?: string;
  type: FieldType;
  required: boolean;
  constraints: Constraints;
  sensitivity: Sensitivity;
  confidence: number;
  anchor: Anchor;
  dependsOn?: Condition;
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
