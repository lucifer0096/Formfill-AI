"use client";

import { useSyncExternalStore } from "react";
import { useRouter } from "next/navigation";
import Card from "@/components/ui/Card";
import LinkButton from "@/components/ui/LinkButton";
import Notice from "@/components/ui/Notice";
import ProgressTrail from "@/components/ProgressTrail";
import ReadAloudButton from "@/components/ui/ReadAloudButton";
import { useRegisterReadAloud } from "@/lib/speech/use-global-read-aloud";
import { loadIngestResult, PLACEHOLDER_FIELDS, type StoredIngest } from "@/lib/session-store";
import { useRouteFocus } from "@/lib/use-route-focus";
import type { Field, FieldType } from "@/lib/form-model/types";

type ConfidenceBand = "high" | "medium" | "low";

function bandFor(confidence: number): ConfidenceBand {
  if (confidence >= 0.8) return "high";
  if (confidence >= 0.5) return "medium";
  return "low";
}

const TYPE_LABEL: Record<FieldType, string> = {
  text: "Text",
  longtext: "Long text",
  number: "Number",
  currency: "Amount",
  date: "Date",
  email: "Email",
  phone: "Phone number",
  name: "Name",
  address: "Address",
  choice: "Choose one",
  multichoice: "Choose any that apply",
  boolean: "Checkbox",
  signature: "Signature",
  unknown: "Unclear field type",
};

const CONFIDENCE_LABEL: Record<ConfidenceBand, string> = {
  high: "Detected with high confidence",
  medium: "Detected, worth a quick check",
  low: "Uncertain — please confirm this one",
};

const noopSubscribe = () => () => {};

/**
 * Classification now happens synchronously during upload (see
 * src/lib/ingest/index.ts and UploadWorkflow.tsx) — a single multimodal
 * model call per the 2026-08-02 pivot with Nigel — so this page has nothing
 * left to fetch on mount. It only has to display what's already in session
 * storage by the time the user navigates here.
 */
export default function ReviewFieldsPage() {
  // sessionStorage is browser-only; useSyncExternalStore reads it safely
  // across server prerendering (getServerSnapshot) and the client, without
  // a setState-in-effect or a hydration mismatch.
  const stored = useSyncExternalStore<StoredIngest | null | undefined>(
    noopSubscribe,
    loadIngestResult,
    () => undefined,
  );

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
    return (
      <ReviewFields
        fields={stored.form.sections.flatMap((s) => s.fields)}
        title={stored.form.title}
        description={stored.form.description}
      />
    );
  }

  if (stored?.kind === "needs-vision") {
    return <NeedsVision fileName={stored.fileName} />;
  }

  // Nothing in session storage — dev/demo fallback so the page is still browsable directly.
  return <ReviewFields fields={PLACEHOLDER_FIELDS} />;
}

function ReviewFields({
  fields,
  title,
  description,
}: {
  fields: Field[];
  title?: string;
  description?: string;
}) {
  const router = useRouter();
  const headingRef = useRouteFocus<HTMLHeadingElement>();
  const lowConfidenceCount = fields.filter((field) => bandFor(field.confidence) === "low").length;
  const summaryText = `${description ? `${description} ` : ""}We found ${fields.length} ${
    fields.length === 1 ? "question" : "questions"
  } on your form.${
    lowConfidenceCount > 0
      ? ` ${lowConfidenceCount} ${lowConfidenceCount === 1 ? "needs" : "need"} a closer look.`
      : ""
  }`;
  useRegisterReadAloud(summaryText);
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
        {description && (
          <p className="mt-3 text-base text-foreground">
            {title && <span className="font-semibold">{title}. </span>}
            {description}
          </p>
        )}
        <p className="mt-3 text-lg text-muted">
          We found {fields.length} {fields.length === 1 ? "question" : "questions"} on your form.
          Check the list below before we build the full overview.
        </p>
        <div className="mt-4">
          <ReadAloudButton text={summaryText} />
        </div>
      </section>

      <Card as="section" aria-labelledby="fields-heading" tabIndex={0} className="mt-8">
        <h2 id="fields-heading" className="sr-only">
          Detected fields
        </h2>
        <div className="flex items-center justify-between gap-4 rounded-md bg-muted/10 px-4 py-3">
          <p className="text-sm font-semibold">
            {fields.length} {fields.length === 1 ? "question" : "questions"} found
          </p>
          {lowConfidenceCount > 0 && (
            <span className="shrink-0 rounded-full bg-accent-strong/10 px-3 py-1 text-xs font-semibold text-accent-strong">
              {lowConfidenceCount} {lowConfidenceCount === 1 ? "needs" : "need"} a closer look
            </span>
          )}
        </div>
        <ul className="mt-4 divide-y divide-muted/20">
          {fields.map((field) => {
            const band = bandFor(field.confidence);
            return (
              <li key={field.id}>
                <button
                  type="button"
                  onClick={() => router.push(`/questions?field=${encodeURIComponent(field.id)}`)}
                  className="flex w-full items-start justify-between gap-4 py-4 text-left first:pt-0 last:pb-0 hover:bg-muted/5 focus-visible:outline-3 focus-visible:outline-accent-strong rounded-md px-2 -mx-2"
                >
                  <div>
                    <p className="font-medium">{field.spokenLabel}</p>
                    <p className="text-sm text-muted">{TYPE_LABEL[field.type]}</p>
                  </div>
                  <span
                    className={`shrink-0 rounded-full px-3 py-1 text-xs font-semibold ${
                      band === "low" ? "bg-accent-strong/10 text-accent-strong" : "bg-muted/10 text-muted"
                    }`}
                  >
                    {CONFIDENCE_LABEL[band]}
                  </span>
                </button>
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
          <strong>{fileName}</strong> isn&apos;t a file type we can read yet. Only PDF, PNG, and
          JPG uploads are supported right now.
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
