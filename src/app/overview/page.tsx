"use client";

import { useSyncExternalStore } from "react";
import Card from "@/components/ui/Card";
import LinkButton from "@/components/ui/LinkButton";
import ReadAloudButton from "@/components/ui/ReadAloudButton";
import { useRegisterReadAloud } from "@/lib/speech/use-global-read-aloud";
import ProgressTrail from "@/components/ProgressTrail";
import { loadWorkingForm } from "@/lib/session-store";
import { useRouteFocus } from "@/lib/use-route-focus";

const noopSubscribe = () => () => {};

/**
 * sessionStorage doesn't exist during server prerendering, and reading it
 * inside an effect just to setState triggers react-hooks/set-state-in-effect
 * (that setState is establishing initial state, not synchronizing with an
 * external change). useSyncExternalStore is the React-sanctioned way to read
 * a browser-only source safely: getServerSnapshot covers prerendering, and
 * the real read only happens once, on the client, without a second render.
 */
export default function FormOverviewPage() {
  const sections = useSyncExternalStore(
    noopSubscribe,
    () => loadWorkingForm().form.sections,
    () => null,
  );
  const headingRef = useRouteFocus<HTMLHeadingElement>();

  // Computed unconditionally, before the early return below, so the hook
  // that registers this for Ctrl+Alt+S runs on every render regardless of
  // whether sections has loaded yet — same reasoning as the equivalent
  // comment in questions/page.tsx and confirm/page.tsx.
  const totalFields = sections?.reduce((sum, s) => sum + s.fields.length, 0) ?? 0;
  const estimatedMinutes = Math.max(2, Math.round(totalFields * 0.6));
  const summaryText = sections
    ? `${sections.length} ${sections.length === 1 ? "section" : "sections"}, ${totalFields} ${
        totalFields === 1 ? "question" : "questions"
      } in total, taking about ${estimatedMinutes} minutes. ${sections
        .map(
          (section, index) =>
            `${section.title ?? `Section ${index + 1}`}: ${section.fields.length} ${
              section.fields.length === 1 ? "question" : "questions"
            }.`,
        )
        .join(" ")}`
    : "";
  useRegisterReadAloud(summaryText);

  if (!sections) {
    return (
      <main id="main-content" className="mx-auto w-full max-w-3xl flex-1 px-6 py-10">
        <p role="status" aria-live="polite" className="text-muted">
          Loading…
        </p>
      </main>
    );
  }

  return (
    <main id="main-content" className="mx-auto w-full max-w-3xl flex-1 px-6 py-10">
      <ProgressTrail current={3} />

      <section aria-labelledby="page-heading" tabIndex={0} className="mt-8 rounded-lg">
        <h1
          id="page-heading"
          ref={headingRef}
          tabIndex={-1}
          className="text-3xl font-bold tracking-tight sm:text-4xl focus-visible:outline-none"
        >
          Form overview
        </h1>
        <p className="mt-3 text-lg text-muted">
          {sections.length} {sections.length === 1 ? "section" : "sections"}, {totalFields}{" "}
          {totalFields === 1 ? "question" : "questions"} in total. This should take about{" "}
          {estimatedMinutes} minutes.
        </p>
        <div className="mt-4">
          <ReadAloudButton text={summaryText} />
        </div>
      </section>

      <Card as="section" aria-labelledby="sections-heading" tabIndex={0} className="mt-8">
        <h2 id="sections-heading" className="text-xl font-semibold">
          Sections
        </h2>
        <ol className="mt-5 space-y-4">
          {sections.map((section, index) => (
            <li key={section.id} className="flex items-center gap-4">
              <span
                aria-hidden="true"
                className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full border-2 border-muted text-sm font-bold"
              >
                {index + 1}
              </span>
              <span>
                <span className="block font-semibold">{section.title ?? `Section ${index + 1}`}</span>
                <span className="block text-sm text-muted">
                  {section.fields.length} {section.fields.length === 1 ? "question" : "questions"}
                </span>
              </span>
            </li>
          ))}
        </ol>
      </Card>

      <p className="mt-6 text-sm text-muted">
        You will answer one question at a time. Press N for the next question, P to go back, and
        R at any point to review everything you have entered so far.
      </p>

      <div className="mt-8 flex flex-col gap-4 sm:flex-row sm:justify-between">
        <LinkButton href="/review" variant="secondary">
          Back
        </LinkButton>
        <LinkButton href="/questions" variant="primary">
          Start answering
        </LinkButton>
      </div>
    </main>
  );
}
