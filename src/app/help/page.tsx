"use client";

import Card from "@/components/ui/Card";
import LinkButton from "@/components/ui/LinkButton";
import { useRouteFocus } from "@/lib/use-route-focus";

const STEPS = [
  {
    title: "Upload your form",
    body: "Choose or drag in a PDF, PNG, or JPG. Nothing is uploaded to a server at this point — the file stays in your browser.",
  },
  {
    title: "Review extracted fields",
    body: "FormFill reads the form and shows you what it found. Each field is tagged with how confident it is — anything uncertain is flagged so you know to double-check it.",
  },
  {
    title: "Form overview",
    body: "See the form broken into sections, with an estimate of how long it will take.",
  },
  {
    title: "Answer questions",
    body: "One question at a time, in plain language. Nothing is saved to the actual form until you say so.",
  },
  {
    title: "Review your answers",
    body: "Every answer is read back to you before anything is finished. You must confirm each one has been reviewed — this step can't be skipped.",
  },
];

const KEYBOARD_SHORTCUTS = [
  { keys: "Tab / Shift+Tab", action: "Move between controls on any page" },
  { keys: "Enter / Space", action: "Activate the focused button or link" },
  { keys: "N", action: "Next question (on the Answer questions page)" },
  { keys: "P", action: "Previous question (on the Answer questions page)" },
  { keys: "Space", action: "Repeat the current question" },
  { keys: "H", action: "Show or hide help for the current question" },
  { keys: "S", action: "Skip the current question, if it's optional" },
];

const FAQS = [
  {
    q: "Do I need a screen reader to use FormFill?",
    a: "No. FormFill works fully by keyboard and standard browser focus, with or without a screen reader running.",
  },
  {
    q: "What file types are supported?",
    a: "PDF, PNG, and JPG. PDFs with real fillable fields are read directly. Flat PDFs (scans, or forms without fillable fields) have their text read and turned into questions automatically. Scanned images are not fully supported yet.",
  },
  {
    q: "Is my information sent anywhere?",
    a: "The file itself never leaves your browser. If a form needs to be classified into questions, only the extracted text — not the file — is sent for that one step.",
  },
  {
    q: "Can I go back and change an answer?",
    a: "Yes, at any point before you confirm. Use Previous on the Answer questions page, or Back to questions from the review page.",
  },
];

export default function HelpPage() {
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
          Help
        </h1>
        <p className="mt-3 text-lg text-muted">
          How FormFill works, and how to get through a form quickly by keyboard.
        </p>
      </section>

      <Card as="section" aria-labelledby="steps-heading" tabIndex={0} className="mt-8">
        <h2 id="steps-heading" className="text-xl font-semibold">
          How a form session works
        </h2>
        <ol className="mt-5 space-y-5">
          {STEPS.map((step, index) => (
            <li key={step.title} className="flex gap-4">
              <span
                aria-hidden="true"
                className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full border-2 border-muted text-sm font-bold"
              >
                {index + 1}
              </span>
              <span>
                <span className="block font-semibold">{step.title}</span>
                <span className="mt-0.5 block text-sm text-muted">{step.body}</span>
              </span>
            </li>
          ))}
        </ol>
      </Card>

      <Card as="section" aria-labelledby="keyboard-heading" tabIndex={0} className="mt-8">
        <h2 id="keyboard-heading" className="text-xl font-semibold">
          Keyboard shortcuts
        </h2>
        <div className="mt-5 overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead>
              <tr className="border-b border-muted/30 text-muted">
                <th scope="col" className="py-2 pr-4 font-semibold">
                  Keys
                </th>
                <th scope="col" className="py-2 font-semibold">
                  Action
                </th>
              </tr>
            </thead>
            <tbody>
              {KEYBOARD_SHORTCUTS.map((row) => (
                <tr key={row.keys} className="border-b border-muted/10 last:border-0">
                  <td className="py-2 pr-4 font-mono text-sm">{row.keys}</td>
                  <td className="py-2">{row.action}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="mt-4 text-sm text-muted">
          The N / P / Space / H / S shortcuts are only active when focus is on the question page
          itself, not inside the answer box — so they never interfere with typing.
        </p>
      </Card>

      <Card as="section" aria-labelledby="faq-heading" tabIndex={0} className="mt-8">
        <h2 id="faq-heading" className="text-xl font-semibold">
          Frequently asked questions
        </h2>
        <dl className="mt-5 space-y-5">
          {FAQS.map((item) => (
            <div key={item.q}>
              <dt className="font-semibold">{item.q}</dt>
              <dd className="mt-1 text-sm text-muted">{item.a}</dd>
            </div>
          ))}
        </dl>
      </Card>

      <div className="mt-8">
        <LinkButton href="/accessibility" variant="secondary">
          Accessibility features
        </LinkButton>
      </div>
    </main>
  );
}
