/**
 * The one and only place in the codebase allowed to call
 * speechSynthesis.speak(). See docs/ACCESSIBILITY.md §1's hard rule: exactly
 * one component may ever call this, so the app can never end up talking
 * over a real screen reader in more than one place at once.
 *
 * This is deliberately the manual-trigger slice of the full spoken-mode
 * spec (§1.1), not the whole thing: no mode auto-detection, no first-run
 * prompt, no global Ctrl+Alt+S toggle yet. Those are real, separate scope
 * decisions the team should make together. What ships here is the spec's
 * own stated safe fallback — "the user hits the persistent Read aloud
 * control" — a manual, on-demand button, never automatic, so there is no
 * way for this to start talking over a screen reader a user already has
 * running.
 */

let currentUtterance: SpeechSynthesisUtterance | null = null;

export function isSpeechSupported(): boolean {
  return typeof window !== "undefined" && "speechSynthesis" in window;
}

/** True while an utterance started by speak() is still playing. */
export function isSpeaking(): boolean {
  return isSpeechSupported() && window.speechSynthesis.speaking;
}

/**
 * Speaks the given text, replacing anything currently speaking. A manual
 * click always wins over a previous utterance rather than queuing behind
 * it — the user asked for THIS text now, not to wait through a stale one.
 */
export function speak(text: string, onEnd?: () => void): void {
  if (!isSpeechSupported() || !text.trim()) return;

  window.speechSynthesis.cancel();

  const utterance = new SpeechSynthesisUtterance(text);
  utterance.onend = () => {
    if (currentUtterance === utterance) currentUtterance = null;
    onEnd?.();
  };
  utterance.onerror = () => {
    if (currentUtterance === utterance) currentUtterance = null;
  };

  currentUtterance = utterance;
  window.speechSynthesis.speak(utterance);
}

export function stopSpeaking(): void {
  if (!isSpeechSupported()) return;
  window.speechSynthesis.cancel();
  currentUtterance = null;
}

/**
 * What Ctrl+Alt+S speaks right now — whichever page is mounted registers
 * its own "read aloud" text here (see useRegisterReadAloud in
 * use-global-read-aloud.ts), and the last page to register wins, since only
 * one page is ever visible at a time. Deliberately a plain module variable,
 * not React state: this needs to be read from a plain keydown listener with
 * no render involved, the same reasoning the rest of this file already
 * follows for currentUtterance.
 */
let registeredText = "";

export function registerReadAloudText(text: string): void {
  registeredText = text;
}

export function speakRegisteredText(): void {
  speak(registeredText);
}
