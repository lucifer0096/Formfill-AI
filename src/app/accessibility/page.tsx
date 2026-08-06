"use client";

import Card from "@/components/ui/Card";
import Notice from "@/components/ui/Notice";
import LinkButton from "@/components/ui/LinkButton";
import { useRouteFocus } from "@/lib/use-route-focus";

const SUPPORTED = [
  {
    title: "Full keyboard access",
    body: "Every control on every page is a real button, link, or input — nothing requires a mouse, and nothing is reachable only by dragging.",
  },
  {
    title: "Single-key shortcuts while answering questions",
    body: "N, P, H, L and R move between questions, show help, or jump straight to review — without needing to tab to a button first. They're automatically turned off while you're typing in the answer box, so they never interfere with your answer.",
  },
  {
    title: "Focus moves with you",
    body: "Moving to a new page, or to the field list after uploading, moves focus to that page's heading automatically — so a screen reader announces where you are without you having to search for it.",
  },
  {
    title: "Real write-back, not just a summary",
    body: "When your form has real fillable PDF fields, your answers are matched and written directly into them and flattened into a genuine filled PDF — not just a plain-text summary standing in for the original document.",
  },
  {
    title: "Nothing is finished silently",
    body: "Every answer is listed for review, side by side with its question, and you must confirm before a file is generated — that step can't be skipped.",
  },
  {
    title: "High-contrast, resizable text",
    body: "Text and interface colours are checked against WCAG contrast requirements, and the layout is built with relative units so browser zoom and text-size settings work as expected.",
  },
];

const IN_PROGRESS = [
  {
    title: "Screen-reader vs. spoken-aloud modes",
    body: "FormFill doesn't automatically read questions aloud or detect whether you're using a screen reader — if you use one, its own reading of the page is currently your primary source of information. “Read as printed” (or the L key) can speak the current answer on demand.",
  },
  {
    title: "Scanned or photographed forms aren't specially handled",
    body: "Every upload goes to the same AI model regardless of quality, but there's no separate check for a hard-to-read scan — it may produce an incomplete or inaccurate field list rather than a clear warning.",
  },
  {
    title: "PDF field write-back is best-effort",
    body: "Matching your answers to a real PDF's fillable fields is done automatically from the text printed near each field on the page. This works well on most forms, but a field can still be left blank if its label can't be confidently matched — most often on scans with no extractable text.",
  },
  {
    title: "Spoken format hints before you type",
    body: "Guidance like “enter this as day, month, year” isn't shown before you start typing yet — you'll need to infer the expected format from the question or its help text.",
  },
];

export default function AccessibilityPage() {
  const headingRef = useRouteFocus<HTMLHeadingElement>();

  return (
    <main id="main-content" className="mx-auto w-full max-w-3xl flex-1 px-6 py-10">
      <section aria-labelledby="page-heading" tabIndex={0} className="rounded-lg">
        <h1
          id="page-heading"
          ref={headingRef}
          tabIndex={-1}
          className="text-3xl font-bold tracking-tight sm:text-4xl"
        >
          Accessibility
        </h1>
        <p className="mt-3 text-lg text-muted">
          FormFill is built for people who are blind or have low vision. Here&apos;s what&apos;s
          supported today, and what we&apos;re still working on — stated plainly rather than
          assumed.
        </p>
      </section>

      <Card as="section" aria-labelledby="supported-heading" tabIndex={0} className="mt-8">
        <h2 id="supported-heading" className="text-xl font-semibold">
          What&apos;s supported today
        </h2>
        <ul className="mt-5 space-y-5">
          {SUPPORTED.map((item) => (
            <li key={item.title}>
              <span className="block font-semibold">{item.title}</span>
              <span className="mt-0.5 block text-sm text-muted">{item.body}</span>
            </li>
          ))}
        </ul>
      </Card>

      <Card as="section" aria-labelledby="in-progress-heading" tabIndex={0} className="mt-8">
        <h2 id="in-progress-heading" className="text-xl font-semibold">
          What we&apos;re still working on
        </h2>
        <ul className="mt-5 space-y-5">
          {IN_PROGRESS.map((item) => (
            <li key={item.title}>
              <span className="block font-semibold">{item.title}</span>
              <span className="mt-0.5 block text-sm text-muted">{item.body}</span>
            </li>
          ))}
        </ul>
      </Card>

      <div className="mt-6">
        <Notice>
          Found something that doesn&apos;t work well with your screen reader or assistive
          technology? Let us know — accessibility bugs are treated as functional bugs here, not
          polish items.
        </Notice>
      </div>

      <div className="mt-8">
        <LinkButton href="/help" variant="secondary">
          Back to Help
        </LinkButton>
      </div>
    </main>
  );
}
