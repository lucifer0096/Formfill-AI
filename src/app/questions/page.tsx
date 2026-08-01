"use client";

import { useEffect, useId, useState } from "react";
import Card from "@/components/ui/Card";
import Button from "@/components/ui/Button";
import LinkButton from "@/components/ui/LinkButton";
import ProgressTrail from "@/components/ProgressTrail";
import { loadAnswers, loadWorkingForm, saveAnswers } from "@/lib/session-store";
import type { Field } from "@/lib/form-model/types";

export default function QuestionsPage() {
  const [fields, setFields] = useState<Field[] | null>(null);
  const [index, setIndex] = useState(0);
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [showHelp, setShowHelp] = useState(false);
  const helpId = useId();

  useEffect(() => {
    setFields(loadWorkingForm().form.sections.flatMap((s) => s.fields));
    setAnswers(loadAnswers());
  }, []);

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

  function commitAndAdvance(nextValue: string) {
    const next = { ...answers, [field.id]: nextValue };
    setAnswers(next);
    saveAnswers(next);
    setShowHelp(false);
    if (!isLast) setIndex((i) => i + 1);
  }

  return (
    <main id="main-content" className="mx-auto w-full max-w-2xl flex-1 px-6 py-10">
      <ProgressTrail current={4} />

      <p className="mt-8 text-sm font-medium text-muted" role="status" aria-live="polite">
        Question {index + 1} of {fields.length}
      </p>

      <Card as="section" aria-labelledby="question-heading" className="mt-4">
        <h1 id="question-heading" tabIndex={-1} className="text-2xl font-bold">
          {field.spokenLabel}
        </h1>
        {!field.required && <p className="mt-1 text-sm text-muted">This one is optional.</p>}

        <form
          className="mt-6"
          onSubmit={(event) => {
            event.preventDefault();
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
            onChange={(event) => setAnswers((prev) => ({ ...prev, [field.id]: event.target.value }))}
            className="w-full rounded-md border-2 border-muted/40 bg-background px-4 py-3 text-lg focus-visible:outline-3 focus-visible:outline-accent-strong"
          />

          {showHelp && (
            <p id={helpId} role="status" className="mt-3 text-sm text-muted">
              {field.help ?? `This is asking for: ${field.spokenLabel}`}
            </p>
          )}

          <div className="mt-6 flex flex-wrap gap-4">
            <Button type="submit" variant="primary">
              {isLast ? "Finish" : "Next"}
            </Button>
            <Button
              type="button"
              variant="secondary"
              onClick={() => setIndex((i) => Math.max(0, i - 1))}
              disabled={index === 0}
            >
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
