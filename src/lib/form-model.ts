/**
 * The Form IR shared between /api/understand and the pages that render it.
 * Matches docs/ARCHITECTURE.md §2's Field/Anchor shape so a later write-back
 * pass (pdf-lib, resolving `anchor` from the document's real AcroForm/XFA
 * structure) can slot in without changing this contract.
 */
export const FIELD_TYPES = [
  "text", "longtext", "number", "currency", "date", "email", "phone",
  "name", "address", "choice", "multichoice", "boolean", "signature", "unknown",
] as const;
export type FieldType = (typeof FIELD_TYPES)[number];

export interface FieldOption {
  value: string;
  label: string;
}

/** `anchor.kind` stays "unknown" until a local pdf-lib pass resolves the real AcroForm/XFA field or page rect. */
export type Anchor = { kind: "unknown" };

export interface Field {
  id: string;
  label: string;
  spokenLabel: string;
  help?: string;
  type: FieldType;
  required: boolean;
  options?: FieldOption[];
  anchor: Anchor;
  /** Filled in client-side as the user answers; never sent to the model. */
  answer: string | string[] | boolean | null;
}

export interface Section {
  title: string;
  fields: Field[];
}

export interface UnderstandResult {
  description: string;
  sections: Section[];
  totalFields: number;
}

export interface FlatField extends Field {
  sectionTitle: string;
}

/** Sections in order, fields within each in order — the one true field order used everywhere (answer flow, review). */
export function flattenFields(sections: Section[]): FlatField[] {
  return sections.flatMap((section) =>
    section.fields.map((field) => ({ ...field, sectionTitle: section.title }))
  );
}
