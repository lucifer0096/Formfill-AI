import type { TextLine } from "./extract-text-layer";

export interface FieldRect {
  page: number;
  x: number;
  y: number;
  width: number;
  height: number;
}

type Direction = "left" | "right" | "above";

/**
 * Finds the line of text most likely to be this field's printed label, by
 * position rather than the field's internal PDF name — real-world forms
 * routinely name fields meaninglessly ("Text1", "CheckBox3"), but the label
 * printed next to the field on the page is always the real question. Tries
 * each direction in order and returns the first (closest) match found;
 * `directions` should be ordered by how that field type is normally
 * labeled (e.g. checkboxes: label to the right; text fields: label to the left).
 */
export function nearbyLabelText(rect: FieldRect, lines: TextLine[], directions: Direction[]): string {
  const sameRowTolerance = rect.height + 4;
  const candidates = lines.filter((l) => l.page === rect.page);
  const rectCenterY = rect.y + rect.height / 2;

  for (const direction of directions) {
    let best: TextLine | null = null;
    let bestDistance = Infinity;

    for (const line of candidates) {
      const lineCenterY = line.y + line.height / 2;

      if (direction === "left" || direction === "right") {
        if (Math.abs(lineCenterY - rectCenterY) > sameRowTolerance) continue;

        const gap =
          direction === "left" ? rect.x - (line.x + line.width) : line.x - (rect.x + rect.width);
        // Must actually sit on that side (small negative tolerance for
        // touching/overlapping text) and within plausible reading distance.
        if (gap < -2 || gap > 260) continue;
        if (gap < bestDistance) {
          bestDistance = gap;
          best = line;
        }
      } else {
        const gap = line.y - (rect.y + rect.height);
        if (gap < -2 || gap > 24) continue;
        const overlap = Math.min(line.x + line.width, rect.x + rect.width) - Math.max(line.x, rect.x);
        if (overlap < -40) continue;
        if (gap < bestDistance) {
          bestDistance = gap;
          best = line;
        }
      }
    }

    if (best) return best.text;
  }

  return "";
}
