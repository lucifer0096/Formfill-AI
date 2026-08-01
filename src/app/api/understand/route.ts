import { NextResponse } from "next/server";
import { classifyTextLayer } from "@/lib/openrouter/classify";
import type { TextBlock } from "@/lib/ingest/text-layer";

/**
 * Classifies text extracted locally from a flat PDF into a Form (sections,
 * fields, plain-language labels). See docs/ARCHITECTURE.md §5.1 and §9 on
 * `main` — stateless, no payload logging, the raw PDF never reaches this
 * route (only its extracted text does; extraction happens client-side).
 */
export async function POST(request: Request) {
  let body: { blocks: TextBlock[]; fileName: string; pageCount: number };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
  }

  if (!Array.isArray(body.blocks) || body.blocks.length === 0) {
    return NextResponse.json({ error: "No text blocks provided." }, { status: 400 });
  }

  try {
    const form = await classifyTextLayer(body.blocks, body.fileName ?? "form", body.pageCount ?? 1);
    return NextResponse.json({ form });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Classification failed.";
    return NextResponse.json({ error: message }, { status: 502 });
  }
}
