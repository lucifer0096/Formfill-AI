import { NextResponse } from "next/server";
import { readApiKey } from "@/lib/server/api-key-store";
import { FIELD_TYPES, type Field, type FieldType, type UnderstandResult } from "@/lib/form-model";

/**
 * Free-tier models can take well past Vercel's 10s default before responding
 * on a multi-page document — see docs precedent in the rahul branch for the
 * same tradeoff. 60s is the actual ceiling on Vercel's Hobby plan.
 */
export const maxDuration = 60;

// Defaults to a free model for testing. Set OPENROUTER_MODEL in .env.local to
// switch — e.g. "anthropic/claude-sonnet-5" for the demo — with no code change.
const MODEL = process.env.OPENROUTER_MODEL || "google/gemma-3-27b-it:free";
const MAX_FILE_BYTES = 50 * 1024 * 1024; // matches the 50MB hint shown on the upload page

// Field shape matches this project's own Form IR (@/lib/form-model, see
// docs/ARCHITECTURE.md §2): verbatim label + a spokenLabel rewrite for
// reading aloud, a type, whether it's required, and options for
// choice/multichoice/boolean fields so the UI can offer them as suggestions.
// The model is only asked for what it can actually see on the page — id,
// anchor, and answer are added by this route, not the model, for reasons in
// the comments below.
const SYSTEM_PROMPT = `You are looking at a form document (PDF, scanned page, or photo). This is read aloud to a blind or low-vision person one field at a time, so accuracy on type, required-ness, and options matters more than brevity.

Respond with ONLY a JSON object, no markdown fencing, no commentary, of this exact shape:

{
  "description": "A 2-3 sentence plain-language description of what this form is and who it's for.",
  "sections": [
    {
      "title": "string, the section's name as it appears on the form (or a sensible short label if the form has no explicit sections)",
      "fields": [
        {
          "label": "the field's label VERBATIM as printed on the form. Never paraphrase this one.",
          "spokenLabel": "a plain-language rewrite of what is actually being asked, phrased as a question, suitable to read aloud. Never omit a negation.",
          "help": "one sentence explaining what the question is actually asking, only if the label alone is not self-explanatory, otherwise omit this key",
          "type": "one of: ${FIELD_TYPES.join(", ")}",
          "required": boolean, true unless there is a clear signal it's optional (e.g. "optional" printed next to it),
          "options": [{"value": "string", "label": "string"}], REQUIRED when type is "choice", "multichoice", or "boolean" — every option/checkbox/radio choice printed on the form, so it can be read aloud as a suggestion. Omit this key entirely for other types.
        }
      ]
    }
  ]
}

Don't list instructional or legal text that isn't asking the user anything as a field. If the form has no clear sections, return a single section titled "General". Never invent content that isn't on the form.`;

interface ModelField {
  label: string;
  spokenLabel: string;
  help?: string;
  type: string;
  required: boolean;
  options?: { value: string; label: string }[];
}

interface ModelSection {
  title: string;
  fields: ModelField[];
}

interface ModelResult {
  description: string;
  sections: ModelSection[];
}

function isModelResult(value: unknown): value is ModelResult {
  if (!value || typeof value !== "object") return false;
  const v = value as Record<string, unknown>;
  if (typeof v.description !== "string") return false;
  if (!Array.isArray(v.sections)) return false;
  return v.sections.every((s) => {
    if (!s || typeof s !== "object") return false;
    const section = s as Record<string, unknown>;
    if (typeof section.title !== "string" || !Array.isArray(section.fields)) return false;
    return section.fields.every((f) => {
      if (!f || typeof f !== "object") return false;
      const field = f as Record<string, unknown>;
      return (
        typeof field.label === "string" &&
        typeof field.spokenLabel === "string" &&
        typeof field.type === "string" &&
        typeof field.required === "boolean"
      );
    });
  });
}

function isFieldType(value: string): value is FieldType {
  return (FIELD_TYPES as readonly string[]).includes(value);
}

/**
 * Fills in what the model isn't asked for. `anchor` and `answer` are
 * deliberately not asked of the model:
 * - `anchor` needs the PDF's real AcroForm/XFA field name (or a precise
 *   pixel rect), which only exists in the document's own object structure —
 *   a vision model reading rendered pixels cannot know it, and guessing one
 *   would silently break write-back later (pdf-lib would look up a field
 *   name that doesn't exist). This stays "unknown" until a dedicated local
 *   pass (pdf-lib, matching the rahul branch's ingest/acroform.ts approach)
 *   resolves it — a separate, deterministic step, not this route's job.
 * - `answer` starts empty; it's filled in client-side as the user answers,
 *   never sent to the model.
 */
function toWriteBackResult(model: ModelResult): UnderstandResult {
  let fieldIndex = 0;
  const sections = model.sections.map((section, sectionIndex) => ({
    title: section.title,
    fields: section.fields.map((field): Field => ({
      id: `field_${sectionIndex}_${fieldIndex++}`,
      label: field.label,
      spokenLabel: field.spokenLabel,
      help: field.help,
      type: isFieldType(field.type) ? field.type : "unknown",
      required: field.required,
      options: field.options,
      anchor: { kind: "unknown" },
      answer: null,
    })),
  }));

  return {
    description: model.description,
    sections,
    totalFields: sections.reduce((sum, s) => sum + s.fields.length, 0),
  };
}

/** Strips ```json ... ``` fences a model adds despite being told not to. */
function stripCodeFence(text: string): string {
  const trimmed = text.trim();
  const fenced = trimmed.match(/^```(?:json)?\s*([\s\S]*?)\s*```$/i);
  return fenced ? fenced[1]! : trimmed;
}

export async function POST(request: Request) {
  const apiKey = (await readApiKey()) ?? process.env.OPENROUTER_API_KEY ?? null;
  if (!apiKey) {
    return NextResponse.json(
      { error: "No OpenRouter API key is configured for this server." },
      { status: 400 }
    );
  }

  let formData: FormData;
  try {
    formData = await request.formData();
  } catch {
    return NextResponse.json({ error: "Expected multipart form data with a file." }, { status: 400 });
  }

  const file = formData.get("file");
  if (!(file instanceof File)) {
    return NextResponse.json({ error: "No file was uploaded." }, { status: 400 });
  }
  if (file.size > MAX_FILE_BYTES) {
    return NextResponse.json({ error: "File is too large (50MB max)." }, { status: 413 });
  }

  const isPdf = file.type === "application/pdf" || file.name.toLowerCase().endsWith(".pdf");
  const isImage = file.type.startsWith("image/");
  if (!isPdf && !isImage) {
    return NextResponse.json({ error: "Only PDF, PNG, or JPG forms are supported." }, { status: 415 });
  }

  const bytes = Buffer.from(await file.arrayBuffer());
  const base64 = bytes.toString("base64");
  const mimeType = isPdf ? "application/pdf" : file.type;
  const dataUrl = `data:${mimeType};base64,${base64}`;

  // PDFs go through OpenRouter's "file" content part (OCR'd server-side if the
  // model can't read PDFs natively); images go through the standard
  // OpenAI-compatible "image_url" part. Sending the document itself rather
  // than text we extracted locally avoids compounding a brittle local parser's
  // mistakes with the model's — the model sees exactly what a person would see.
  const documentPart = isPdf
    ? { type: "file" as const, file: { filename: file.name, file_data: dataUrl } }
    : { type: "image_url" as const, image_url: { url: dataUrl } };

  let response: Response;
  try {
    response = await fetch("https://openrouter.ai/api/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: MODEL,
        messages: [
          { role: "system", content: SYSTEM_PROMPT },
          {
            role: "user",
            content: [
              { type: "text", text: `Filename: ${file.name}` },
              documentPart,
            ],
          },
        ],
      }),
      // Propagates the browser tab's cancellation to this paid call — if the
      // client aborts (e.g. a duplicate request from React Strict Mode's
      // double-invoked effect in dev), stop paying for it mid-flight instead
      // of letting it run to completion unread.
      signal: request.signal,
    });
  } catch (error) {
    if (error instanceof DOMException && error.name === "AbortError") {
      return NextResponse.json({ error: "Request aborted." }, { status: 499 });
    }
    return NextResponse.json({ error: "Could not reach OpenRouter." }, { status: 502 });
  }

  if (!response.ok) {
    const detail = await response.text().catch(() => "");
    return NextResponse.json(
      { error: `OpenRouter request failed (${response.status}). ${detail}`.trim() },
      { status: 502 }
    );
  }

  const payload = await response.json();
  const content: unknown = payload?.choices?.[0]?.message?.content;
  if (typeof content !== "string") {
    return NextResponse.json({ error: "The model returned an empty response." }, { status: 502 });
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(stripCodeFence(content));
  } catch {
    return NextResponse.json(
      { error: "The model didn't return a valid form summary. Try again." },
      { status: 502 }
    );
  }

  if (!isModelResult(parsed)) {
    return NextResponse.json(
      { error: "The model's response didn't match the expected shape. Try again." },
      { status: 502 }
    );
  }

  return NextResponse.json(toWriteBackResult(parsed));
}
