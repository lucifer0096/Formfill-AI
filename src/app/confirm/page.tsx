"use client";

import { useState, useSyncExternalStore } from "react";
import Card from "@/components/ui/Card";
import Button from "@/components/ui/Button";
import LinkButton from "@/components/ui/LinkButton";
import Notice from "@/components/ui/Notice";
import ProgressTrail from "@/components/ProgressTrail";
import { loadAnswers, loadWorkingForm, type AnswerMap } from "@/lib/session-store";
import { useRouteFocus } from "@/lib/use-route-focus";
import { loadOriginalFile } from "@/lib/original-file-store";
import { fillAcroForm } from "@/lib/emit/fill-acroform";
import { buildSummaryPdf } from "@/lib/emit/summary-pdf";
import type { Field } from "@/lib/form-model/types";

interface ConfirmRow {
  field: Field;
  value: string;
}

const noopSubscribe = () => () => {};

// useSyncExternalStore requires getSnapshot to return a stable reference
// across calls when nothing changed, or React re-renders forever (see the
// comment in session-store.ts's loadIngestResult). loadWorkingForm's `form`
// is already cached there; loadAnswers() is not, so it's read once per call
// here and only re-derived when either input's identity actually changes.
let rowsCache: { form: unknown; answers: unknown; rows: ConfirmRow[] } | null = null;

function readRows(): ConfirmRow[] {
  const { form } = loadWorkingForm();
  const answers = loadAnswers();
  if (rowsCache && rowsCache.form === form && rowsCache.answers === answers) {
    return rowsCache.rows;
  }
  const fields = form.sections.flatMap((s) => s.fields);
  const rows = fields.map((field) => ({
    field,
    value: answers[field.id]?.trim() ? answers[field.id] : "Not answered",
  }));
  rowsCache = { form, answers, rows };
  return rows;
}

function downloadBytes(bytes: Uint8Array, fileName: string) {
  // pdf-lib's Uint8Array is typed against ArrayBufferLike (can include
  // SharedArrayBuffer), which Blob's constructor doesn't accept — .slice()
  // copies into a genuine ArrayBuffer-backed Uint8Array to satisfy BlobPart.
  const blob = new Blob([bytes.slice().buffer as ArrayBuffer], { type: "application/pdf" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = fileName;
  link.click();
  URL.revokeObjectURL(url);
}

export default function ConfirmPage() {
  // sessionStorage is browser-only; useSyncExternalStore reads it safely
  // across server prerendering (getServerSnapshot) and the client, in one
  // render, without a setState-in-effect or a hydration mismatch.
  const rows = useSyncExternalStore(noopSubscribe, readRows, () => null);
  const [heard, setHeard] = useState<Set<string>>(new Set());
  const [status, setStatus] = useState<"idle" | "generating" | "done" | "error">("idle");
  const [errorMessage, setErrorMessage] = useState("");
  const headingRef = useRouteFocus<HTMLHeadingElement>();

  if (!rows) {
    return (
      <main id="main-content" className="mx-auto w-full max-w-3xl flex-1 px-6 py-10">
        <p role="status" aria-live="polite" className="text-muted">
          Loading…
        </p>
      </main>
    );
  }

  const allHeard = rows.length > 0 && heard.size === rows.length;
  const fields = rows.map((r) => r.field);
  const isAcroForm = fields.some((f) => f.anchor.kind === "acroform");

  async function handleFinish() {
    setStatus("generating");
    setErrorMessage("");
    try {
      const { form } = loadWorkingForm();
      const answers: AnswerMap = loadAnswers();

      if (isAcroForm) {
        const originalFile = await loadOriginalFile();
        if (!originalFile) {
          throw new Error(
            "The original file for this form could not be found. Try uploading it again.",
          );
        }
        const bytes = await fillAcroForm(originalFile, fields, answers);
        downloadBytes(bytes, `${form.title || "filled-form"}.pdf`);
      } else {
        const bytes = await buildSummaryPdf(form.title || "Form summary", fields, answers);
        downloadBytes(bytes, `${form.title || "form-summary"}-summary.pdf`);
      }

      setStatus("done");
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : "Something went wrong.");
      setStatus("error");
    }
  }

  return (
    <main id="main-content" className="mx-auto w-full max-w-3xl flex-1 px-6 py-10">
      <ProgressTrail current={5} />

      <section aria-labelledby="page-heading" tabIndex={0} className="mt-8 rounded-lg">
        <h1
          id="page-heading"
          ref={headingRef}
          tabIndex={-1}
          className="text-3xl font-bold tracking-tight sm:text-4xl focus-visible:outline-none"
        >
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
          {rows.map(({ field, value }) => {
            const isHeard = heard.has(field.id);
            return (
              <li
                key={field.id}
                className="flex items-center justify-between gap-4 py-4 first:pt-0 last:pb-0"
              >
                <div>
                  <p className="font-medium">{field.spokenLabel}</p>
                  <p className="text-sm text-muted">{value}</p>
                </div>
                <Button
                  type="button"
                  variant="secondary"
                  aria-pressed={isHeard}
                  onClick={() =>
                    setHeard((prev) => {
                      const next = new Set(prev);
                      next.add(field.id);
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
        <Notice live>
          {status === "done"
            ? isAcroForm
              ? "Your filled form has been downloaded."
              : "Your answer summary has been downloaded. This form has no fillable fields, so a filled copy of the original isn't possible yet — the summary lists every question and answer instead."
            : allHeard
              ? isAcroForm
                ? "All answers confirmed. Ready to download your filled form."
                : "All answers confirmed. This form has no fillable fields, so you'll get a downloadable summary instead of a filled copy."
              : `You have heard ${heard.size} of ${rows.length} answers. Read back every answer before confirming.`}
        </Notice>
      </div>

      {status === "error" && (
        <p role="alert" className="mt-4 text-sm font-medium text-accent-strong">
          {errorMessage}
        </p>
      )}

      <div className="mt-8 flex flex-col gap-4 sm:flex-row sm:justify-between">
        <LinkButton href="/questions" variant="secondary">
          Back to questions
        </LinkButton>
        <Button
          type="button"
          variant="primary"
          disabled={!allHeard || status === "generating"}
          onClick={handleFinish}
        >
          {status === "generating"
            ? "Preparing your document…"
            : isAcroForm
              ? "Confirm and download filled form"
              : "Confirm and download summary"}
        </Button>
      </div>
    </main>
  );
}
