import { PDFDocument, PDFButton, PDFCheckBox, PDFRadioGroup, PDFDropdown, PDFOptionList } from "pdf-lib";

/**
 * Lists real AcroForm field names, nothing else — no position, no label
 * guessing, no classification. That detection work moved to the multimodal
 * model (see docs/ARCHITECTURE.md); this function exists only so the model
 * can be given the real field names and asked to map its own visual field
 * detections back onto them, which is what `fillAcroForm` needs
 * (`anchor.fieldName`) to write real values into a real PDF afterward.
 *
 * Superseded by nothing on the detection side — see
 * src/lib/ingest/_archive/acroform.ts for the local heuristic this replaced.
 */
export interface AcroFormFieldSummary {
  name: string;
  kind: "checkbox" | "radio" | "dropdown" | "optionlist" | "text" | "signature" | "unknown";
  options?: string[];
}

export async function listAcroFormFields(file: File): Promise<AcroFormFieldSummary[]> {
  const bytes = await file.arrayBuffer();
  const pdf = await PDFDocument.load(bytes, { ignoreEncryption: true });
  const fields = pdf.getForm().getFields();

  return fields
    .filter((f) => !(f instanceof PDFButton))
    .map((f) => {
      const name = f.getName();
      if (f instanceof PDFCheckBox) return { name, kind: "checkbox" as const };
      if (f instanceof PDFRadioGroup) return { name, kind: "radio" as const, options: f.getOptions() };
      if (f instanceof PDFDropdown) return { name, kind: "dropdown" as const, options: f.getOptions() };
      if (f instanceof PDFOptionList) return { name, kind: "optionlist" as const, options: f.getOptions() };
      return { name, kind: "text" as const };
    });
}
