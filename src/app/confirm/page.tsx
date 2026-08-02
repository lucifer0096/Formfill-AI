"use client";

import { useState, useSyncExternalStore } from "react";
import Card from "@/components/ui/Card";
import Button from "@/components/ui/Button";
import LinkButton from "@/components/ui/LinkButton";
import Notice from "@/components/ui/Notice";
import ProgressTrail from "@/components/ProgressTrail";
import { loadAnswers, loadWorkingForm, saveAnswers } from "@/lib/session-store";
import { useRouteFocus } from "@/lib/use-route-focus";
import { loadOriginalFile } from "@/lib/original-file-store";
import { fillAcroForm } from "@/lib/emit/fill-acroform";
import { buildSummaryPdf } from "@/lib/emit/summary-pdf";
import {
  initialState,
  step,
  type ConversationState,
} from "@/lib/conversation/machine";
import { speakValue, type Announcement } from "@/lib/conversation/announce";
import { applicableFields } from "@/lib/form-model/traverse";

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

interface Bootstrapped {
  state: ConversationState;
  announcements: Announcement[];
}

const noopSubscribe = () => () => {};

// See the matching comment in /questions/page.tsx: a lazy useState
// initializer that branches on `typeof window` produces a genuinely
// different render tree on the client's first paint than what the server
// sent down (React re-runs the initializer during hydration too), which is
// a real hydration-mismatch bug, not just a lint nag. useSyncExternalStore's
// getServerSnapshot is the API actually designed for "server and the
// client's first paint must agree, a later commit can differ."
let bootstrapCache: { form: unknown; answers: unknown; value: Bootstrapped } | null = null;

function readBootstrap(): Bootstrapped {
  const { form } = loadWorkingForm();
  const savedAnswers = loadAnswers();
  if (bootstrapCache && bootstrapCache.form === form && bootstrapCache.answers === savedAnswers) {
    return bootstrapCache.value;
  }
  const state: ConversationState = { ...initialState(form), answers: savedAnswers };
  const value = step(state, { type: "REVIEW" });
  bootstrapCache = { form, answers: savedAnswers, value };
  return value;
}

export default function ConfirmPage() {
  const bootstrapped = useSyncExternalStore<Bootstrapped | null>(
    noopSubscribe,
    readBootstrap,
    () => null,
  );
  // No effect just to copy the bootstrapped value into state (that's the
  // exact pattern react-hooks/set-state-in-effect flags) — `override` only
  // holds what the user's own actions have changed since. Until the first
  // dispatch, engine/lastAnnouncements are simply whatever
  // useSyncExternalStore already gives us.
  const [override, setOverride] = useState<Bootstrapped | null>(null);
  const engine = (override ?? bootstrapped)?.state ?? null;
  const lastAnnouncements = (override ?? bootstrapped)?.announcements ?? [];
  const [downloadStatus, setDownloadStatus] = useState<"idle" | "generating" | "done" | "error">("idle");
  const [errorMessage, setErrorMessage] = useState("");
  const headingRef = useRouteFocus<HTMLHeadingElement>();

  if (!engine) {
    return (
      <main id="main-content" className="mx-auto w-full max-w-3xl flex-1 px-6 py-10">
        <p role="status" aria-live="polite" className="text-muted">
          Loading…
        </p>
      </main>
    );
  }

  const fields = applicableFields(engine.form, engine.answers);
  const isAcroForm = fields.some((f) => f.anchor.kind === "acroform");
  const allHeard = fields.length > 0 && fields.every((f) => engine.reviewHeard.has(f.id));

  function dispatch(event: Parameters<typeof step>[1]) {
    if (!engine) return;
    setOverride(step(engine, event));
  }

  async function handleFinish() {
    if (!engine) return;

    // First CONFIRM with unheard answers arms the gate and returns without
    // completing (machine.ts's own override pattern); only dispatch again
    // once we know we're actually complete.
    const result = step(engine, { type: "CONFIRM" });
    setOverride(result);

    if (result.state.phase !== "complete") return;

    saveAnswers(result.state.answers);

    setDownloadStatus("generating");
    setErrorMessage("");
    try {
      const { form } = loadWorkingForm();
      const finalFields = applicableFields(form, result.state.answers);

      if (isAcroForm) {
        const originalFile = await loadOriginalFile();
        if (!originalFile) {
          throw new Error(
            "The original file for this form could not be found. Try uploading it again.",
          );
        }
        const bytes = await fillAcroForm(originalFile, finalFields, result.state.answers);
        downloadBytes(bytes, `${form.title || "filled-form"}.pdf`);
      } else {
        const bytes = await buildSummaryPdf(form.title || "Form summary", finalFields, result.state.answers);
        downloadBytes(bytes, `${form.title || "form-summary"}-summary.pdf`);
      }

      setDownloadStatus("done");
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : "Something went wrong.");
      setDownloadStatus("error");
    }
  }

  const gateWarning = lastAnnouncements.find((a) => a.kind === "error");

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
        <div className="flex items-baseline justify-between gap-4">
          <h2 id="answers-heading" className="sr-only">
            Your answers
          </h2>
          <p className="text-sm font-medium text-muted" aria-hidden="true">
            {engine.reviewHeard.size} of {fields.length} heard
          </p>
        </div>
        <ul className="mt-4 divide-y divide-muted/20">
          {fields.map((field) => {
            const answer = engine.answers[field.id];
            const value = answer ? speakValue(field, answer.value, engine.locale) : "Not answered";
            const isHeard = engine.reviewHeard.has(field.id);
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
                  onClick={() => dispatch({ type: "GOTO", fieldId: field.id })}
                >
                  {isHeard ? "Heard ✓" : "Read back"}
                </Button>
              </li>
            );
          })}
        </ul>
      </Card>

      <div className="mt-6">
        <Notice live tone={downloadStatus !== "done" && (gateWarning || !allHeard) ? "warning" : "info"}>
          {downloadStatus === "done"
            ? isAcroForm
              ? "Your filled form has been downloaded."
              : "Your answer summary has been downloaded. This form has no fillable fields, so a filled copy of the original isn't possible yet — the summary lists every question and answer instead."
            : gateWarning
              ? gateWarning.text
              : allHeard
                ? isAcroForm
                  ? "All answers confirmed. Ready to download your filled form."
                  : "All answers confirmed. This form has no fillable fields, so you'll get a downloadable summary instead of a filled copy."
                : `You have heard ${engine.reviewHeard.size} of ${fields.length} answers. Read back every answer, or press confirm again to proceed anyway.`}
        </Notice>
      </div>

      {downloadStatus === "error" && (
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
          disabled={downloadStatus === "generating"}
          onClick={handleFinish}
        >
          {downloadStatus === "generating"
            ? "Preparing your document…"
            : isAcroForm
              ? "Confirm and download filled form"
              : "Confirm and download summary"}
        </Button>
      </div>
    </main>
  );
}
