import type { FieldType } from "@/lib/form-model/types";

/**
 * Plain-language format guidance shown to the user BEFORE they type, not
 * just surfaced after a failed submit (ACCESSIBILITY.md §5). Matches the
 * formats validate/index.ts actually accepts, so the hint never promises
 * something the validator then rejects.
 */
export function formatHintFor(type: FieldType, locale = "en-GB"): string | undefined {
  switch (type) {
    case "date":
      return locale.startsWith("en-US")
        ? "Format: month, day, year — for example, 3 3 1954."
        : "Format: day, month, year — for example, 3 3 1954.";
    case "phone":
      return "Include the area code.";
    case "currency":
      return locale.startsWith("en-US") ? "Amount in dollars." : "Amount in pounds.";
    case "email":
      return "Format: name@example.com.";
    default:
      return undefined;
  }
}
