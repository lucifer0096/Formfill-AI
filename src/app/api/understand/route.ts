import { NextResponse } from "next/server";
import { classifyPdf } from "@/lib/openrouter/classify-pdf";
import type { AcroFormFieldSummary } from "@/lib/ingest/acroform-fields";

/**
 * Classifies a PDF form into a Form (sections, fields, plain-language
 * labels) by sending the whole document to a multimodal model in one call.
 * Replaces the old two-path pipeline (AcroForm field detection, then a
 * separate text-layer-only classification call) per the 2026-08-02 meeting
 * with Nigel — see docs/ARCHITECTURE.md and
 * src/lib/ingest/_archive/README.md for the reasoning.
 *
 * The free/cheap classification models can take 20-75s on a large real form
 * — well past Vercel's Hobby-plan default serverless timeout (10s). 60 is
 * the actual max Hobby allows; this doesn't guarantee success on the
 * biggest forms but removes the platform default as the limiting factor.
 */
export const maxDuration = 60;

export async function POST(request: Request) {
  const formData = await request.formData().catch(() => null);
  if (!formData) {
    return NextResponse.json({ error: "Invalid form-data body." }, { status: 400 });
  }

  const file = formData.get("file");
  if (!(file instanceof File)) {
    return NextResponse.json({ error: "No file provided." }, { status: 400 });
  }

  const acroFieldsRaw = formData.get("acroFields");
  let acroFields: AcroFormFieldSummary[] = [];
  if (typeof acroFieldsRaw === "string") {
    try {
      acroFields = JSON.parse(acroFieldsRaw) as AcroFormFieldSummary[];
    } catch {
      return NextResponse.json({ error: "Invalid acroFields JSON." }, { status: 400 });
    }
  }

  const pageCountRaw = formData.get("pageCount");
  const pageCount = typeof pageCountRaw === "string" ? Number(pageCountRaw) || 1 : 1;

  try {
    const bytes = await file.arrayBuffer();
    const form = await classifyPdf(bytes, file.name, acroFields, pageCount);
    return NextResponse.json({ form });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Classification failed.";
    return NextResponse.json({ error: message }, { status: 502 });
  }
}
