"use client";

import { useEffect, useId, useRef, useState, useSyncExternalStore } from "react";
import { useRouter } from "next/navigation";
import Card from "@/components/ui/Card";
import Button from "@/components/ui/Button";
import LinkButton from "@/components/ui/LinkButton";
import ProgressTrail from "@/components/ProgressTrail";
import { loadAnswers, loadWorkingForm, saveAnswers } from "@/lib/session-store";
import {
  initialState,
  step,
  type ConversationState,
} from "@/lib/conversation/machine";
import type { Announcement } from "@/lib/conversation/announce";
import { fieldById } from "@/lib/form-model/traverse";

/**
 * Global single-key commands from ACCESSIBILITY.md §3. Only active when
 * focus is NOT in a text input — that suspension is a hard rule there
 * ("the app ate my typing" is called out by name as the classic bug this
 * causes if you get it wrong). Mapped straight onto the conversation
 * engine's own event vocabulary (main's packages/conversation).
 */
const KEY_ACTIONS = new Set(["n", "p", " ", "h", "s", "r", "l"]);

const noopSubscribe = () => () => {};

/**
 * inputValue is a plain string (used directly in text inputs, split/joined
 * for multichoice), but a saved Answer.value can be string | string[] |
 * boolean | null. Converts a saved answer back to what the input should
 * show when revisiting a field, so Previous (and any other navigation back
 * to an already-answered field) doesn't present an empty box.
 */
function answerToInputValue(value: string | string[] | boolean | null | undefined): string {
  if (value == null) return "";
  if (Array.isArray(value)) return value.join(",");
  if (typeof value === "boolean") return value ? "yes" : "no";
  return value;
}

interface Bootstrapped {
  state: ConversationState;
  announcements: Announcement[];
}

// useState's lazy initializer runs on the client's very first render too
// (hydration is still "first render" from the component's point of view),
// so a `typeof window === "undefined"` guard there produces a DIFFERENT
// tree client-side than what the server sent down — a real hydration
// mismatch, not just a lint nag. useSyncExternalStore's getServerSnapshot
// is the part of React's API actually designed for this split: it forces
// server AND the client's first paint to both return null, and only a
// later commit (after hydration settles) re-reads the real client value.
// Cache keyed by identity so repeated calls during one commit are stable.
let bootstrapCache: { form: unknown; answers: unknown; value: Bootstrapped } | null = null;

function readBootstrap(): Bootstrapped {
  const { form } = loadWorkingForm();
  const savedAnswers = loadAnswers();
  if (bootstrapCache && bootstrapCache.form === form && bootstrapCache.answers === savedAnswers) {
    return bootstrapCache.value;
  }
  const state: ConversationState = { ...initialState(form), answers: savedAnswers };
  const value = step(state, { type: "START" });
  bootstrapCache = { form, answers: savedAnswers, value };
  return value;
}

export default function QuestionsPage() {
  const router = useRouter();
  const bootstrapped = useSyncExternalStore<Bootstrapped | null>(
    noopSubscribe,
    readBootstrap,
    () => null,
  );
  // No effect-driven "adopt the bootstrapped value" step: that pattern
  // (setState from an effect just to copy a prop/store value into state)
  // is exactly what react-hooks/set-state-in-effect flags, and rightly —
  // it's an extra render for no reason. `override` holds only what the
  // user's own actions have changed; until the first dispatch, the
  // engine's effective value is simply whatever useSyncExternalStore
  // already gives us, no copying required.
  const [override, setOverride] = useState<Bootstrapped | null>(null);
  const engine = (override ?? bootstrapped)?.state ?? null;
  const lastAnnouncements = (override ?? bootstrapped)?.announcements ?? [];
  // Same derived-state pattern as helpOpenFor/showHelp below: rawInputValue
  // only ever holds what the user actually typed for editedFor's field.
  // Once the question changes (Next, Previous, jumping via review),
  // editedFor no longer matches the new currentField.id, so inputValue
  // falls back to whatever's already saved for it instead of showing
  // stale text from the previous question — no effect needed to "sync"
  // this, same reasoning as the override comment above.
  const [rawInputValue, setRawInputValue] = useState("");
  const [editedFor, setEditedFor] = useState<string | null>(null);
  const [touched, setTouched] = useState(false);
  // Tracks which field's id the panel was opened for, rather than a plain
  // boolean, so switching questions closes the panel automatically (derived
  // state) instead of needing an effect to reset it — see the note below.
  const [helpOpenFor, setHelpOpenFor] = useState<string | null>(null);
  const [verbatimOpenFor, setVerbatimOpenFor] = useState<string | null>(null);
  const helpId = useId();
  const verbatimId = useId();
  const headingRef = useRef<HTMLHeadingElement>(null);

  const currentField = engine?.cursor ? fieldById(engine.form, engine.cursor) : undefined;
  const showHelp = helpOpenFor === currentField?.id;
  const showVerbatim = verbatimOpenFor === currentField?.id;

  const inputValue =
    editedFor === currentField?.id
      ? rawInputValue
      : answerToInputValue(currentField ? engine?.answers[currentField.id]?.value : null);

  function setInputValue(value: string) {
    if (currentField) setEditedFor(currentField.id);
    setRawInputValue(value);
  }

  // Focus (and therefore announce, for a screen reader) the new question
  // every time it changes — not just once on mount. ACCESSIBILITY.md §3.
  useEffect(() => {
    if (currentField) headingRef.current?.focus();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentField?.id]);

  function dispatch(event: Parameters<typeof step>[1]) {
    if (!engine) return;
    const result = step(engine, event);
    saveAnswers(result.state.answers);
    setOverride(result);
  }

  function submitAnswer() {
    setTouched(true);
    dispatch({ type: "ANSWER", value: inputValue });
    setEditedFor(null);
    setTouched(false);
    setHelpOpenFor(null);
  }

  // Previous must not silently discard whatever the user just typed.
  // Only submits if inputValue actually differs from what's already saved
  // (so revisiting a field and going back again without changing anything
  // doesn't re-run validation and risk blocking navigation on a required
  // field the user hasn't gotten to yet).
  function goToPrevious() {
    const saved = currentField ? answerToInputValue(engine?.answers[currentField.id]?.value) : "";
    if (inputValue !== saved && inputValue.trim() !== "") {
      dispatch({ type: "ANSWER", value: inputValue });
    }
    dispatch({ type: "PREV" });
    setEditedFor(null);
    setHelpOpenFor(null);
  }

  function handleKeyDown(event: React.KeyboardEvent<HTMLDivElement>) {
    const target = event.target as HTMLElement;
    const isTextInput = target.tagName === "INPUT" || target.tagName === "TEXTAREA";
    if (isTextInput) return;

    const key = event.key.toLowerCase();
    if (!KEY_ACTIONS.has(key)) return;

    switch (key) {
      case "n":
        event.preventDefault();
        dispatch({ type: "NEXT" });
        break;
      case "p":
        event.preventDefault();
        goToPrevious();
        break;
      case " ":
        event.preventDefault();
        dispatch({ type: "REPEAT" });
        headingRef.current?.focus();
        break;
      case "h":
        event.preventDefault();
        dispatch({ type: "HELP" });
        if (currentField) setHelpOpenFor(currentField.id);
        break;
      case "s":
        event.preventDefault();
        dispatch({ type: "SKIP" });
        break;
      case "l":
        event.preventDefault();
        dispatch({ type: "VERBATIM" });
        if (currentField) setVerbatimOpenFor(currentField.id);
        break;
      case "r":
        event.preventDefault();
        if (engine) saveAnswers(engine.answers);
        router.push("/confirm");
        break;
    }
  }

  if (!engine) {
    return (
      <main id="main-content" className="mx-auto w-full max-w-2xl flex-1 px-6 py-10">
        <p role="status" aria-live="polite" className="text-muted">
          Loading…
        </p>
      </main>
    );
  }

  if (engine.phase === "complete" || !currentField) {
    return (
      <main id="main-content" className="mx-auto w-full max-w-2xl flex-1 px-6 py-10">
        <ProgressTrail current={4} />
        <p className="mt-8 text-lg text-muted" role="status" aria-live="polite">
          {lastAnnouncements.at(-1)?.text ?? "This form has no questions to answer."}
        </p>
        <div className="mt-8">
          <LinkButton href="/overview" variant="secondary">
            Back to overview
          </LinkButton>
        </div>
      </main>
    );
  }

  const field = currentField;
  const isInvalid = touched && field.required && inputValue.trim() === "";
  const questionAnnouncement = lastAnnouncements.find((a) => a.kind === "question");
  const errorAnnouncement = lastAnnouncements.find((a) => a.kind === "error");
  const suggestionAnnouncement = lastAnnouncements.find((a) => a.kind === "suggestion");
  const verbatimAnnouncement = lastAnnouncements.find((a) => a.kind === "verbatim");

  return (
    <main
      id="main-content"
      className="mx-auto w-full max-w-2xl flex-1 px-6 py-10"
      onKeyDown={handleKeyDown}
    >
      <ProgressTrail current={4} />

      <p className="sr-only" role="status" aria-live="assertive">
        {questionAnnouncement?.text}
      </p>
      {errorAnnouncement && (
        <p role="alert" className="mt-4 text-sm font-medium text-accent-strong">
          {errorAnnouncement.text}
        </p>
      )}

      <Card as="section" aria-labelledby="question-heading" className="mt-4">
        <h1
          id="question-heading"
          ref={headingRef}
          tabIndex={-1}
          className="text-2xl font-bold focus-visible:outline-none"
        >
          {field.spokenLabel}
        </h1>
        {/*
          formatHint was already spoken via the sr-only live region above
          (questionText() in announce.ts includes it), but never shown on
          screen — a real gap for someone low-vision but not using a screen
          reader, who gets no format guidance until a failed submit.
          ACCESSIBILITY.md §5 calls for this to be visible/spoken BEFORE
          input, not just surfaced after a validation error.
        */}
        {field.formatHint && (
          <p className="mt-1 text-sm text-muted">{field.formatHint}</p>
        )}
        {!field.required && <p className="mt-1 text-sm text-muted">This one is optional.</p>}
        {showVerbatim && verbatimAnnouncement && (
          <p id={verbatimId} role="status" className="mt-3 text-sm text-muted">
            {verbatimAnnouncement.text}
          </p>
        )}

        {engine.suggestion && suggestionAnnouncement && (
          <div className="mt-3 flex flex-wrap items-center gap-3 rounded-md bg-accent-strong/10 px-4 py-3">
            <p className="text-sm">{suggestionAnnouncement.text}</p>
            <Button type="button" variant="secondary" onClick={() => dispatch({ type: "ACCEPT_SUGGESTION" })}>
              Use this
            </Button>
          </div>
        )}

        <form
          className="mt-6"
          onSubmit={(event) => {
            event.preventDefault();
            submitAnswer();
          }}
        >
          {field.type === "boolean" ? (
            <div
              role="radiogroup"
              aria-labelledby="question-heading"
              aria-invalid={isInvalid}
              aria-required={field.required}
              className="flex gap-4"
            >
              {(["yes", "no"] as const).map((option) => (
                <label
                  key={option}
                  className={`flex flex-1 cursor-pointer items-center justify-center gap-2 rounded-md border-2 px-4 py-3 text-lg capitalize focus-within:outline-3 focus-within:outline-accent-strong ${
                    inputValue === option ? "border-accent-strong bg-accent-strong/10" : "border-muted/40"
                  }`}
                >
                  <input
                    type="radio"
                    name="answer"
                    value={option}
                    checked={inputValue === option}
                    onChange={(event) => setInputValue(event.target.value)}
                    className="sr-only"
                  />
                  {option}
                </label>
              ))}
            </div>
          ) : field.type === "choice" || field.type === "multichoice" ? (
            <div
              role={field.type === "choice" ? "radiogroup" : "group"}
              aria-labelledby="question-heading"
              aria-invalid={field.type === "choice" ? isInvalid : undefined}
              aria-required={field.type === "choice" ? field.required : undefined}
              className="flex flex-col gap-3"
            >
              {(field.constraints.options ?? []).map((option) => {
                const selectedValues = field.type === "multichoice" ? inputValue.split(",").filter(Boolean) : [];
                const isChecked =
                  field.type === "multichoice" ? selectedValues.includes(option.value) : inputValue === option.value;
                return (
                  <label
                    key={option.value}
                    className={`flex cursor-pointer items-center gap-3 rounded-md border-2 px-4 py-3 text-lg focus-within:outline-3 focus-within:outline-accent-strong ${
                      isChecked ? "border-accent-strong bg-accent-strong/10" : "border-muted/40"
                    }`}
                  >
                    <input
                      type={field.type === "multichoice" ? "checkbox" : "radio"}
                      name="answer"
                      value={option.value}
                      checked={isChecked}
                      onChange={(event) => {
                        if (field.type === "multichoice") {
                          const next = event.target.checked
                            ? [...selectedValues, option.value]
                            : selectedValues.filter((v) => v !== option.value);
                          setInputValue(next.join(","));
                        } else {
                          setInputValue(option.value);
                        }
                      }}
                    />
                    {option.spokenLabel ?? option.label}
                  </label>
                );
              })}
            </div>
          ) : (
            <>
              <label htmlFor="answer" className="sr-only">
                {field.spokenLabel}
              </label>
              <input
                id="answer"
                type={field.type === "email" ? "email" : "text"}
                value={inputValue}
                aria-describedby={showHelp ? helpId : undefined}
                aria-invalid={isInvalid}
                aria-required={field.required}
                onChange={(event) => setInputValue(event.target.value)}
                className={`w-full rounded-md border-2 bg-background px-4 py-3 text-lg focus-visible:outline-3 focus-visible:outline-accent-strong ${
                  isInvalid ? "border-accent-strong" : "border-muted/40"
                }`}
              />
            </>
          )}

          {showHelp && (
            <p id={helpId} role="status" className="mt-3 text-sm text-muted">
              {lastAnnouncements.find((a) => a.kind === "help")?.text ?? field.help ?? `This is asking for: ${field.spokenLabel}`}
            </p>
          )}

          <div className="mt-6 flex flex-wrap gap-4">
            <Button type="submit" variant="primary">
              Next
            </Button>
            <Button type="button" variant="secondary" onClick={goToPrevious}>
              Previous
            </Button>
            <Button
              type="button"
              variant="secondary"
              onClick={() => {
                dispatch({ type: "HELP" });
                setHelpOpenFor(showHelp ? null : field.id);
              }}
            >
              {showHelp ? "Hide help" : "Help"}
            </Button>
            {!field.required && (
              <Button type="button" variant="secondary" onClick={() => dispatch({ type: "SKIP" })}>
                Skip
              </Button>
            )}
            <Button
              type="button"
              variant="secondary"
              onClick={() => {
                dispatch({ type: "VERBATIM" });
                setVerbatimOpenFor(showVerbatim ? null : field.id);
              }}
            >
              {showVerbatim ? "Hide as printed" : "Read as printed"}
            </Button>
            <Button
              type="button"
              variant="secondary"
              onClick={() => {
                saveAnswers(engine.answers);
                router.push("/confirm");
              }}
            >
              Review answers
            </Button>
          </div>

          <p className="mt-4 text-xs text-muted">
            Keyboard: N next, P previous, Space repeats the question, H toggles help, L reads the label as printed, R jumps to review
            {!field.required ? ", S skips" : ""}. Suspended while typing in the answer box.
          </p>
        </form>
      </Card>

      <div className="mt-8 flex justify-between">
        <LinkButton href="/overview" variant="secondary">
          Back to overview
        </LinkButton>
        <LinkButton href="/confirm" variant="primary">
          Review answers
        </LinkButton>
      </div>
    </main>
  );
}
