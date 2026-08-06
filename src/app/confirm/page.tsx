"use client";

import { useState, useSyncExternalStore } from "react";
import { useRouter } from "next/navigation";
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
import type { VerificationResult } from "@/lib/openrouter/verify-answers";
import { speak } from "@/lib/speech";
import { useRegisterReadAloud } from "@/lib/speech/use-global-read-aloud";

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
  const router = useRouter();
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
  // Not rendered anywhere yet — /api/verify (Nigel's second-pass reliability
  // check, docs/MODELS.html §06) is called here so the result is available
  // to build a UI against later, without deciding that UI now. Deliberately
  // best-effort: a verification failure (model down, rate-limited, etc.)
  // must never block the actual download, so it's swallowed rather than
  // surfaced as an error — verificationResult stays null on failure, same
  // as "verification didn't run" from the caller's point of view.
  const [verificationResult, setVerificationResult] = useState<VerificationResult | null>(null);
  const headingRef = useRouteFocus<HTMLHeadingElement>();

  // Computed unconditionally, before the early return below, for the same
  // reason questions/page.tsx's registeredQuestionText is: a hook can't be
  // called only inside one render branch. Reads answers straight off
  // engine.answers rather than the fields/speakValue helpers used further
  // down (those are only computed after the early return), so this stays
  // safe even while engine is still null.
  const registeredAnswersText = engine
    ? applicableFields(engine.form, engine.answers)
      .map((f) => {
        const answer = engine.answers[f.id];
        const isAnswered = answer && answer.state !== "skipped";
        return `${f.spokenLabel} ${isAnswered ? speakValue(f, answer.value, engine.locale) : "not answered"}.`;
      })
      .join(" ")
    : "";
  useRegisterReadAloud(registeredAnswersText);

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
  // A field can be real-PDF-fillable either through its own field-level
  // anchor, or (a Yes/No question printed as two separate real checkboxes)
  // only through per-option acroFieldName mappings on constraints.options —
  // see src/lib/emit/fill-acroform.ts for why that second path exists.
  // Missing this here would incorrectly fall through to the plain summary
  // output for a form whose only real mapping is the per-option kind.
  const isAcroForm = fields.some(
    (f) => f.anchor.kind === "acroform" || (f.constraints.options ?? []).some((o) => o.acroFieldName),
  );
  const allHeard = fields.length > 0 && fields.every((f) => engine.reviewHeard.has(f.id));

  // "Back to questions" used to be a bare /questions link with no ?field=,
  // which silently restarted from the first question every time regardless
  // of where the user actually was — resuming on the first field that
  // still needs an answer (falling back to the very first field once
  // everything's answered) matches the same ?field= pattern each row's own
  // "Answer this" / "Read back" button already uses.
  const firstUnanswered = fields.find((f) => {
    const a = engine.answers[f.id];
    return !a || a.state === "empty" || a.state === "skipped";
  });
  const backToQuestionsHref = `/questions?field=${encodeURIComponent((firstUnanswered ?? fields[0])?.id ?? "")}`;

  // The engine only ever marks an answer "heard" via reviewLine(), which
  // runs when NEXT/PREV move reviewIndex while phase === "reviewing" (see
  // machine.ts) — GOTO (used elsewhere for jumping the asking-phase cursor)
  // never touches reviewHeard at all. Clicking a specific field's "Read
  // back" button needs to land reviewIndex on THAT field, not just move it
  // by one, so this walks NEXT/PREV the right number of steps from
  // wherever review currently is — same events the keyboard N/P shortcuts
  // already use during review, just dispatched in a batch.
  function readBackField(fieldId: string) {
    if (!engine) return;
    const targetIndex = fields.findIndex((f) => f.id === fieldId);
    if (targetIndex === -1) return;
    // advance()'s NEXT/PREV only move reviewIndex while phase is already
    // "reviewing" — REVIEW re-enters review mode from the top (reviewIndex
    // 0) if it isn't already, so the walk below always starts from a known
    // point regardless of what the engine was doing before this click.
    let current = engine.phase === "reviewing" ? engine : step(engine, { type: "REVIEW" }).state;
    const startIndex = current.phase === "reviewing" ? current.reviewIndex : 0;
    const delta = targetIndex - startIndex;
    const step_ = delta > 0 ? 1 : -1;
    let result: ReturnType<typeof step> = { state: current, announcements: [] };
    for (let i = 0; i < Math.abs(delta); i += 1) {
      result = step(current, { type: step_ > 0 ? "NEXT" : "PREV" });
      current = result.state;
    }
    setOverride(result);
  }

  async function handleFinish() {
    if (!engine) return;

    // First CONFIRM with unheard answers arms the gate and returns without
    // completing (machine.ts's own override pattern); only dispatch again
    // once we know we're actually complete.
    const result = step(engine, { type: "CONFIRM" });
    setOverride(result);

    // machine.ts's confirm() jumps its own cursor to the first unanswered
    // required field (phase becomes "asking") rather than completing, but
    // that's in-memory engine state only — nothing here previously acted on
    // it, so the user stayed on /confirm with no visible change at all.
    // Navigating to /questions with that field id (picked up in that page's
    // readBootstrap via ?field=<id>) is what actually takes them there.
    if (result.state.phase === "asking" && result.state.cursor) {
      saveAnswers(result.state.answers);
      router.push(`/questions?field=${encodeURIComponent(result.state.cursor)}`);
      return;
    }

    if (result.state.phase !== "complete") return;

    saveAnswers(result.state.answers);

    setDownloadStatus("generating");
    setErrorMessage("");
    try {
      const { form } = loadWorkingForm();
      const finalFields = applicableFields(form, result.state.answers);

      // Best-effort, never blocks the download — see verificationResult's
      // own comment for why a failure here is swallowed rather than thrown.
      fetch("/api/verify", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ fields: finalFields, answers: result.state.answers }),
      })
        .then((res) => (res.ok ? (res.json() as Promise<VerificationResult>) : null))
        .then((verification) => setVerificationResult(verification))
        .catch(() => setVerificationResult(null));

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

      {verificationResult && !verificationResult.ok && verificationResult.issues.length > 0 && (
        <div className="mt-8">
          <Notice tone="warning">
            <span className="font-semibold">Worth a second look: </span>
            {verificationResult.issues.map((issue, index) => (
              <span key={issue.fieldId}>
                {index > 0 && " "}
                {issue.concern}
              </span>
            ))}
          </Notice>
        </div>
      )}

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
            const isAnswered = answer && answer.state !== "skipped";
            const value = isAnswered ? speakValue(field, answer.value, engine.locale) : "Not answered";
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
                  aria-pressed={isAnswered ? isHeard : undefined}
                  onClick={() => {
                    if (!isAnswered) {
                      router.push(`/questions?field=${encodeURIComponent(field.id)}`);
                      return;
                    }
                    // "Read back" now actually speaks the answer aloud, not
                    // just a silent state change — the manual Read Aloud
                    // control per docs/ACCESSIBILITY.md §1.1's safe
                    // fallback, added to the same button rather than a
                    // second one next to it, since this button's name
                    // already promised audio it never delivered.
                    speak(`${field.spokenLabel} ${value}`);
                    readBackField(field.id);
                  }}
                >
                  {isAnswered ? (isHeard ? "Heard ✓" : "Read back") : "Answer this"}
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
        <LinkButton href={backToQuestionsHref} variant="secondary">
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
