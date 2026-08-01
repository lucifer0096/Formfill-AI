import type { Form } from "@/lib/form-model/types";
import { extractAcroForm } from "./acroform";
import { extractTextLayer, type TextLayerResult } from "./text-layer";

export type IngestResult =
  | { kind: "form"; form: Form }
  | { kind: "text-layer"; result: TextLayerResult }
  | { kind: "needs-vision" };

/**
 * Decides which extraction path a file needs, per ARCHITECTURE.md §5.1:
 *   1. AcroForm fields present -> build the IR directly, no model call.
 *   2. PDF with a text layer but no form fields -> extract text+geometry,
 *      hand it to /api/understand for classification.
 *   3. Image, or scanned PDF with no extractable text -> needs a vision
 *      model / OCR. Not implemented yet; the caller decides what to do.
 */
export async function ingest(file: File): Promise<IngestResult> {
  const isPdf = file.type === "application/pdf" || file.name.toLowerCase().endsWith(".pdf");

  if (!isPdf) {
    return { kind: "needs-vision" };
  }

  const form = await extractAcroForm(file);
  if (form) return { kind: "form", form };

  const textLayer = await extractTextLayer(file);
  if (textLayer.blocks.length > 0) return { kind: "text-layer", result: textLayer };

  return { kind: "needs-vision" };
}
