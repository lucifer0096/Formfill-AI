import type { PDFDocument, PDFField as PdfLibField } from "pdf-lib";

/**
 * Resolves where on the page an AcroForm field's widget actually sits, so
 * nearby text-layer text can be used to figure out what the field is really
 * asking (see classify-acroform-labels.ts). pdf-lib exposes this per-widget
 * via the annotation's own /P (parent page) entry and /Rect, not through the
 * field object directly.
 */
export interface FieldPosition {
  /** 1-indexed to match TextBlock.page from text-layer.ts. */
  page: number;
  x: number;
  y: number;
  width: number;
  height: number;
}

export function resolveFieldPosition(pdf: PDFDocument, field: PdfLibField): FieldPosition | null {
  const widgets = field.acroField.getWidgets();
  const widget = widgets[0];
  if (!widget) return null;

  const rect = widget.getRectangle();
  const pageRef = widget.P();
  if (!pageRef) return null;

  const pages = pdf.getPages();
  const pageIndex = pages.findIndex((p) => p.ref === pageRef);
  if (pageIndex === -1) return null;

  const page = pages[pageIndex]!;
  const pageHeight = page.getHeight();

  return {
    page: pageIndex + 1,
    x: rect.x,
    // PDF rect origin is bottom-left; text-layer.ts's TextBlock uses
    // top-left, per its own comment on the same conversion.
    y: pageHeight - rect.y - rect.height,
    width: rect.width,
    height: rect.height,
  };
}
