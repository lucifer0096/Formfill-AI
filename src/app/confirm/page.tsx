"use client";

import { useState } from "react";
import Card from "@/components/ui/Card";
import Button from "@/components/ui/Button";
import LinkButton from "@/components/ui/LinkButton";
import Notice from "@/components/ui/Notice";
import ProgressTrail from "@/components/ProgressTrail";

/*
 * Placeholder answers. Once wired to packages/conversation, this page reads
 * the engine's AnswerSet and only enables Confirm after every answer has
 * actually been heard/displayed — see machine.ts's reviewHeard gate.
 */
const ANSWERS = [
  { label: "Full name", value: "Jordan Smith" },
  { label: "Date of birth", value: "3rd of March 1990" },
  { label: "Home address", value: "12 Elm Street, Springfield" },
];

export default function ConfirmPage() {
  const [heard, setHeard] = useState<Set<string>>(new Set());
  const allHeard = heard.size === ANSWERS.length;

  return (
    <main id="main-content" className="mx-auto w-full max-w-3xl flex-1 px-6 py-10">
      <ProgressTrail current={5} />

      <section aria-labelledby="page-heading" tabIndex={0} className="mt-8 rounded-lg">
        <h1 id="page-heading" className="text-3xl font-bold tracking-tight sm:text-4xl">
          Review your answers
        </h1>
        <p className="mt-3 text-lg text-muted">
          Check every answer before finishing. Nothing is submitted until you confirm.
        </p>
      </section>

      <Card as="section" aria-labelledby="answers-heading" tabIndex={0} className="mt-8">
        <h2 id="answers-heading" className="sr-only">
          Your answers
        </h2>
        <ul className="divide-y divide-muted/20">
          {ANSWERS.map((answer) => {
            const isHeard = heard.has(answer.label);
            return (
              <li
                key={answer.label}
                className="flex items-center justify-between gap-4 py-4 first:pt-0 last:pb-0"
              >
                <div>
                  <p className="font-medium">{answer.label}</p>
                  <p className="text-sm text-muted">{answer.value}</p>
                </div>
                <Button
                  type="button"
                  variant="secondary"
                  aria-pressed={isHeard}
                  onClick={() =>
                    setHeard((prev) => {
                      const next = new Set(prev);
                      next.add(answer.label);
                      return next;
                    })
                  }
                >
                  {isHeard ? "Heard ✓" : "Read back"}
                </Button>
              </li>
            );
          })}
        </ul>
      </Card>

      <div className="mt-6">
        <Notice>
          {allHeard
            ? "All answers confirmed. You are ready to finish."
            : `You have heard ${heard.size} of ${ANSWERS.length} answers. Read back every answer before confirming.`}
        </Notice>
      </div>

      <div className="mt-8 flex flex-col gap-4 sm:flex-row sm:justify-between">
        <LinkButton href="/questions" variant="secondary">
          Back to questions
        </LinkButton>
        <Button type="button" variant="primary" disabled={!allHeard}>
          Confirm and finish
        </Button>
      </div>
    </main>
  );
}
