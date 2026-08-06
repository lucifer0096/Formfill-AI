export interface TextLine {
  /** 0-based page index, matching pdf-lib's page indexing. */
  page: number;
  x: number;
  y: number;
  width: number;
  height: number;
  text: string;
}

interface RawItem {
  x: number;
  y: number;
  width: number;
  height: number;
  text: string;
}

/**
 * Extracts text from a PDF with position, grouped into visual lines (words on
 * the same row, left to right), in the *same* bottom-up PDF coordinate space
 * pdf-lib's widget rectangles use — necessary so a form field's rect and a
 * nearby line of text can be compared directly without a coordinate
 * conversion. Client-side only, no upload — matches this app's local-first
 * PDF handling elsewhere (ARCHITECTURE.md's pdf.js choice).
 */
export async function extractTextLines(bytes: ArrayBuffer): Promise<TextLine[]> {
  // Dynamically imported, not top-level: pdfjs-dist touches browser globals
  // (DOMMatrix) at module-evaluation time that don't exist during Next.js's
  // server-side prerender of this client component's initial HTML. Deferring
  // the import to inside this function means it only ever loads when this
  // runs for real, in the browser, from the Download click handler.
  const { GlobalWorkerOptions, getDocument } = await import("pdfjs-dist");
  GlobalWorkerOptions.workerSrc = new URL(
    "pdfjs-dist/build/pdf.worker.min.mjs",
    import.meta.url
  ).toString();

  const doc = await getDocument({ data: bytes }).promise;
  const lines: TextLine[] = [];

  for (let pageIndex = 0; pageIndex < doc.numPages; pageIndex++) {
    const page = await doc.getPage(pageIndex + 1);
    const content = await page.getTextContent();

    const items: RawItem[] = [];
    for (const raw of content.items) {
      if (!("str" in raw) || !raw.str.trim()) continue;
      const [, b, , d, e, f] = raw.transform;
      const height = Math.hypot(b, d) || raw.height || 10;
      items.push({ x: e, y: f, width: raw.width, height, text: raw.str });
    }

    // Group into rows by vertical proximity first...
    items.sort((p, q) => q.y - p.y || p.x - q.x);
    const yGroups: RawItem[][] = [];
    for (const item of items) {
      const group = yGroups.find((r) => Math.abs(r[0]!.y - item.y) < item.height * 0.6);
      if (group) group.push(item);
      else yGroups.push([item]);
    }

    // ...then, within each row, split on large horizontal gaps. Without this,
    // unrelated text at the same height in a different column (common on
    // two-column forms) gets stitched into one "line" alongside the real
    // label, corrupting nearby-label matching for anything near it.
    const MAX_WORD_GAP = 40;
    const rows: RawItem[][] = [];
    for (const group of yGroups) {
      group.sort((p, q) => p.x - q.x);
      let segment: RawItem[] = [group[0]!];
      for (let i = 1; i < group.length; i++) {
        const prev = group[i - 1]!;
        const item = group[i]!;
        if (item.x - (prev.x + prev.width) > MAX_WORD_GAP) {
          rows.push(segment);
          segment = [item];
        } else {
          segment.push(item);
        }
      }
      rows.push(segment);
    }

    for (const row of rows) {
      row.sort((p, q) => p.x - q.x);
      const text = row
        .map((i) => i.text)
        .join(" ")
        .replace(/\s+/g, " ")
        .trim();
      if (!text) continue;

      const x = Math.min(...row.map((i) => i.x));
      const rightEdge = Math.max(...row.map((i) => i.x + i.width));
      const yBottom = Math.min(...row.map((i) => i.y));
      const yTop = Math.max(...row.map((i) => i.y + i.height));
      lines.push({ page: pageIndex, x, y: yBottom, width: rightEdge - x, height: yTop - yBottom, text });
    }
  }

  return lines;
}
