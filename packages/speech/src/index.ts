import type { Announcement } from '@formfill/conversation';
import type { Field } from '@formfill/form-model';

/**
 * The ONLY module in the codebase permitted to call `speechSynthesis.speak()`.
 * Enforced by ESLint `no-restricted-globals` everywhere else.
 *
 * This exists because the two worst failure modes in FormFill are double-speech
 * (app talking over a screen reader) and silence (no screen reader and a mute
 * app). Both are one-line mistakes if any component can speak. Routing every
 * utterance through one queue makes the guarantee structural rather than
 * a convention people remember. See docs/ACCESSIBILITY.md §1.
 */

export type SpeechMode = 'sr' | 'spoken';

const STORAGE_KEY = 'formfill.speechMode';

/**
 * Resolve which mode to run in.
 *
 * 1. An explicit user setting always wins.
 * 2. Heuristics are best-effort only and never authoritative.
 * 3. When unknown, default to `sr` — silence is recoverable (the user presses
 *    "Read aloud"); double-speech is not, it drives users away immediately.
 */
export function resolveMode(stored?: string | null): SpeechMode {
  if (stored === 'sr' || stored === 'spoken') return stored;
  return 'sr';
}

export function loadMode(): SpeechMode {
  if (typeof localStorage === 'undefined') return 'sr';
  return resolveMode(localStorage.getItem(STORAGE_KEY));
}

export function saveMode(mode: SpeechMode): void {
  if (typeof localStorage !== 'undefined') localStorage.setItem(STORAGE_KEY, mode);
}

export interface SpeechOptions {
  rate?: number;
  pitch?: number;
  voiceURI?: string;
  lang?: string;
}

/**
 * Serialises announcements so utterances never overlap. `interruptible: false`
 * announcements (questions, errors) cancel anything queued behind them, because
 * a user who has pressed N does not want to hear the tail of the last sentence.
 */
export class AnnouncementQueue {
  private queue: Announcement[] = [];
  private speaking = false;
  private mode: SpeechMode;
  private options: SpeechOptions;

  constructor(mode: SpeechMode, options: SpeechOptions = {}) {
    this.mode = mode;
    this.options = { rate: 1.0, pitch: 1.0, lang: 'en-GB', ...options };
  }

  setMode(mode: SpeechMode): void {
    if (mode === this.mode) return;
    this.mode = mode;
    if (mode === 'sr') this.cancel();
  }

  getMode(): SpeechMode {
    return this.mode;
  }

  /**
   * In `sr` mode this is a no-op by design: the UI has already written the same
   * text into an ARIA live region, and the user's own screen reader speaks it.
   */
  push(announcements: Announcement[]): void {
    if (this.mode === 'sr') return;
    if (typeof speechSynthesis === 'undefined') return;

    for (const a of announcements) {
      if (!a.interruptible) this.cancel();
      this.queue.push(a);
    }
    this.drain();
  }

  cancel(): void {
    this.queue = [];
    this.speaking = false;
    if (typeof speechSynthesis !== 'undefined') speechSynthesis.cancel();
  }

  private drain(): void {
    if (this.speaking) return;
    const next = this.queue.shift();
    if (!next) return;

    this.speaking = true;
    // eslint-disable-next-line no-restricted-globals -- the single sanctioned call site
    const utterance = new SpeechSynthesisUtterance(next.text);
    utterance.rate = this.options.rate ?? 1;
    utterance.pitch = this.options.pitch ?? 1;
    utterance.lang = this.options.lang ?? 'en-GB';
    utterance.onend = utterance.onerror = () => {
      this.speaking = false;
      this.drain();
    };
    speechSynthesis.speak(utterance);
  }
}

/* -------------------------------------------------------------------------- */
/* Speech input                                                                */
/* -------------------------------------------------------------------------- */

export type DictationBackend = 'os' | 'webspeech' | 'none';

/**
 * Cloud speech recognition is hard-blocked on sensitive fields. This is a
 * function in `speech` rather than a check in UI code so it cannot be forgotten
 * at a new call site. See docs/ACCESSIBILITY.md §6 and docs/PRIVACY.md §2.
 */
export function dictationAllowed(field: Field, backend: DictationBackend): boolean {
  if (backend === 'none') return false;
  if (field.sensitivity === 'sensitive' && backend === 'webspeech') return false;
  return true;
}

/**
 * Recognised speech is ALWAYS read back before acceptance. Recognition on
 * names, postcodes and ID numbers is error-prone, and those are precisely the
 * fields where a silent mistake does the most damage.
 */
export function confirmationPrompt(field: Field, heard: string): string {
  return `I heard: ${heard}. Press Enter to accept, or say it again.`;
}
