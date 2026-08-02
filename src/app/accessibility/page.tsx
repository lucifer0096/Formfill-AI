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
    body: "N, P, Space, H and S move between questions, repeat a question, or show help — without needing to tab to a button first. These are automatically turned off while you're typing, so they never interfere with your answer.",
  },
  {
    title: "Focus moves with you",
    body: "When you move to a new page, or to the next question, focus moves to the new heading automatically — so a screen reader announces where you are without you having to search for it.",
  },
  {
    title: "Clear error messages",
    body: "If a required question is left blank, the error names the question and says what's needed — never just \"invalid input.\"",
  },
  {
    title: "Nothing is finished silently",
    body: "Every answer is read back to you before your form session can be marked complete, and that step cannot be skipped.",
  },
  {
    title: "High-contrast, resizable text",
    body: "Text and interface colours are checked against WCAG contrast requirements, and the layout is built with relative units so browser zoom and text-size settings work as expected.",
  },
];

const IN_PROGRESS = [
  {
    title: "Screen-reader vs. spoken-aloud modes",
    body: "FormFill doesn't yet detect whether you're using a screen reader and adjust automatically. If you use a screen reader, its own reading of the page is currently your primary source of information.",
  },
  {
    title: "Reading forms from photos or scans",
    body: "PDF forms with real fillable fields, and flat PDFs, are supported today. Scanned photos and image-only forms are not yet — you'll see a clear message rather than a silent failure if you try.",
  },
  {
    title: "Spoken format hints before you type",
    body: "Guidance like \"enter this as day, month, year\" is planned to appear before you start typing an answer, not just after a mistake.",
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
          className="text-3xl font-bold tracking-tight sm:text-4xl focus-visible:outline-none"
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
