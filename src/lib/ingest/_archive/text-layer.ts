import type { TextItem } from "pdfjs-dist/types/src/display/api";

/**
 * Fallback for flat PDFs with no AcroForm fields (ARCHITECTURE.md §5.1).
 * Extracts text with page geometry — position matters because labels and
 * their answer boxes are only related by proximity on a flat page. This is
 * the input handed to the model in /api/understand, never the raw PDF.
 */
export interface TextBlock {
  text: string;
  page: number;
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface TextLayerResult {
  blocks: TextBlock[];
  pageCount: number;
  pageSize: { width: number; height: number };
}

export async function extractTextLayer(file: File): Promise<TextLayerResult> {
  // pdfjs-dist ships a worker that must be configured before use; dynamic
  // import keeps this out of the server bundle since it only runs client-side.
  const pdfjs = await import("pdfjs-dist");
  pdfjs.GlobalWorkerOptions.workerSrc = new URL(
    "pdfjs-dist/build/pdf.worker.min.mjs",
    import.meta.url,
  ).toString();

  const bytes = await file.arrayBuffer();
  const doc = await pdfjs.getDocument({ data: bytes }).promise;

  const blocks: TextBlock[] = [];
  let pageSize = { width: 0, height: 0 };

  for (let pageNum = 1; pageNum <= doc.numPages; pageNum += 1) {
    const page = await doc.getPage(pageNum);
    const viewport = page.getViewport({ scale: 1 });
    if (pageNum === 1) pageSize = { width: viewport.width, height: viewport.height };

    const content = await page.getTextContent();
    for (const item of content.items) {
      if (!("str" in item) || !item.str.trim()) continue;
      const textItem = item as TextItem;
      const [, , , , x, y] = textItem.transform;
      blocks.push({
        text: textItem.str,
        page: pageNum,
        x,
        // pdf.js's y origin is bottom-left; flip to top-left to match Rect
        // convention used across the app (ARCHITECTURE.md's `region` anchor).
        y: viewport.height - y,
        width: textItem.width,
        height: textItem.height,
      });
    }
  }

  return { blocks, pageCount: doc.numPages, pageSize };
}
