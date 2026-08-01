import {
  PDFDocument,
  PDFTextField,
  PDFCheckBox,
  PDFRadioGroup,
  PDFDropdown,
  PDFOptionList,
  type PDFField,
} from "pdf-lib";
import type { Field, FieldType, Form, Section } from "@/lib/form-model/types";

/**
 * Fast path from ARCHITECTURE.md §5.1: if a PDF has real AcroForm fields,
 * build the IR straight from the field dictionary. No text extraction, no
 * OCR, no model call — exact fidelity, entirely local.
 */
export async function extractAcroForm(file: File): Promise<Form | null> {
  const bytes = await file.arrayBuffer();
  const pdf = await PDFDocument.load(bytes, { ignoreEncryption: true });
  const form = pdf.getForm();
  const acroFields = form.getFields();

  if (acroFields.length === 0) return null;

  const fields: Field[] = acroFields.map((acroField, index) => {
    const name = acroField.getName();
    const { type, options } = classify(acroField);

    return {
      id: `field_${index}`,
      label: name,
      // Verbatim field names are rarely human-readable; a real spokenLabel
      // rewrite is the model's job later. This is a placeholder, not a lie —
      // confidence is set low so the UI is honest about it.
      spokenLabel: humanize(name),
      type,
      required: false,
      constraints: options ? { options } : {},
      sensitivity: "none",
      confidence: 0.4,
      anchor: { kind: "acroform", fieldName: name },
    };
  });

  const section: Section = { id: "section_1", fields };

  return {
    id: crypto.randomUUID(),
    title: file.name.replace(/\.pdf$/i, ""),
    source: "pdf",
    locale: "en-GB",
    provenance: {
      capturedAt: new Date().toISOString(),
      pageCount: pdf.getPageCount(),
      extractor: "acroform",
      localOnly: true,
    },
    sections: [section],
  };
}

function classify(acroField: PDFField): {
  type: FieldType;
  options?: { value: string; label: string }[];
} {
  if (acroField instanceof PDFCheckBox) return { type: "boolean" };
  if (acroField instanceof PDFRadioGroup) {
    return { type: "choice", options: acroField.getOptions().map((o) => ({ value: o, label: o })) };
  }
  if (acroField instanceof PDFDropdown) {
    return { type: "choice", options: acroField.getOptions().map((o) => ({ value: o, label: o })) };
  }
  if (acroField instanceof PDFOptionList) {
    return { type: "multichoice", options: acroField.getOptions().map((o) => ({ value: o, label: o })) };
  }
  if (acroField instanceof PDFTextField) return { type: "text" };
  return { type: "unknown" };
}

/** "date_of_birth" / "DateOfBirth" -> "Date of birth". A stand-in until a model rewrite runs. */
function humanize(fieldName: string): string {
  const spaced = fieldName
    .replace(/[_-]+/g, " ")
    .replace(/([a-z])([A-Z])/g, "$1 $2")
    .trim();
  const lower = spaced.toLowerCase();
  return lower.charAt(0).toUpperCase() + lower.slice(1);
}
