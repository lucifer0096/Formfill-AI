import { PDFDocument, PDFTextField, PDFCheckBox, PDFRadioGroup, PDFDropdown, PDFOptionList } from "pdf-lib";
import type { AnswerSet, Field } from "@/lib/form-model/types";
import { isAnswered } from "@/lib/form-model/traverse";

/**
 * Writes real answers into a real PDF's AcroForm fields. Only meaningful for
 * the AcroForm ingest path (ARCHITECTURE.md §5.1) — anchor.fieldName maps
 * straight back to the same field pdf-lib read the form from originally.
 */
export async function fillAcroForm(
  originalFile: File,
  fields: Field[],
  answers: AnswerSet,
): Promise<Uint8Array> {
  const bytes = await originalFile.arrayBuffer();
  const pdf = await PDFDocument.load(bytes, { ignoreEncryption: true });
  const form = pdf.getForm();

  for (const field of fields) {
    if (field.anchor.kind !== "acroform") continue;
    const answer = answers[field.id];
    if (!isAnswered(answer)) continue;
    const value = answer!.value;

    const acroField = form.getFieldMaybe(field.anchor.fieldName);
    if (!acroField) continue;

    try {
      if (acroField instanceof PDFTextField) {
        acroField.setText(String(value));
      } else if (acroField instanceof PDFCheckBox) {
        if (value === true || (typeof value === "string" && value.toLowerCase() === "yes")) acroField.check();
        else acroField.uncheck();
      } else if (acroField instanceof PDFRadioGroup) {
        acroField.select(String(value));
      } else if (acroField instanceof PDFDropdown) {
        acroField.select(String(value));
      } else if (acroField instanceof PDFOptionList) {
        acroField.select(Array.isArray(value) ? value[0] ?? "" : String(value));
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
