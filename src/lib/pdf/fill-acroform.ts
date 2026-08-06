import {
  PDFDocument,
  PDFCheckBox,
  PDFRadioGroup,
  PDFDropdown,
  PDFOptionList,
  PDFTextField,
  PDFButton,
  PDFRef,
  PDFDict,
  type PDFField,
} from "pdf-lib";
import { flattenFields, type UnderstandResult, type Field } from "@/lib/form-model";
import { answerToText, isAffirmativeOption } from "@/lib/answer-format";
import { extractTextLines, type TextLine } from "./extract-text-layer";
import { nearbyLabelText, type FieldRect } from "./nearby-label";

/** Lowercases and collapses to space-separated words — keeps word boundaries, unlike stripping all non-alphanumerics. */
function normalizeLoose(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function tokenize(text: string): string[] {
  return normalizeLoose(text)
    .split(" ")
    .filter((t) => t.length > 1);
}

/** "date_of_birth" / "DateOfBirth" -> "date of birth", so an internal PDF field name can be tokenized like real text. */
function humanizeAcroName(name: string): string {
  return name.replace(/[_-]+/g, " ").replace(/([a-z0-9])([A-Z])/g, "$1 $2");
}

/**
 * True if most of the shorter text's words appear in the longer one. Plain
 * substring containment (the previous approach) breaks on any noise —
 * different spacing, a word reordered, a stray character from PDF text
 * extraction — which is common enough that it was silently losing matches.
 */
function looksLikeMatch(a: string, b: string): boolean {
  const normA = normalizeLoose(a);
  const normB = normalizeLoose(b);
  if (normA.length <= 2 || normB.length <= 2) return false;
  if (normA.includes(normB) || normB.includes(normA)) return true;

  const tokensA = new Set(tokenize(a));
  const tokensB = new Set(tokenize(b));
  if (tokensA.size === 0 || tokensB.size === 0) return false;
  let shared = 0;
  for (const token of tokensA) if (tokensB.has(token)) shared++;
  return shared / Math.min(tokensA.size, tokensB.size) >= 0.6;
}

function resolvePageIndex(pdf: PDFDocument, widgetDict: PDFDict): number | null {
  const pages = pdf.getPages();
  for (let i = 0; i < pages.length; i++) {
    const annots = pages[i]!.node.Annots();
    if (!annots) continue;
    for (const entry of annots.asArray()) {
      const resolved = entry instanceof PDFRef ? pdf.context.lookup(entry) : entry;
      if (resolved === widgetDict) return i;
    }
  }
  return null;
}

/** The field's first widget's position, in the same page-index + bottom-up-point space extractTextLines uses. Null if it can't be resolved (uncommon, but some PDFs omit page annotation links). */
function resolveFieldRect(pdf: PDFDocument, field: PDFField): FieldRect | null {
  const widgets = field.acroField.getWidgets();
  const widget = widgets[0];
  if (!widget) return null;

  const pageIndex = resolvePageIndex(pdf, widget.dict);
  if (pageIndex === null) return null;

  const rectangle = widget.getRectangle();
  return { page: pageIndex, x: rectangle.x, y: rectangle.y, width: rectangle.width, height: rectangle.height };
}

export interface FillResult {
  bytes: Uint8Array;
  filledCount: number;
  totalAcroFields: number;
}

/**
 * Best-effort AcroForm write-back, entirely client-side (no upload, no
 * OpenRouter round trip). Three matching passes, in order:
 *
 * 1. Position-based, whole-field: extracts the PDF's text layer with
 *    geometry (pdf.js) and each AcroForm field's real on-page rectangle
 *    (pdf-lib), finds the label text printed next to each field, and
 *    matches THAT against a detected field's label/spokenLabel. Works for
 *    text boxes, dropdowns, and single checkboxes/radio groups whose nearby
 *    text IS the whole question.
 * 2. Position-based, option-level: many forms represent a single "pick
 *    one/many" question as several INDEPENDENT checkbox fields (e.g.
 *    "[ ] Individual  [ ] Family" is two separate PDFCheckBox fields, not
 *    one field with two options). Pass 1 can never match these — the
 *    checkbox's nearby text is an option's label ("Individual"), not the
 *    question's. This pass matches unmatched checkboxes against individual
 *    `field.options[].label` of choice/multichoice/boolean fields instead,
 *    and checks/unchecks based on whether that specific option was chosen.
 * 3. Name-based fallback: for anything still unmatched (no widget rect, no
 *    text layer at all — e.g. a scanned/flat PDF with no fonts, or no
 *    nearby text found), compares the field's internal name against
 *    detected labels, same as before.
 *
 * A field none of the three passes can confidently match is left blank
 * rather than guessed.
 */
export async function fillAcroForm(
  originalBytes: ArrayBuffer,
  result: UnderstandResult,
  answers: Record<string, Field["answer"]>
): Promise<FillResult | null> {
  const pdf = await PDFDocument.load(originalBytes, { ignoreEncryption: true });
  const form = pdf.getForm();
  const acroFields = form.getFields().filter((f) => !(f instanceof PDFButton));
  if (acroFields.length === 0) return null;

  let textLines: TextLine[] = [];
  try {
    textLines = await extractTextLines(originalBytes);
  } catch {
    // No text layer (e.g. a scanned/flat PDF with no fonts) — position
    // matching just won't find anything; name-based fallback still runs.
  }

  const detected = flattenFields(result.sections);
  const usedFieldIds = new Set<string>();
  const fieldMatches = new Map<string, string>(); // acroField name -> detected field id
  const optionMatches = new Map<string, { fieldId: string; optionValue: string }>(); // acroField name -> chosen option

  function nearbyTextFor(acroField: PDFField, directions: ("left" | "right" | "above")[]): string {
    const rect = resolveFieldRect(pdf, acroField);
    if (!rect || textLines.length === 0) return "";
    return nearbyLabelText(rect, textLines, directions);
  }

  // Pass 1: position-based, whole-field.
  for (const acroField of acroFields) {
    const isToggle = acroField instanceof PDFCheckBox || acroField instanceof PDFRadioGroup;
    const nearbyText = nearbyTextFor(acroField, isToggle ? ["right", "left", "above"] : ["left", "above", "right"]);
    if (!nearbyText) continue;

    const match = detected.find(
      (field) =>
        !usedFieldIds.has(field.id) &&
        (looksLikeMatch(nearbyText, field.label) || looksLikeMatch(nearbyText, field.spokenLabel))
    );
    if (match) {
      usedFieldIds.add(match.id);
      fieldMatches.set(acroField.getName(), match.id);
    }
  }

  // Pass 2: position-based, option-level (checkboxes only — see doc comment).
  for (const acroField of acroFields) {
    if (!(acroField instanceof PDFCheckBox)) continue;
    if (fieldMatches.has(acroField.getName())) continue;

    const nearbyText = nearbyTextFor(acroField, ["right", "left", "above"]);
    if (!nearbyText) continue;

    outer: for (const field of detected) {
      if (field.type !== "choice" && field.type !== "multichoice" && field.type !== "boolean") continue;
      for (const option of field.options ?? []) {
        if (looksLikeMatch(nearbyText, option.label)) {
          optionMatches.set(acroField.getName(), { fieldId: field.id, optionValue: option.value });
          break outer;
        }
      }
    }
  }

  // Pass 3: name-based fallback for whole fields still unmatched.
  for (const acroField of acroFields) {
    const name = acroField.getName();
    if (fieldMatches.has(name) || optionMatches.has(name)) continue;
    const acroName = humanizeAcroName(name);
    if (normalizeLoose(acroName).length <= 2) continue;

    const match = detected.find(
      (field) =>
        !usedFieldIds.has(field.id) &&
        (looksLikeMatch(acroName, field.label) || looksLikeMatch(acroName, field.spokenLabel))
    );
    if (match) {
      usedFieldIds.add(match.id);
      fieldMatches.set(name, match.id);
    }
  }

  let filledCount = 0;
  for (const acroField of acroFields) {
    const name = acroField.getName();
    const optionMatch = optionMatches.get(name);

    try {
      if (optionMatch) {
        const answer = answers[optionMatch.fieldId];
        if (answer === null || answer === undefined) continue; // question never answered — leave as printed

        let checked: boolean;
        if (Array.isArray(answer)) {
          checked = answer.includes(optionMatch.optionValue);
        } else if (typeof answer === "boolean") {
          const matchedField = detected.find((f) => f.id === optionMatch.fieldId);
          const optionIndex = matchedField?.options?.findIndex((o) => o.value === optionMatch.optionValue) ?? -1;
          const option = matchedField?.options?.[optionIndex];
          checked = option ? isAffirmativeOption(option, optionIndex) === answer : false;
        } else {
          checked = answerToText(answer).toLowerCase() === optionMatch.optionValue.toLowerCase();
        }

        if (acroField instanceof PDFCheckBox) {
          if (checked) acroField.check();
          else acroField.uncheck();
          filledCount++;
        }
        continue;
      }

      const fieldId = fieldMatches.get(name);
      if (!fieldId) continue;
      const answer = answers[fieldId];
      const text = answerToText(answer);
      if (!text) continue;

      if (acroField instanceof PDFTextField) {
        acroField.setText(text);
      } else if (acroField instanceof PDFCheckBox) {
        if (answer === true || text.toLowerCase() === "yes") acroField.check();
        else acroField.uncheck();
      } else if (acroField instanceof PDFRadioGroup) {
        acroField.select(text);
      } else if (acroField instanceof PDFDropdown) {
        acroField.select(text);
      } else if (acroField instanceof PDFOptionList) {
        acroField.select(Array.isArray(answer) ? answer : [text]);
      } else {
        continue;
      }
      filledCount++;
    } catch {
      // A value that doesn't match this field's constraints (e.g. an option
      // that doesn't exist) shouldn't abort the rest of the document.
    }
  }

  if (filledCount === 0) return null;

  form.flatten();
  return { bytes: await pdf.save(), filledCount, totalAcroFields: acroFields.length };
}
