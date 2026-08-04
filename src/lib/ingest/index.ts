import type { Form } from "@/lib/form-model/types";
import { listAcroFormFields } from "./acroform-fields";

export type IngestResult = { kind: "form"; form: Form } | { kind: "needs-vision" };

/**
 * Every PDF now goes to the same place: /api/understand, which sends the
 * whole document to a multimodal model in one call. Per the 2026-08-02
 * meeting with Nigel, local AcroForm/text-layer detection was too
 * unreliable across real-world forms to keep as the primary path — see
 * src/lib/ingest/_archive/README.md. This module now only decides whether
 * a file is a PDF at all, and (cheaply, locally) whether it has real
 * fillable fields the model should be told about for fill-back mapping.
 */
export async function ingest(file: File): Promise<IngestResult> {
  const isPdf = file.type === "application/pdf" || file.name.toLowerCase().endsWith(".pdf");
  if (!isPdf) return { kind: "needs-vision" };

  const acroFields = await listAcroFormFields(file).catch(() => []);

  const formData = new FormData();
  formData.set("file", file);
  formData.set("acroFields", JSON.stringify(acroFields));

  const response = await fetch("/api/understand", { method: "POST", body: formData });
  const data = await response.json();
  if (!response.ok) throw new Error(data.error ?? "Classification failed.");

  return { kind: "form", form: data.form as Form };
}
