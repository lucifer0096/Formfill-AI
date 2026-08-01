"use client";

import { useEffect, useState } from "react";
import Card from "@/components/ui/Card";
import Button from "@/components/ui/Button";
import LinkButton from "@/components/ui/LinkButton";
import Notice from "@/components/ui/Notice";
import ProgressTrail from "@/components/ProgressTrail";
import { loadIngestResult, PLACEHOLDER_FIELDS, saveIngestResult, type StoredIngest } from "@/lib/session-store";
import { useRouteFocus } from "@/lib/use-route-focus";
import type { Field, Form } from "@/lib/form-model/types";
import type { TextBlock, TextLayerResult } from "@/lib/ingest/text-layer";

type ConfidenceBand = "high" | "medium" | "low";

function bandFor(confidence: number): ConfidenceBand {
  if (confidence >= 0.8) return "high";
  if (confidence >= 0.5) return "medium";
  return "low";
}

const CONFIDENCE_LABEL: Record<ConfidenceBand, string> = {
  high: "Detected with high confidence",
  medium: "Detected, worth a quick check",
  low: "Uncertain — please confirm this one",
};

export default function ReviewFieldsPage() {
  const [stored, setStored] = useState<StoredIngest | null | undefined>(undefined);

  useEffect(() => {
    setStored(loadIngestResult());
  }, []);

  if (stored === undefined) {
    return (
      <main id="main-content" className="mx-auto w-full max-w-3xl flex-1 px-6 py-10">
        <p role="status" aria-live="polite" className="text-muted">
          Loading…
        </p>
      </main>
    );
  }

  if (stored?.kind === "form") {
    return <ReviewFields fields={stored.form.sections.flatMap((s) => s.fields)} />;
  }

  if (stored?.kind === "text-layer") {
    return <ClassifyAndReview fileName={stored.fileName} result={stored.result} />;
  }

  if (stored?.kind === "needs-vision") {
    return <NeedsVision fileName={stored.fileName} />;
  }

  // Nothing in session storage — dev/demo fallback so the page is still browsable directly.
  return <ReviewFields fields={PLACEHOLDER_FIELDS} />;
}

function ReviewFields({ fields }: { fields: Field[] }) {
  const headingRef = useRouteFocus<HTMLHeadingElement>();
  return (
    <main id="main-content" className="mx-auto w-full max-w-3xl flex-1 px-6 py-10">
      <ProgressTrail current={2} />

      <section aria-labelledby="page-heading" tabIndex={0} className="mt-8 rounded-lg">
        <h1
          id="page-heading"
          ref={headingRef}
          tabIndex={-1}
          className="text-3xl font-bold tracking-tight sm:text-4xl focus-visible:outline-none"
        >
          Review extracted fields
        </h1>
        <p className="mt-3 text-lg text-muted">
          We found {fields.length} {fields.length === 1 ? "question" : "questions"} on your form.
          Check the list below before we build the full overview.
        </p>
      </section>

      <Card as="section" aria-labelledby="fields-heading" tabIndex={0} className="mt-8">
        <h2 id="fields-heading" className="sr-only">
          Detected fields
        </h2>
        <ul className="divide-y divide-muted/20">
          {fields.map((field) => {
            const band = bandFor(field.confidence);
            return (
              <li
                key={field.id}
                className="flex items-start justify-between gap-4 py-4 first:pt-0 last:pb-0"
              >
                <div>
                  <p className="font-medium">{field.spokenLabel}</p>
                  <p className="text-sm text-muted">{field.type}</p>
                </div>
                <span
                  className={`shrink-0 rounded-full px-3 py-1 text-xs font-semibold ${
                    band === "low" ? "bg-accent-strong/10 text-accent-strong" : "bg-muted/10 text-muted"
                  }`}
                >
                  {CONFIDENCE_LABEL[band]}
                </span>
              </li>
            );
          })}
        </ul>
      </Card>

      <div className="mt-6">
        <Notice>
          Low-confidence fields are never guessed silently — you will be asked to confirm them in
          your own words when we get there.
        </Notice>
      </div>

      <div className="mt-8 flex flex-col gap-4 sm:flex-row sm:justify-between">
        <LinkButton href="/" variant="secondary">
          Back
        </LinkButton>
        <LinkButton href="/overview" variant="primary">
          Continue
        </LinkButton>
      </div>
    </main>
  );
}

/**
 * This PDF has no AcroForm fields, so the text was extracted locally and
 * needs the /api/understand model call to become real questions — see
 * ARCHITECTURE.md §5.1. Calls it once on mount; on success, saves the
 * classified Form so /overview, /questions and /confirm pick it up via
 * loadWorkingForm() same as the AcroForm path. On failure, falls back to
 * showing the raw extracted text rather than hiding what was actually read.
 */
function ClassifyAndReview({ fileName, result }: { fileName: string; result: TextLayerResult }) {
  const [status, setStatus] = useState<"loading" | "done" | "error">("loading");
  const [form, setForm] = useState<Form | null>(null);
  const [errorMessage, setErrorMessage] = useState("");
  const loadingRef = useRouteFocus<HTMLParagraphElement>();

  useEffect(() => {
    let cancelled = false;

    async function run() {
      try {
        const response = await fetch("/api/understand", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ blocks: result.blocks, fileName, pageCount: result.pageCount }),
        });
        const data = await response.json();
        if (!response.ok) throw new Error(data.error ?? "Classification failed.");
        if (cancelled) return;
        saveIngestResult({ kind: "form", form: data.form });
        setForm(data.form);
        setStatus("done");
      } catch (error) {
        if (cancelled) return;
        setErrorMessage(error instanceof Error ? error.message : "Classification failed.");
        setStatus("error");
      }
    }

    run();
    return () => {
      cancelled = true;
    };
  }, [fileName, result]);

  if (status === "loading") {
    return (
      <main id="main-content" className="mx-auto w-full max-w-3xl flex-1 px-6 py-10">
        <ProgressTrail current={2} />
        <p
          ref={loadingRef}
          tabIndex={-1}
          role="status"
          aria-live="polite"
          className="mt-8 text-lg text-muted focus-visible:outline-none"
        >
          Reading the questions on <strong>{fileName}</strong>…
        </p>
      </main>
    );
  }

  if (status === "done" && form) {
    return <ReviewFields fields={form.sections.flatMap((s) => s.fields)} />;
  }

  // Classification failed — show the raw extracted text so nothing is hidden,
  // and let the user retry or go back rather than dead-ending.
  return <ExtractedText fileName={fileName} result={result} errorMessage={errorMessage} />;
}

function ExtractedText({
  fileName,
  result,
  errorMessage,
}: {
  fileName: string;
  result: TextLayerResult;
  errorMessage: string;
}) {
  const headingRef = useRouteFocus<HTMLHeadingElement>();
  const byPage = new Map<number, TextBlock[]>();
  for (const block of result.blocks) {
    const list = byPage.get(block.page) ?? [];
    list.push(block);
    byPage.set(block.page, list);
  }

  return (
    <main id="main-content" className="mx-auto w-full max-w-3xl flex-1 px-6 py-10">
      <ProgressTrail current={2} />

      <section aria-labelledby="page-heading" tabIndex={0} className="mt-8 rounded-lg">
        <h1
          id="page-heading"
          ref={headingRef}
          tabIndex={-1}
          className="text-3xl font-bold tracking-tight sm:text-4xl focus-visible:outline-none"
        >
          Couldn&apos;t classify this form
        </h1>
        <p className="mt-3 text-lg text-muted">
          We read <strong>{fileName}</strong> locally, but turning it into questions failed:{" "}
          {errorMessage}. Here is exactly what was read off the page.
        </p>
      </section>

      <div className="mt-8">
        <Button type="button" variant="secondary" onClick={() => window.location.reload()}>
          Try again
        </Button>
      </div>

      <div className="mt-8 space-y-6">
        {[...byPage.entries()].map(([page, blocks]) => (
          <Card key={page} as="section" aria-labelledby={`page-${page}-heading`} tabIndex={0}>
            <h2 id={`page-${page}-heading`} className="text-sm font-semibold text-muted">
              Page {page} of {result.pageCount}
            </h2>
            <p className="mt-3 whitespace-pre-wrap leading-relaxed">{orderedText(blocks)}</p>
          </Card>
        ))}
      </div>

      <div className="mt-8">
        <LinkButton href="/" variant="secondary">
          Back to upload
        </LinkButton>
      </div>
    </main>
  );
}

/** Reading order: top of page first, then left to right within a line. */
function orderedText(blocks: TextBlock[]): string {
  const sorted = [...blocks].sort((a, b) => a.y - b.y || a.x - b.x);
  const lines: string[][] = [];
  let currentY: number | null = null;

  for (const block of sorted) {
    if (currentY === null || Math.abs(block.y - currentY) > block.height * 0.5) {
      lines.push([]);
      currentY = block.y;
    }
    lines[lines.length - 1]!.push(block.text);
  }

  return lines.map((line) => line.join(" ")).join("\n");
}

function NeedsVision({ fileName }: { fileName: string }) {
  const headingRef = useRouteFocus<HTMLHeadingElement>();
  return (
    <main id="main-content" className="mx-auto w-full max-w-3xl flex-1 px-6 py-10">
      <ProgressTrail current={2} />
      <section aria-labelledby="page-heading" tabIndex={0} className="mt-8 rounded-lg">
        <h1
          id="page-heading"
          ref={headingRef}
          tabIndex={-1}
          className="text-3xl font-bold tracking-tight sm:text-4xl focus-visible:outline-none"
        >
          Almost there
        </h1>
        <p className="mt-3 text-lg text-muted">
          <strong>{fileName}</strong> looks like a scanned or image-based form, so we need image
          understanding to read it. That step isn&apos;t wired up yet.
        </p>
      </section>
      <div className="mt-8">
        <LinkButton href="/" variant="secondary">
          Back to upload
        </LinkButton>
      </div>
    </main>
  );
}
