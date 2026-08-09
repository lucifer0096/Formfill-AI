"use client";

import { useEffect } from "react";
import { registerReadAloudText, speakRegisteredText, stopSpeaking, isSpeaking } from "./index";

/**
 * Registers this page's current "read aloud" text as what Ctrl+Alt+S
 * speaks, per docs/ACCESSIBILITY.md §1's global toggle. Call once per page
 * with whatever text that page's own ReadAloudButton already speaks on
 * click — this doesn't add a second source of truth for what gets said,
 * just a second way to trigger the same speech.
 */
export function useRegisterReadAloud(text: string): void {
  useEffect(() => {
    registerReadAloudText(text);
  }, [text]);
}

/**
 * The actual Ctrl+Alt+S listener. Mounted once, in the root layout — see
 * that file for why a single global mount is correct here rather than one
 * per page. Toggles: if something is already speaking, Ctrl+Alt+S stops it;
 * otherwise it speaks whatever the current page last registered.
 */
export function useGlobalReadAloudShortcut(): void {
  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if (!event.ctrlKey || !event.altKey || event.key.toLowerCase() !== "s") return;
      // Suspended while typing, same rule ACCESSIBILITY.md §3 already
      // applies to every other single-key command in this app — Ctrl+Alt
      // held down while typing a real word containing "s" is rare, but not
      // impossible, and the cost of getting this wrong (eating a keystroke)
      // is worse than the cost of occasionally requiring focus to leave the
      // field first.
      const target = event.target as HTMLElement | null;
      const isTyping = target?.tagName === "INPUT" || target?.tagName === "TEXTAREA";
      if (isTyping) return;

      // If any modal dialog is ever open (a real role="dialog"/aria-modal
      // element, none exist in the app today), suspend this the same way
      // it's already suspended while typing — a global shortcut firing
      // speech on top of whatever that dialog is doing on its own would be
      // exactly the kind of two-things-talking-at-once bug this file
      // exists to prevent.
      if (document.querySelector('[role="dialog"][aria-modal="true"]')) return;

      event.preventDefault();
      if (isSpeaking()) {
        stopSpeaking();
      } else {
        speakRegisteredText();
      }
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);
}
