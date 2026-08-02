import type { Field } from "@/lib/form-model/types";

/**
 * Ported from main's packages/validate/src/index.ts, unmodified logic.
 * Local, synchronous field validation. Runs entirely on-device — validating
 * an answer must never require a network call, because answers never leave
 * the device (docs/PRIVACY.md on main §1).
 *
 * Messages are written to be HEARD, not read. They lead with what to do, not
 * with the word "Error", and they never say "invalid input".
 */

export interface ValidationResult {
  ok: boolean;
  /** Spoken message. Present when `ok` is false, or when a value was normalised. */
  message?: string;
  /** Canonical form of the value, stored in place of the raw input. */
  normalised?: string | string[] | boolean;
}

const ok = (normalised?: ValidationResult["normalised"]): ValidationResult =>
  normalised === undefined ? { ok: true } : { ok: true, normalised };

const fail = (message: string): ValidationResult => ({ ok: false, message });

/* -------------------------------------------------------------------------- */
/* Locale-specific patterns                                                    */
/* -------------------------------------------------------------------------- */

const UK_POSTCODE = /^[A-Z]{1,2}\d[A-Z\d]?\s*\d[A-Z]{2}$/i;
const US_ZIP = /^\d{5}(-\d{4})?$/;
/** UK National Insurance number, excluding the disallowed prefixes. */
const UK_NI = /^(?!BG|GB|NK|KN|TN|NT|ZZ)[A-CEGHJ-PR-TW-Z][A-CEGHJ-NPR-TW-Z]\d{6}[A-D]$/i;
const US_SSN = /^\d{3}-?\d{2}-?\d{4}$/;
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

/* -------------------------------------------------------------------------- */
/* Date handling                                                               */
/* -------------------------------------------------------------------------- */

/**
 * Accepts what people actually say and type: "3 3 1954", "3/3/1954",
 * "1954-03-03", "3 March 1954". Day-first for en-GB, month-first for en-US.
 */
export function parseDate(input: string, locale = "en-GB"): Date | null {
  const trimmed = input.trim();
  if (!trimmed) return null;

  const iso = /^(\d{4})-(\d{1,2})-(\d{1,2})$/.exec(trimmed);
  if (iso) return makeDate(+iso[1]!, +iso[2]!, +iso[3]!);

  const months = [
    "january", "february", "march", "april", "may", "june",
    "july", "august", "september", "october", "november", "december",
  ];
  const named = /^(\d{1,2})\s+([a-z]+)\s+(\d{4})$/i.exec(trimmed);
  if (named) {
    const idx = months.findIndex((m) => m.startsWith(named[2]!.toLowerCase().slice(0, 3)));
    if (idx >= 0) return makeDate(+named[3]!, idx + 1, +named[1]!);
  }

  const parts = trimmed.split(/[\s/.-]+/).filter(Boolean);
  if (parts.length === 3 && parts.every((p) => /^\d+$/.test(p))) {
    const [a, b, c] = parts.map(Number) as [number, number, number];
    if (c < 100) return null;
    const monthFirst = locale.startsWith("en-US");
    return monthFirst ? makeDate(c, a, b) : makeDate(c, b, a);
  }
  return null;
}

function makeDate(year: number, month: number, day: number): Date | null {
  if (month < 1 || month > 12 || day < 1 || day > 31) return null;
  const d = new Date(Date.UTC(year, month - 1, day));
  // Rejects 31 February and friends, which Date would otherwise roll over.
  if (d.getUTCMonth() !== month - 1 || d.getUTCDate() !== day) return null;
  return d;
}

function toIso(d: Date): string {
  return d.toISOString().slice(0, 10);
}

/* -------------------------------------------------------------------------- */
/* Entry point                                                                 */
/* -------------------------------------------------------------------------- */

export function validate(
  field: Field,
  raw: string | string[] | boolean | null,
  locale = "en-GB",
): ValidationResult {
  const empty =
    raw === null || raw === "" || (Array.isArray(raw) && raw.length === 0);

  if (empty) {
    return field.required
      ? fail(`${field.spokenLabel} is required.`)
      : ok();
  }

  if (typeof raw === "boolean") return ok(raw);

  if (Array.isArray(raw)) {
    if (field.type !== "multichoice") return fail("Only one answer is expected here.");
    const allowed = new Set((field.constraints.options ?? []).map((o) => o.value));
    const bad = raw.filter((v) => !allowed.has(v));
    return bad.length ? fail(`I did not recognise ${bad.join(", ")}.`) : ok(raw);
  }

  const value = raw.trim();
  const { maxLength, pattern, min, max, options } = field.constraints;

  if (maxLength && value.length > maxLength) {
    return fail(`That is too long. ${field.spokenLabel} allows up to ${maxLength} characters.`);
  }

  switch (field.type) {
    case "email":
      return EMAIL.test(value) ? ok(value) : fail("That does not look like an email address. It needs an at sign and a dot.");

    case "phone": {
      const digits = value.replace(/[^\d+]/g, "");
      return digits.replace(/\D/g, "").length >= 7
        ? ok(digits)
        : fail("That phone number looks too short.");
    }

    case "date": {
      const d = parseDate(value, locale);
      if (!d) return fail("I could not read that date. Try day, month, year — for example, 3 3 1954.");
      if (d.getTime() > Date.now()) return fail("That date is in the future.");
      return ok(toIso(d));
    }

    case "number":
    case "currency": {
      const n = Number(value.replace(/[£$€,\s]/g, ""));
      if (Number.isNaN(n)) return fail("That does not look like a number.");
      if (min !== undefined && n < min) return fail(`That is below the minimum of ${min}.`);
      if (max !== undefined && n > max) return fail(`That is above the maximum of ${max}.`);
      return ok(String(n));
    }

    case "choice": {
      const match = (options ?? []).find(
        (o) => o.value === value || o.label.toLowerCase() === value.toLowerCase(),
      );
      if (!match) {
        const list = (options ?? []).map((o) => o.spokenLabel ?? o.label).join(", ");
        return fail(`Please choose one of: ${list}.`);
      }
      return ok(match.value);
    }

    case "boolean":
      if (/^(y|yes|true|tick|check)$/i.test(value)) return ok(true);
      if (/^(n|no|false|untick|uncheck)$/i.test(value)) return ok(false);
      return fail("Please answer yes or no.");

    case "signature":
      // Never accepted digitally in v1 — surfaced at review as "sign by hand".
      return fail("This field needs a handwritten signature. I will flag it at the end.");

    default:
      break;
  }

  // Locale-aware ID and postal formats, keyed off the semantic profile key so
  // they apply regardless of how the form worded the label.
  if (field.profileKey === "postalCode") {
    const valid = locale.startsWith("en-US") ? US_ZIP.test(value) : UK_POSTCODE.test(value);
    return valid ? ok(value.toUpperCase()) : fail("That does not look like a valid postcode.");
  }
  if (field.profileKey === "nationalId") {
    const valid = locale.startsWith("en-US") ? US_SSN.test(value) : UK_NI.test(value.replace(/\s/g, ""));
    return valid ? ok(value.toUpperCase().replace(/\s/g, "")) : fail("That does not look like a valid number. Please check it and try again.");
  }

  if (pattern) {
    try {
      if (!new RegExp(pattern).test(value)) return fail("That is not in the format this form expects.");
    } catch {
      // A malformed pattern from an untrusted source must not block the user.
    }
  }

  return ok(value);
}
