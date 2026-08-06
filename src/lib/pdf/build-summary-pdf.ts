import { PDFDocument, StandardFonts, rgb, type PDFFont, type PDFPage } from "pdf-lib";
import type { UnderstandResult, Field } from "@/lib/form-model";
import { answerToText } from "@/lib/answer-format";

const PAGE_WIDTH = 595.28; // A4
const PAGE_HEIGHT = 841.89;
const MARGIN = 50;
const MAX_WIDTH = PAGE_WIDTH - MARGIN * 2;

interface Cursor {
  doc: PDFDocument;
  page: PDFPage;
  y: number;
}

function wrapText(text: string, font: PDFFont, size: number, maxWidth: number): string[] {
  const words = text.split(/\s+/).filter(Boolean);
  const lines: string[] = [];
  let current = "";
  for (const word of words) {
    const attempt = current ? `${current} ${word}` : word;
    if (current && font.widthOfTextAtSize(attempt, size) > maxWidth) {
      lines.push(current);
      current = word;
    } else {
      current = attempt;
    }
  }
  if (current) lines.push(current);
  return lines.length ? lines : [""];
}

function ensureSpace(cursor: Cursor, needed: number) {
  if (cursor.y - needed < MARGIN) {
    cursor.page = cursor.doc.addPage([PAGE_WIDTH, PAGE_HEIGHT]);
    cursor.y = PAGE_HEIGHT - MARGIN;
  }
}

function drawParagraph(
  cursor: Cursor,
  text: string,
  font: PDFFont,
  size: number,
  lineHeight: number,
  color = rgb(0, 0, 0)
) {
  for (const line of wrapText(text, font, size, MAX_WIDTH)) {
    ensureSpace(cursor, lineHeight);
    cursor.page.drawText(line, { x: MARGIN, y: cursor.y, size, font, color });
    cursor.y -= lineHeight;
  }
}

/**
 * A guaranteed-accurate fallback for forms without real fillable fields (or
 * where fillAcroForm couldn't confidently match any): a plain question/answer
 * listing, generated entirely client-side. No matching risk — it just states
 * what was asked and what was answered.
 */
export async function buildSummaryPdf(
  result: UnderstandResult,
  answers: Record<string, Field["answer"]>,
  title: string
): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  const font = await doc.embedFont(StandardFonts.Helvetica);
  const boldFont = await doc.embedFont(StandardFonts.HelveticaBold);
  const page = doc.addPage([PAGE_WIDTH, PAGE_HEIGHT]);
  const cursor: Cursor = { doc, page, y: PAGE_HEIGHT - MARGIN };

  drawParagraph(cursor, title, boldFont, 18, 24);
  cursor.y -= 6;
  drawParagraph(cursor, `Generated ${new Date().toLocaleDateString()}`, font, 10, 14, rgb(0.4, 0.4, 0.4));
  cursor.y -= 14;

  for (const section of result.sections) {
    ensureSpace(cursor, 30);
    drawParagraph(cursor, section.title, boldFont, 13, 18);
    cursor.y -= 4;

    for (const field of section.fields) {
      const answerText = answerToText(answers[field.id]) || "Not answered";
      drawParagraph(cursor, field.spokenLabel, boldFont, 11, 15);
      drawParagraph(cursor, answerText, font, 11, 15, rgb(0.2, 0.2, 0.2));
      cursor.y -= 8;
    }
    cursor.y -= 6;
  }

  return doc.save();
}
