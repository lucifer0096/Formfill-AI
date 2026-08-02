import { PDFDocument, PDFTextField, PDFCheckBox, PDFRadioGroup, PDFDropdown, PDFOptionList } from "pdf-lib";
import type { Field } from "@/lib/form-model/types";
import type { AnswerMap } from "@/lib/session-store";

/**
 * Writes real answers into a real PDF's AcroForm fields. Only meaningful for
 * the AcroForm ingest path (ARCHITECTURE.md §5.1) — anchor.fieldName maps
 * straight back to the same field pdf-lib read the form from originally.
 */
export async function fillAcroForm(
  originalFile: File,
  fields: Field[],
  answers: AnswerMap,
): Promise<Uint8Array> {
  const bytes = await originalFile.arrayBuffer();
  const pdf = await PDFDocument.load(bytes, { ignoreEncryption: true });
  const form = pdf.getForm();

  for (const field of fields) {
    if (field.anchor.kind !== "acroform") continue;
    const value = answers[field.id];
    if (!value?.trim()) continue;

    const acroField = form.getFieldMaybe(field.anchor.fieldName);
    if (!acroField) continue;

    try {
      if (acroField instanceof PDFTextField) {
        acroField.setText(value);
      } else if (acroField instanceof PDFCheckBox) {
        if (value === "true" || value.toLowerCase() === "yes") acroField.check();
        else acroField.uncheck();
      } else if (acroField instanceof PDFRadioGroup) {
        acroField.select(value);
      } else if (acroField instanceof PDFDropdown) {
        acroField.select(value);
      } else if (acroField instanceof PDFOptionList) {
        acroField.select(value);
      }
    } catch {
      // A value that doesn't match the field's constraints (e.g. an option
      // that no longer exists) shouldn't abort the whole document — skip
      // just that field and let the rest fill normally.
    }
  }

  // Flatten so the values render as regular page content, not just
  // interactive fields — makes the emitted PDF print and view consistently.
  form.flatten();

  return pdf.save();
}
