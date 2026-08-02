"use client";

import { useEffect, useId, useRef, useState, useSyncExternalStore } from "react";
import Card from "@/components/ui/Card";
import Button from "@/components/ui/Button";
import LinkButton from "@/components/ui/LinkButton";
import ProgressTrail from "@/components/ProgressTrail";
import { loadAnswers, loadWorkingForm, saveAnswers } from "@/lib/session-store";
import type { Field } from "@/lib/form-model/types";

/**
 * Global single-key commands from ACCESSIBILITY.md §3. Only active when
 * focus is NOT in a text input — that suspension is a hard rule there
 * ("the app ate my typing" is called out by name as the classic bug this
 * causes if you get it wrong).
 */
const KEY_ACTIONS = new Set(["n", "p", " ", "h", "s"]);

const noopSubscribe = () => () => {};

// Memoized on the underlying Form's identity (loadWorkingForm/loadIngestResult
// are themselves cached in session-store.ts and return a stable reference
// when nothing changed). Without this, .flatMap() below would allocate a new
// array on every call, and useSyncExternalStore requires getSnapshot to
// return a stable reference across calls or React re-renders forever — see
// the comment in session-store.ts's loadIngestResult for the full story.
let fieldsCache: { form: unknown; fields: Field[] } | null = null;

function readFields(): Field[] {
  const { form } = loadWorkingForm();
  if (fieldsCache && fieldsCache.form === form) return fieldsCache.fields;
  const fields = form.sections.flatMap((s) => s.fields);
  fieldsCache = { form, fields };
  return fields;
}

export default function QuestionsPage() {
  // sessionStorage is browser-only; useSyncExternalStore reads it safely
  // across server prerendering (getServerSnapshot) and the client, without
  // a setState-in-effect or a hydration mismatch. `fields` is read once and
  // never mutated, so it fits the external-store model directly.
  const fields = useSyncExternalStore(noopSubscribe, readFields, () => null);
  const [index, setIndex] = useState(0);
  // `answers` IS mutated locally (typing updates it), so it stays real
  // state — but its initial value still needs the same SSR-safe read.
  // Safe here because `fields` is null during the server/first-paint
  // render, so this value is never visually shown before hydration.
  const [answers, setAnswers] = useState<Record<string, string>>(() =>
    typeof window === "undefined" ? {} : loadAnswers(),
  );
  const [showHelp, setShowHelp] = useState(false);
  const [touched, setTouched] = useState(false);
  const helpId = useId();
  const headingRef = useRef<HTMLHeadingElement>(null);

  // Focus (and therefore announce, for a screen reader) the new question
  // every time it changes — not just once on mount. ACCESSIBILITY.md §3.
  useEffect(() => {
    headingRef.current?.focus();
  }, [index]);

  if (!fields) {
    return (
      <main id="main-content" className="mx-auto w-full max-w-2xl flex-1 px-6 py-10">
        <p role="status" aria-live="polite" className="text-muted">
          Loading…
        </p>
      </main>
    );
  }

  if (fields.length === 0) {
    return (
      <main id="main-content" className="mx-auto w-full max-w-2xl flex-1 px-6 py-10">
        <ProgressTrail current={4} />
        <p className="mt-8 text-lg text-muted">This form has no questions to answer.</p>
        <div className="mt-8">
          <LinkButton href="/overview" variant="secondary">
            Back to overview
          </LinkButton>
        </div>
      </main>
    );
  }

  const field = fields[index];
  const isLast = index === fields.length - 1;
  const value = answers[field.id] ?? "";
  const isInvalid = touched && field.required && value.trim() === "";

  function commitAndAdvance(nextValue: string) {
    const next = { ...answers, [field.id]: nextValue };
    setAnswers(next);
    saveAnswers(next);
    setShowHelp(false);
    setTouched(false);
    if (!isLast) setIndex((i) => i + 1);
  }

  function goPrevious() {
    setTouched(false);
    setIndex((i) => Math.max(0, i - 1));
  }

  /**
   * ACCESSIBILITY.md §3: N/P/Space/H/S single-key nav, suspended whenever a
   * text input has focus. This handler sits on the page root, not the
   * document, and checks the active element itself so it works regardless
   * of what currently has focus outside the input.
   */
  function handleKeyDown(event: React.KeyboardEvent<HTMLDivElement>) {
    const target = event.target as HTMLElement;
    const isTextInput = target.tagName === "INPUT" || target.tagName === "TEXTAREA";
    if (isTextInput) return;

    const key = event.key.toLowerCase();
    if (!KEY_ACTIONS.has(key)) return;

    switch (key) {
      case "n":
        event.preventDefault();
        commitAndAdvance(value);
        break;
      case "p":
        event.preventDefault();
        goPrevious();
        break;
      case " ":
        event.preventDefault();
        headingRef.current?.focus();
        break;
      case "h":
        event.preventDefault();
        setShowHelp((s) => !s);
        break;
      case "s":
        if (!field.required) {
          event.preventDefault();
          commitAndAdvance("");
        }
        break;
    }
  }

  return (
    <main
      id="main-content"
      className="mx-auto w-full max-w-2xl flex-1 px-6 py-10"
      onKeyDown={handleKeyDown}
    >
      <ProgressTrail current={4} />

      <p className="mt-8 text-sm font-medium text-muted" role="status" aria-live="polite">
        Question {index + 1} of {fields.length}
      </p>

      <Card as="section" aria-labelledby="question-heading" className="mt-4">
        <h1
          id="question-heading"
          ref={headingRef}
          tabIndex={-1}
          className="text-2xl font-bold focus-visible:outline-none"
        >
          {field.spokenLabel}
        </h1>
        {!field.required && <p className="mt-1 text-sm text-muted">This one is optional.</p>}

        <form
          className="mt-6"
          onSubmit={(event) => {
            event.preventDefault();
            setTouched(true);
            if (field.required && value.trim() === "") return;
            commitAndAdvance(value);
          }}
        >
          <label htmlFor="answer" className="sr-only">
            {field.spokenLabel}
          </label>
          <input
            id="answer"
            type="text"
            value={value}
            aria-describedby={showHelp ? helpId : undefined}
            aria-invalid={isInvalid}
            aria-required={field.required}
            onChange={(event) => setAnswers((prev) => ({ ...prev, [field.id]: event.target.value }))}
            className={`w-full rounded-md border-2 bg-background px-4 py-3 text-lg focus-visible:outline-3 focus-visible:outline-accent-strong ${
              isInvalid ? "border-accent-strong" : "border-muted/40"
            }`}
          />

          {isInvalid && (
            <p role="alert" className="mt-2 text-sm font-medium text-accent-strong">
              {field.spokenLabel} — this one is required.
            </p>
          )}

          {showHelp && (
            <p id={helpId} role="status" className="mt-3 text-sm text-muted">
              {field.help ?? `This is asking for: ${field.spokenLabel}`}
            </p>
          )}

          <div className="mt-6 flex flex-wrap gap-4">
            <Button type="submit" variant="primary">
              {isLast ? "Finish" : "Next"}
            </Button>
            <Button type="button" variant="secondary" onClick={goPrevious} disabled={index === 0}>
              Previous
            </Button>
            <Button type="button" variant="secondary" onClick={() => setShowHelp((s) => !s)}>
              {showHelp ? "Hide help" : "Help"}
            </Button>
            {!field.required && (
              <Button type="button" variant="secondary" onClick={() => commitAndAdvance("")}>
                Skip
              </Button>
            )}
          </div>

          <p className="mt-4 text-xs text-muted">
            Keyboard: N next, P previous, Space repeats the question, H toggles help
            {!field.required ? ", S skips" : ""}. Suspended while typing in the answer box.
          </p>
        </form>
      </Card>

      <div className="mt-8 flex justify-between">
        <LinkButton href="/overview" variant="secondary">
          Back to overview
        </LinkButton>
        {isLast && (
          <LinkButton href="/confirm" variant="primary">
            Review answers
          </LinkButton>
        )}
      </div>
    </main>
  );
}
