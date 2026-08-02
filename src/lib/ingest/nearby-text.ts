import type { TextBlock } from "./text-layer";
import type { FieldPosition } from "./acroform-position";

type Side = "left" | "right" | "above";

/**
 * Finds the text most likely to be this field's label. Text boxes and long
 * fields are almost always labelled to the left or above; checkboxes and
 * radio buttons are just as often labelled to the right ("☐ Male  ☐ Female"
 * reads as the box first, then its word) — a small, dense field is the
 * strongest signal to check right-of too. Heuristic, not a layout parser: it
 * only needs to beat a field's own (often meaningless) internal name.
 */
export function nearbyLabelText(
  position: FieldPosition,
  blocks: TextBlock[],
  maxCandidates = 3,
): string {
  const samePage = blocks.filter((b) => b.page === position.page);
  // Small boxes (checkboxes, radio buttons) are the case where a right-of
  // label is actually likely; a wide text-entry field's neighbour to the
  // right is usually the next question, not this one's label.
  const isSmallField = position.width < 24 && position.height < 24;

  const scored = samePage
    .map((b) => {
      const blockCenterY = b.y + b.height / 2;
      const fieldCenterY = position.y + position.height / 2;
      const verticalOverlap = Math.abs(blockCenterY - fieldCenterY) < position.height * 1.5;

      const isLeft = b.x + b.width <= position.x + 4 && verticalOverlap;
      const isRight = isSmallField && b.x >= position.x + position.width - 4 && verticalOverlap;
      const isAbove = b.y + b.height <= position.y + 4 && Math.abs(b.x - position.x) < 300;

      let side: Side | null = null;
      if (isLeft) side = "left";
      else if (isRight) side = "right";
      else if (isAbove) side = "above";
      if (!side) return null;

      const dx =
        side === "left"
          ? position.x - (b.x + b.width)
          : side === "right"
            ? b.x - (position.x + position.width)
            : Math.abs(b.x - position.x);
      const dy = side === "above" ? position.y - (b.y + b.height) : 0;
      const distance = Math.sqrt(dx * dx + dy * dy);

      return { text: b.text, distance, side };
    })
    .filter((x): x is { text: string; distance: number; side: Side } => x !== null)
    // Left/right-of labels are far more reliable than above labels on dense
    // forms (checkboxes, grids), so prefer them when distances are close.
    .sort((a, b) => {
      const aSide = a.side === "above" ? 1 : 0;
      const bSide = b.side === "above" ? 1 : 0;
      return aSide === bSide ? a.distance - b.distance : aSide - bSide;
    });

  return scored
    .slice(0, maxCandidates)
    .map((s) => s.text)
    .join(" ")
    .trim();
}
