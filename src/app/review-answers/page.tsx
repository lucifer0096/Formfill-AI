"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import Button from "@/components/ui/Button";
import Card from "@/components/ui/Card";
import Notice from "@/components/ui/Notice";
import StepIndicator from "@/components/StepIndicator";
import { useFormSession } from "@/lib/form-session-context";
import { flattenFields } from "@/lib/form-model";
import { answerToText } from "@/lib/answer-format";
import { fillAcroForm } from "@/lib/pdf/fill-acroform";
import { buildSummaryPdf } from "@/lib/pdf/build-summary-pdf";

const cellClassName =
  "px-4 py-3 align-top focus-visible:outline-3 focus-visible:outline-offset-[-3px] focus-visible:outline-accent-strong";

function downloadBytes(bytes: Uint8Array, filename: string) {
  const blob = new Blob([bytes.slice()], { type: "application/pdf" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

type DownloadState = "idle" | "working" | "done" | "error";

export default function ReviewAnswersPage() {
  const { file, result, answers } = useFormSession();
  const fields = useMemo(() => (result ? flattenFields(result.sections) : []), [result]);
  const [confirmed, setConfirmed] = useState(false);
  const [downloadState, setDownloadState] = useState<DownloadState>("idle");
  const [downloadMessage, setDownloadMessage] = useState("");

  async function handleDownload() {
    if (!result || !file) return;
    setDownloadState("working");
    setDownloadMessage("");

    try {
      const baseName = file.name.replace(/\.[^.]+$/, "");
      const isPdf = file.type === "application/pdf" || file.name.toLowerCase().endsWith(".pdf");

      if (isPdf) {
        const originalBytes = await file.arrayBuffer();
        const filled = await fillAcroForm(originalBytes, result, answers);
        if (filled) {
          downloadBytes(filled.bytes, `${baseName}-filled.pdf`);
          setDownloadMessage(
            `Filled ${filled.filledCount} of ${filled.totalAcroFields} form field${filled.totalAcroFields === 1 ? "" : "s"} directly in your original PDF and downloaded it.`
          );
          setDownloadState("done");
          return;
        }
      }

      const summaryBytes = await buildSummaryPdf(result, answers, `${baseName} — Answers`);
      downloadBytes(summaryBytes, `${baseName}-answers.pdf`);
      setDownloadMessage(
        isPdf
          ? "This PDF's fields couldn't be confidently matched, so we downloaded a summary of your questions and answers instead."
          : "This form doesn't have fillable fields, so we downloaded a summary of your questions and answers instead."
      );
      setDownloadState("done");
    } catch {
      setDownloadState("error");
      setDownloadMessage("Could not generate the file. Try again.");
    }
  }

  return (
    <main id="main-content" className="mx-auto w-full max-w-4xl flex-1 px-6 py-10">
      <div className="space-y-8">
        <StepIndicator currentIndex={4} />

        <section aria-labelledby="page-heading" tabIndex={0} className="rounded-lg">
          <h1 id="page-heading" className="text-3xl font-bold tracking-tight sm:text-4xl">
            Review answers
          </h1>
          <p className="mt-3 text-lg text-muted">
            Check your answers before finishing. Tab through each question, then its answer, in
            order.
          </p>
        </section>

        {fields.length === 0 ? (
          <Card as="section" aria-labelledby="no-answers-heading" tabIndex={0} className="space-y-4">
            <h2 id="no-answers-heading" className="text-xl font-semibold">
              Nothing to review yet
            </h2>
            <p className="text-muted">Go back and answer your form's questions first.</p>
            <div className="flex justify-end">
              <Link href="/fields">
                <Button type="button" variant="primary">
                  Back to overview
                </Button>
              </Link>
            </div>
          </Card>
        ) : (
          <Card as="section" aria-labelledby="answers-heading" className="overflow-x-auto p-0">
            <h2 id="answers-heading" className="sr-only">
              Your answers
            </h2>
            {/*
              A real <table> so screen readers get native table semantics
              (row/column position announced automatically) on top of the
              left-question/right-answer layout. Each <td> carries its own
              tabIndex so Tab moves cell by cell — question, then its answer,
              then the next question — matching DOM order exactly, with no
              CSS reordering to fight.
            */}
            <table className="w-full min-w-lg border-collapse text-left">
              <caption className="sr-only">Question and answer pairs, one row per field</caption>
              <thead>
                <tr className="border-b border-muted/30">
                  <th scope="col" className="px-4 py-3 text-sm font-semibold uppercase tracking-wide text-muted">
                    Question
                  </th>
                  <th scope="col" className="px-4 py-3 text-sm font-semibold uppercase tracking-wide text-muted">
                    Your answer
                  </th>
                </tr>
              </thead>
              {result!.sections.map((section, sectionIndex) => (
                <tbody key={`${section.title}-${sectionIndex}`}>
                  <tr className="border-b border-muted/30 bg-muted/10">
                    <th scope="colgroup" colSpan={2} className="px-4 py-2 text-left text-sm font-semibold">
                      {section.title}
                    </th>
                  </tr>
                  {section.fields.map((field) => {
                    const answerText = answerToText(answers[field.id]);
                    return (
                      <tr key={field.id} className="border-b border-muted/30 last:border-0">
                        <td tabIndex={0} className={cellClassName}>
                          <span className="block font-medium">{field.spokenLabel}</span>
                          <span className="block text-sm text-muted">
                            {field.required ? "Required" : "Optional"}
                          </span>
                        </td>
                        <td tabIndex={0} className={cellClassName}>
                          {answerText ? (
                            answerText
                          ) : (
                            <span className="italic text-muted">Not answered</span>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              ))}
            </table>
          </Card>
        )}

        {fields.length > 0 && (
          <Card as="section" aria-labelledby="confirm-heading" tabIndex={0} className="space-y-4">
            <h2 id="confirm-heading" className="text-xl font-semibold">
              Confirm and download
            </h2>
            <p className="text-muted">
              {confirmed
                ? "Confirmed. Download your completed form below."
                : "Nothing is written to a file until you confirm your answers above are correct."}
            </p>
            <div className="flex flex-col gap-4 sm:flex-row sm:justify-end">
              <Button
                type="button"
                variant={confirmed ? "secondary" : "primary"}
                aria-pressed={confirmed}
                onClick={() => setConfirmed((v) => !v)}
              >
                {confirmed ? "Confirmed" : "Confirm answers"}
              </Button>
              <Button
                type="button"
                variant="primary"
                disabled={!confirmed || downloadState === "working"}
                onClick={handleDownload}
              >
                {downloadState === "working" ? "Preparing…" : "Download"}
              </Button>
            </div>

            {downloadMessage && <Notice>{downloadMessage}</Notice>}
            <p role="status" aria-live="polite" className="sr-only">
              {downloadState === "working" ? "Preparing your file for download." : downloadMessage}
            </p>
          </Card>
        )}

        <div className="flex justify-between">
          <Link href="/answer">
            <Button type="button" variant="secondary">
              Back to questions
            </Button>
          </Link>
        </div>
      </div>
    </main>
  );
}
