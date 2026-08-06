"use client";

import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import Card from "@/components/ui/Card";
import Button from "@/components/ui/Button";
import { getMode, setMode, type SpeechMode } from "@/lib/speech/mode";
import { speak } from "@/lib/speech";

const noopSubscribe = () => () => {};

/**
 * The explicit-setting layer of docs/ACCESSIBILITY.md §1.1's mode
 * resolution: "Offered on first run as a spoken AND visual question with
 * two enormous buttons: 'Do you already use a screen reader?'" Shown once;
 * the answer is persisted and this never appears again unless storage is
 * cleared. No heuristic guessing happens before or after this — the
 * decision is fully in the user's hands, exactly as the spec requires.
 */
export default function SpeechModePrompt() {
  // getMode() reads localStorage, a browser-only external source — same
  // reasoning as loadWorkingForm() in overview/page.tsx: useSyncExternalStore
  // is what reads it safely (getServerSnapshot returns null during
  // prerendering, so this never flashes real UI before hydration settles),
  // where a setState-in-an-effect would otherwise cause an extra render for
  // what's really just reading initial state, not synchronizing a change.
  const persistedMode = useSyncExternalStore<SpeechMode | null>(
    noopSubscribe,
    getMode,
    () => null,
  );
  // Once the user answers, `override` holds the real, current choice —
  // getMode() itself won't re-run just because state changed elsewhere, so
  // this is what actually drives the dialog closing immediately on click.
  const [override, setOverride] = useState<SpeechMode | null>(null);
  const mode = override ?? persistedMode;
  const visible = mode === null;
  const headingRef = useRef<HTMLHeadingElement>(null);

  useEffect(() => {
    if (!visible) return;
    headingRef.current?.focus();
    // Spoken per the spec's "spoken AND visual question" requirement — a
    // first-time visitor who can't see the screen and has no screen reader
    // running needs to actually hear this question to answer it at all.
    speak("Do you already use a screen reader? Press Y for yes, or N for no.");
  }, [visible]);

  function choose(next: SpeechMode) {
    setMode(next);
    setOverride(next);
  }

  useEffect(() => {
    if (!visible) return;
    function onKeyDown(event: KeyboardEvent) {
      const key = event.key.toLowerCase();
      if (key === "y") choose("sr");
      else if (key === "n") choose("spoken");
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [visible]);

  if (!visible) return null;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="speech-mode-heading"
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-6"
    >
      <Card className="w-full max-w-lg space-y-6 text-center">
        <h2
          id="speech-mode-heading"
          ref={headingRef}
          tabIndex={-1}
          className="text-2xl font-bold focus-visible:outline-none"
        >
          Do you already use a screen reader?
        </h2>
        <p className="text-muted">
          This helps MFIF decide whether to stay silent and let your screen reader do the talking,
          or speak out loud itself. You can change this at any time with <kbd>Ctrl</kbd>+
          <kbd>Alt</kbd>+<kbd>S</kbd>.
        </p>
        <div className="flex flex-col gap-4 sm:flex-row sm:justify-center">
          <Button type="button" variant="primary" className="text-lg" onClick={() => choose("sr")}>
            Yes, I use a screen reader (Y)
          </Button>
          <Button
            type="button"
            variant="secondary"
            className="text-lg"
            onClick={() => choose("spoken")}
          >
            No, speak to me instead (N)
          </Button>
        </div>
      </Card>
    </div>
  );
}
