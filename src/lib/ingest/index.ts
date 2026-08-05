import type { Form } from "@/lib/form-model/types";
import { listAcroFormFields } from "./acroform-fields";

export type IngestResult = { kind: "form"; form: Form } | { kind: "needs-vision" };

// Matches exactly what UploadDropzone's ACCEPTED_TYPES and on-screen hint
// text advertise ("PDF, PNG, or JPG") — keep these in sync; supporting a
// format here that the picker doesn't actually offer would be dead code,
// and advertising one the picker offers but this rejects would reintroduce
// the same silent-mismatch problem this change is meant to close.
const SUPPORTED_IMAGE_TYPES = new Set(["image/jpeg", "image/png"]);
const SUPPORTED_IMAGE_EXTENSIONS = /\.(jpe?g|png)$/i;

function isSupportedImage(file: File): boolean {
  return SUPPORTED_IMAGE_TYPES.has(file.type.toLowerCase()) || SUPPORTED_IMAGE_EXTENSIONS.test(file.name);
}

/**
 * Every PDF and, now, every supported photo/image goes to the same place:
 * /api/understand, which sends the whole document to a multimodal model in
 * one call. Per the 2026-08-02 meeting with the mentor, local AcroForm/
 * text-layer detection was too unreliable across real-world forms to keep
 * as the primary path — see src/lib/ingest/_archive/README.md. A photo has
 * no AcroForm fields to enumerate (those only exist inside a real PDF's own
 * structure), so this module skips that local pass for images and sends
 * an empty acroFields list, same as it already does for a flat/scanned PDF.
 * Anything that isn't a PDF or a supported image format still falls back
 * to "needs-vision", telling the user plainly rather than failing silently.
 */
export async function ingest(file: File): Promise<IngestResult> {
  const isPdf = file.type === "application/pdf" || file.name.toLowerCase().endsWith(".pdf");
  const isImage = !isPdf && isSupportedImage(file);
  if (!isPdf && !isImage) return { kind: "needs-vision" };

  const acroFields = isPdf ? await listAcroFormFields(file).catch(() => []) : [];

  const formData = new FormData();
  formData.set("file", file);
  formData.set("acroFields", JSON.stringify(acroFields));

  const response = await fetch("/api/understand", { method: "POST", body: formData });
  const data = await response.json();
  if (!response.ok) throw new Error(data.error ?? "Classification failed.");

  return { kind: "form", form: data.form as Form };
}
