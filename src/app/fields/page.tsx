"use client";

import { useRef } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import Button from "@/components/ui/Button";
import Card from "@/components/ui/Card";
import { useFormSession } from "@/lib/form-session-context";
import type { Field } from "@/lib/form-model";

function fieldSuggestion(field: Field): string | null {
  if (!field.options || field.options.length === 0) return null;
  return `Choose one: ${field.options.map((o) => o.label).join(", ")}.`;
}

export default function FieldsPage() {
  const router = useRouter();
  const { result } = useFormSession();
  const fieldsHeadingRef = useRef<HTMLHeadingElement>(null);

  if (!result) {
    return (
      <main id="main-content" className="mx-auto w-full max-w-3xl flex-1 px-6 py-10">
        <Card as="section" aria-labelledby="no-result-heading" tabIndex={0} className="space-y-4">
          <h1 id="no-result-heading" className="text-xl font-semibold">
            Nothing to review yet
          </h1>
          <p className="text-muted">Go back and let us read your form first.</p>
          <div className="flex justify-end">
            <Link href="/review">
              <Button type="button" variant="primary">
                Back to review
              </Button>
            </Link>
          </div>
        </Card>
      </main>
    );
  }

  return (
    <main id="main-content" className="mx-auto w-full max-w-3xl flex-1 px-6 py-10">
      <div className="space-y-10">
        <section aria-labelledby="page-heading" tabIndex={0} className="rounded-lg">
          <h1
            id="page-heading"
            className="text-3xl font-bold uppercase tracking-tight sm:text-4xl"
          >
            Review detected fields
          </h1>
          <p className="mt-3 text-lg text-muted">
            {result.totalFields} field{result.totalFields === 1 ? "" : "s"} were found across{" "}
            {result.sections.length} section{result.sections.length === 1 ? "" : "s"}. Review them
            one at a time, or jump straight into the form.
          </p>
        </section>

        <div className="flex flex-col gap-4 sm:flex-row sm:justify-end">
          <Button
            type="button"
            variant="secondary"
            onClick={() => fieldsHeadingRef.current?.focus()}
          >
            Review fields
          </Button>
          <Button type="button" variant="primary" onClick={() => router.push("/answer")}>
            Start form
          </Button>
        </div>

        {/*
          Content is always rendered — reviewing every field is a lot to ask
          of a blind user, so "Start form" above skips straight past this
          without waiting on it. "Review fields" doesn't reveal anything (it's
          already there); it moves keyboard focus down here so a screen reader
          starts reading from this heading instead of the user having to find
          it themselves.
        */}
        <h2 ref={fieldsHeadingRef} tabIndex={-1} className="text-2xl font-bold tracking-tight">
          Detected fields
        </h2>

        {result.sections.map((section, sectionIndex) => (
          <Card
            key={`${section.title}-${sectionIndex}`}
            as="section"
            aria-labelledby={`section-heading-${sectionIndex}`}
            tabIndex={0}
          >
            <h3 id={`section-heading-${sectionIndex}`} className="text-xl font-semibold">
              {section.title}
            </h3>
            <ol className="mt-5 space-y-5">
              {section.fields.map((field, fieldIndex) => {
                const suggestion = fieldSuggestion(field);
                return (
                  <li key={field.id} className="flex gap-4">
                    <span
                      aria-hidden="true"
                      className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full border-2 border-muted text-sm font-bold"
                    >
                      {fieldIndex + 1}
                    </span>
                    <span>
                      <span className="block font-semibold">{field.spokenLabel}</span>
                      <span className="block text-sm text-muted">
                        {field.label} · {field.required ? "Required" : "Optional"}
                      </span>
                      {field.help && (
                        <span className="mt-1 block text-sm text-muted">{field.help}</span>
                      )}
                      {suggestion && (
                        <span className="mt-1 block text-sm text-accent-strong">
                          {suggestion}
                        </span>
                      )}
                    </span>
                  </li>
                );
              })}
            </ol>
          </Card>
        ))}

        <div className="flex justify-end">
          <Button type="button" variant="primary" onClick={() => router.push("/answer")}>
            Start form
          </Button>
        </div>
      </div>
    </main>
  );
}
