/**
 * Explicit sr/spoken mode setting, per docs/ACCESSIBILITY.md §1.1's
 * detection order: "Explicit user setting, persisted, always wins." This is
 * layer 1 only (the safe one) — no heuristic auto-detection (layer 2) is
 * implemented here, that remains a real, separate scope decision.
 *
 * Layer 3 of the spec, "default when unknown: sr mode," is enforced simply
 * by getMode() returning null until the user has actually answered the
 * first-run prompt — every existing Read Aloud control already only speaks
 * on a manual click regardless of mode, so an unanswered/null mode already
 * behaves exactly like "silent until asked," with no separate default logic
 * needed.
 */

export type SpeechMode = "sr" | "spoken";

const STORAGE_KEY = "mfif-speech-mode";

export function getMode(): SpeechMode | null {
  if (typeof window === "undefined") return null;
  try {
    const stored = window.localStorage.getItem(STORAGE_KEY);
    return stored === "sr" || stored === "spoken" ? stored : null;
  } catch {
    // Private browsing / storage disabled — treat as "not yet answered"
    // rather than crashing; the prompt will just ask again next visit.
    return null;
  }
}

export function setMode(mode: SpeechMode): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(STORAGE_KEY, mode);
  } catch {
    // Nothing to persist to — the choice still applies for this page load
    // via the caller's own React state, it just won't survive a reload.
  }
}
