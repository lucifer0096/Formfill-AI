"use client";

import { useEffect, useState } from "react";
import Button from "./Button";
import { isSpeechSupported, isSpeaking, speak, stopSpeaking } from "@/lib/speech";

interface ReadAloudButtonProps {
  /** The text to speak. A button rendered with empty text is disabled rather than hidden, so its position in the row stays predictable. */
  text: string;
}

/**
 * The manual "Read aloud" control docs/ACCESSIBILITY.md §1.1 calls out as
 * the safe default: silence is recoverable by clicking this, so there is no
 * auto-detection or auto-speaking anywhere in the app yet. Toggles between
 * "Read aloud" and "Stop reading" so a user is never stuck waiting for a
 * long utterance to finish before they can silence it.
 */
export default function ReadAloudButton({ text }: ReadAloudButtonProps) {
  const [speaking, setSpeaking] = useState(false);

  // isSpeechSupported() is a pure, synchronous check of window/the
  // speechSynthesis global (false during server prerendering, whatever the
  // browser actually supports on the client's first paint) — nothing to
  // defer to an effect. Deferring it would just delay the button appearing
  // for no reason, and setState-in-an-effect for this is exactly the
  // pattern this codebase's own lint rule (react-hooks/set-state-in-effect)
  // already flags elsewhere.
  const supported = isSpeechSupported();

  // Stop the active utterance rather than leaving it running behind the
  // scenes if the user navigates away (a new question, a different route)
  // while this instance is still speaking.
  useEffect(() => {
    return () => {
      if (isSpeaking()) stopSpeaking();
    };
  }, [text]);

  if (!supported) return null;

  function handleClick() {
    if (speaking) {
      stopSpeaking();
      setSpeaking(false);
      return;
    }
    setSpeaking(true);
    speak(text, () => setSpeaking(false));
  }

  return (
    <Button type="button" variant="secondary" disabled={!text.trim()} onClick={handleClick}>
      {speaking ? "Stop reading" : "Read aloud"}
    </Button>
  );
}
