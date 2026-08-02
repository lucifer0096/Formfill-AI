import { PDFDocument, StandardFonts, rgb } from "pdf-lib";
import type { Field } from "@/lib/form-model/types";
import type { AnswerMap } from "@/lib/session-store";

/**
 * For forms with no real fields to write into (the flat/classified path —
 * anchors are all placeholder region rects, see classify.ts), a true filled
 * PDF isn't achievable without real coordinate data. This produces an
 * honest alternative: a plain question/answer summary, not a pretend fill.
 */
export async function buildSummaryPdf(title: string, fields: Field[], answers: AnswerMap): Promise<Uint8Array> {
  const pdf = await PDFDocument.create();
  const font = await pdf.embedFont(StandardFonts.Helvetica);
  const bold = await pdf.embedFont(StandardFonts.HelveticaBold);

  const pageWidth = 595.28; // A4
  const pageHeight = 841.89;
  const margin = 56;
  const maxWidth = pageWidth - margin * 2;

  let page = pdf.addPage([pageWidth, pageHeight]);
  let y = pageHeight - margin;

  function newPageIfNeeded(neededHeight: number) {
    if (y - neededHeight < margin) {
      page = pdf.addPage([pageWidth, pageHeight]);
      y = pageHeight - margin;
    }
  }

  function wrapText(text: string, useFont: typeof font, size: number): string[] {
    const words = text.split(" ");
    const lines: string[] = [];
    let line = "";
    for (const word of words) {
      const candidate = line ? `${line} ${word}` : word;
      if (useFont.widthOfTextAtSize(candidate, size) > maxWidth && line) {
        lines.push(line);
        line = word;
      } else {
        line = candidate;
      }
    }
    if (line) lines.push(line);
    return lines;
  }

  newPageIfNeeded(28);
  page.drawText(title, { x: margin, y, size: 18, font: bold, color: rgb(0, 0, 0) });
  y -= 28;

  page.drawText("Answer summary — not a filled copy of the original form.", {
    x: margin,
    y,
    size: 9,
    font,
    color: rgb(0.4, 0.4, 0.4),
  });
  y -= 24;

  for (const field of fields) {
    const value = answers[field.id]?.trim() || "Not answered";

    const questionLines = wrapText(field.spokenLabel, bold, 11);
    newPageIfNeeded(questionLines.length * 14 + 4);
    for (const line of questionLines) {
      page.drawText(line, { x: margin, y, size: 11, font: bold, color: rgb(0, 0, 0) });
      y -= 14;
    }

    const answerLines = wrapText(value, font, 11);
    newPageIfNeeded(answerLines.length * 14 + 16);
    for (const line of answerLines) {
      page.drawText(line, { x: margin, y, size: 11, font, color: rgb(0.15, 0.15, 0.15) });
      y -= 14;
    }
    y -= 12;
  }

  return pdf.save();
}
