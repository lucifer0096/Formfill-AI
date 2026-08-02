/**
 * PII detectors. See docs/PRIVACY.md §3.
 *
 * DESIGN NOTE ON THRESHOLDS: recall is the safety metric here, not precision.
 * A false positive costs us a slightly worse Form IR (the model sees
 * ⟨PERSON_1⟩ where the word "Manager" stood). A false negative is a leak.
 * Every detector below is therefore deliberately tuned to over-match.
 */

export type PiiKind =
  | 'PERSON'
  | 'DOB'
  | 'ADDRESS'
  | 'POSTCODE'
  | 'NATIONAL_ID'
  | 'HEALTH_ID'
  | 'EMAIL'
  | 'PHONE'
  | 'ACCOUNT'
  | 'HANDWRITING';

export interface PiiSpan {
  kind: PiiKind;
  start: number;
  end: number;
  text: string;
}

interface Detector {
  kind: PiiKind;
  pattern: RegExp;
  /** Optional second-stage check to reduce obviously wrong matches. */
  accept?: (match: RegExpExecArray, source: string) => boolean;
}

/**
 * Labels that indicate the text following is a value, not a question.
 * Signature lines matter as much as name fields — a scanned form that has been
 * partly completed by hand carries the applicant's name next to "Signed".
 */
const VALUE_CONTEXT =
  /(name|surname|forename|given|family|applicant|claimant|patient|customer|member|signed|signature|print(ed)?|address|d\.?o\.?b|date of birth|born|tel|phone|mobile|email|e-mail|national insurance|ni number|nino|ssn|social security|nhs|account|sort code|iban)\s*[:\-]?\s*$/i;

const DETECTORS: Detector[] = [
  {
    kind: 'EMAIL',
    pattern: /\b[\w.+-]+@[\w-]+\.[\w.-]{2,}\b/g,
  },
  {
    kind: 'NATIONAL_ID',
    // UK National Insurance number.
    pattern: /\b[A-CEGHJ-PR-TW-Z][A-CEGHJ-NPR-TW-Z]\s?\d{2}\s?\d{2}\s?\d{2}\s?[A-D]\b/gi,
  },
  {
    kind: 'NATIONAL_ID',
    // US SSN. Over-matches any 3-2-4 digit group; see recall note above.
    pattern: /\b\d{3}-\d{2}-\d{4}\b/g,
  },
  {
    kind: 'HEALTH_ID',
    // NHS number, 3-3-4.
    pattern: /\b\d{3}\s?\d{3}\s?\d{4}\b/g,
  },
  {
    kind: 'POSTCODE',
    pattern: /\b[A-Z]{1,2}\d[A-Z\d]?\s?\d[A-Z]{2}\b/gi,
  },
  {
    kind: 'POSTCODE',
    // US ZIP, only when preceded by a state-like token to limit false hits.
    pattern: /\b[A-Z]{2}\s+\d{5}(?:-\d{4})?\b/g,
  },
  {
    kind: 'PHONE',
    pattern: /(?:\+\d{1,3}[\s-]?)?(?:\(\d{2,5}\)|\d{2,5})[\s-]?\d{3,4}[\s-]?\d{3,4}\b/g,
    accept: (m) => m[0].replace(/\D/g, '').length >= 9,
  },
  {
    kind: 'ACCOUNT',
    // IBAN.
    pattern: /\b[A-Z]{2}\d{2}[\sA-Z0-9]{10,30}\b/g,
  },
  {
    kind: 'ACCOUNT',
    // UK sort code + account number.
    pattern: /\b\d{2}-\d{2}-\d{2}\b|\b\d{8}\b/g,
  },
  {
    kind: 'DOB',
    pattern: /\b\d{1,2}[/.\-]\d{1,2}[/.\-]\d{2,4}\b|\b\d{4}-\d{2}-\d{2}\b/g,
  },
  {
    kind: 'PERSON',
    // Two or more capitalised words immediately after a name-ish label.
    pattern: /\b[A-Z][a-z]+(?:\s+[A-Z][a-z'’-]+)+\b/g,
    accept: (m, source) => VALUE_CONTEXT.test(source.slice(Math.max(0, m.index - 40), m.index)),
  },
];

/**
 * Find PII spans in a block of extracted text. Overlapping matches are resolved
 * in favour of the longer span so a date inside an address is not split.
 */
export function detect(text: string): PiiSpan[] {
  const spans: PiiSpan[] = [];

  for (const det of DETECTORS) {
    const re = new RegExp(det.pattern.source, det.pattern.flags);
    let m: RegExpExecArray | null;
    while ((m = re.exec(text)) !== null) {
      if (m[0].length === 0) {
        re.lastIndex++;
        continue;
      }
      if (det.accept && !det.accept(m, text)) continue;
      spans.push({ kind: det.kind, start: m.index, end: m.index + m[0].length, text: m[0] });
    }
  }

  return dedupe(spans);
}

function dedupe(spans: PiiSpan[]): PiiSpan[] {
  const sorted = [...spans].sort((a, b) => a.start - b.start || b.end - a.end);
  const out: PiiSpan[] = [];
  for (const s of sorted) {
    const last = out.at(-1);
    if (last && s.start < last.end) {
      // Overlap: keep the longer span rather than emitting both.
      if (s.end > last.end) out[out.length - 1] = { ...last, end: s.end };
      continue;
    }
    out.push(s);
  }
  return out;
}
