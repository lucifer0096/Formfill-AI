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
    const answer = answers[field.id];
    if (!isAnswered(answer)) continue;
    const value = answer!.value;

    // Per-option checkboxes take priority over — and are independent of —
    // the field's own top-level anchor. A Yes/No question printed as two
    // separate real checkboxes ("☐ Yes  ☐ No") can never be covered by one
    // field-level acroFieldName (there is no single real field that means
    // "the whole question"), so each option carries its own real field
    // name instead (Choice.acroFieldName, src/lib/form-model/types.ts).
    // Previously this case fell through to the field-level branch below,
    // which either wrote the wrong checkbox's state or, if the field had
    // no field-level match at all, wrote nothing — the actual root cause
    // of "checkboxes not working" on a Yes/No form with two real checkbox
    // fields, confirmed live.
    const optionFields = (field.constraints.options ?? []).filter((o) => o.acroFieldName);
    if (optionFields.length > 0) {
      // A field can legitimately have some options mapped to real
      // checkboxes and others not (e.g. the model was only confident about
      // one of them) — only the mapped ones are ever touched here.
      const selectedValues =
        typeof value === "boolean"
          ? [value ? "yes" : "no"]
          : Array.isArray(value)
            ? value
            : [String(value)];
      for (const option of optionFields) {
        const acroField = form.getFieldMaybe(option.acroFieldName!);
        if (!(acroField instanceof PDFCheckBox)) continue;
        try {
          if (selectedValues.some((v) => v.toLowerCase() === option.value.toLowerCase())) {
            acroField.check();
          } else {
            acroField.uncheck();
          }
        } catch {
          // Same reasoning as the field-level catch below: one bad
          // checkbox shouldn't stop the rest of the document from filling.
        }
      }
      continue;
    }

    if (field.anchor.kind !== "acroform") continue;

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
