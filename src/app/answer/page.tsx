"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import Button from "@/components/ui/Button";
import Card from "@/components/ui/Card";
import Notice from "@/components/ui/Notice";
import StepIndicator from "@/components/StepIndicator";
import AnswerControl from "@/components/answer/AnswerControl";
import { useFormSession } from "@/lib/form-session-context";
import { flattenFields } from "@/lib/form-model";
import { answerToText } from "@/lib/answer-format";

function speak(text: string) {
  if (typeof window === "undefined" || !("speechSynthesis" in window) || !text) return;
  window.speechSynthesis.cancel();
  window.speechSynthesis.speak(new SpeechSynthesisUtterance(text));
}

/** "abc 12" -> "a, b, c, space, 1, 2" so a screen reader/TTS voice reads it letter by letter. */
function spellOut(text: string): string {
  return text
    .split("")
    .map((ch) => (ch === " " ? "space" : ch))
    .join(", ");
}

export default function AnswerPage() {
  const router = useRouter();
  const { result, answers, setAnswer } = useFormSession();
  const fields = useMemo(() => (result ? flattenFields(result.sections) : []), [result]);

  const [index, setIndex] = useState(0);
  const [showHelp, setShowHelp] = useState(false);
  const [announcement, setAnnouncement] = useState("");
  const headingRef = useRef<HTMLHeadingElement>(null);

  const field = fields[index];
  const isFirst = index === 0;
  const isLast = index === fields.length - 1;

  useEffect(() => {
    setShowHelp(false);
    headingRef.current?.focus();
  }, [index]);

  const goNext = useCallback(() => setIndex((i) => Math.min(i + 1, fields.length - 1)), [fields.length]);
  const goPrevious = useCallback(() => setIndex((i) => Math.max(i - 1, 0)), []);
  const toggleHelp = useCallback(() => setShowHelp((v) => !v), []);
  const goReview = useCallback(() => router.push("/review-answers"), [router]);

  // Both the "Read as printed" button and the L shortcut do the same thing:
  // spell out, letter by letter, what the user actually typed into the
  // answer box — not the form's original label text — so they can confirm
  // exactly what was entered before moving on.
  const spellTypedAnswer = useCallback(() => {
    const text = field ? answerToText(answers[field.id]) : "";
    if (!text) {
      setAnnouncement("Nothing typed yet.");
      speak("Nothing typed yet.");
      return;
    }
    setAnnouncement(`You typed: ${text}`);
    speak(spellOut(text));
  }, [field, answers]);

  // Global keyboard shortcuts, suspended while typing in the answer field so
  // e.g. typing the letter "n" in a name doesn't jump to the next question.
  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      const active = document.activeElement;
      const isTyping =
        active instanceof HTMLElement && ["INPUT", "TEXTAREA"].includes(active.tagName);
      if (isTyping || event.metaKey || event.ctrlKey || event.altKey) return;

      switch (event.key.toLowerCase()) {
        case "n":
          goNext();
          break;
        case "p":
          goPrevious();
          break;
        case "h":
          toggleHelp();
          break;
        case "l":
          spellTypedAnswer();
          break;
        case "r":
          goReview();
          break;
        default:
          return;
      }
      event.preventDefault();
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [goNext, goPrevious, toggleHelp, spellTypedAnswer, goReview]);

  if (!result || fields.length === 0) {
    return (
      <main id="main-content" className="mx-auto w-full max-w-3xl flex-1 px-6 py-10">
        <Card as="section" aria-labelledby="no-fields-heading" tabIndex={0} className="space-y-4">
          <h1 id="no-fields-heading" className="text-xl font-semibold">
            Nothing to answer yet
          </h1>
          <p className="text-muted">Go back and review your form's fields first.</p>
          <div className="flex justify-end">
            <Link href="/fields">
              <Button type="button" variant="primary">
                Back to overview
              </Button>
            </Link>
          </div>
        </Card>
      </main>
    );
  }

  return (
    <main id="main-content" className="mx-auto w-full max-w-3xl flex-1 px-6 py-10">
      <div className="space-y-8">
        <StepIndicator currentIndex={3} />

        <Card as="section" aria-labelledby="question-heading" className="space-y-6">
          <div>
            <p className="text-sm text-muted">
              {field.sectionTitle} · Question {index + 1} of {fields.length}
            </p>
            <h1
              ref={headingRef}
              tabIndex={-1}
              id="question-heading"
              className="mt-1 text-2xl font-bold tracking-tight"
            >
              {field.spokenLabel}
            </h1>
            {!field.required && <p className="mt-1 text-muted">This one is optional.</p>}
          </div>

          {showHelp && <Notice>{field.help || "No additional help for this question."}</Notice>}

          <AnswerControl
            field={field}
            value={answers[field.id] ?? null}
            onChange={(value) => setAnswer(field.id, value)}
          />

          <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
            <Button type="button" variant="primary" disabled={isLast} onClick={goNext}>
              Next
            </Button>
            <Button type="button" variant="secondary" disabled={isFirst} onClick={goPrevious}>
              Previous
            </Button>
            <Button type="button" variant="secondary" aria-pressed={showHelp} onClick={toggleHelp}>
              Help
            </Button>
            <Button type="button" variant="secondary" onClick={spellTypedAnswer}>
              Read as printed
            </Button>
          </div>

          <p className="text-sm text-muted">
            Keyboard: N next · P previous · H toggles help · L spells back what you typed · R
            jumps to review.
          </p>

          <p role="status" aria-live="polite" className="sr-only">
            {announcement}
          </p>
        </Card>

        <div className="flex justify-between">
          <Link href="/fields">
            <Button type="button" variant="secondary">
              Back to overview
            </Button>
          </Link>
          <Button type="button" variant="primary" onClick={goReview}>
            Review answers
          </Button>
        </div>
      </div>
    </main>
  );
}
