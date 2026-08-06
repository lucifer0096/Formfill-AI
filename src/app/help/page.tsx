"use client";

import Card from "@/components/ui/Card";
import LinkButton from "@/components/ui/LinkButton";
import { useRouteFocus } from "@/lib/use-route-focus";

const STEPS = [
  {
    title: "Upload your form",
    body: "Choose or drag in a PDF, PNG, or JPG. Nothing is sent anywhere until you press Continue.",
  },
  {
    title: "Review extracted fields",
    body: "An AI model reads the whole document and gives you a plain-language description of the form and how many sections it has.",
  },
  {
    title: "Form overview",
    body: "See every detected question listed by section — its type and whether it's required — before you start answering.",
  },
  {
    title: "Answer questions",
    body: "One question at a time, in plain language. Choice and yes/no questions offer buttons to pick from; everything else is a text box.",
  },
  {
    title: "Review your answers",
    body: "Every question and answer is listed side by side. You must confirm before a file is generated — this step can't be skipped.",
  },
];

const KEYBOARD_SHORTCUTS = [
  { keys: "Tab / Shift+Tab", action: "Move between controls on any page" },
  { keys: "Enter / Space", action: "Activate the focused button or link" },
  { keys: "N", action: "Next question (on the Answer questions page)" },
  { keys: "P", action: "Previous question (on the Answer questions page)" },
  { keys: "H", action: "Show or hide help for the current question" },
  { keys: "L", action: "Spell back what you've typed for the current question, letter by letter" },
  { keys: "R", action: "Jump straight to Review answers" },
];

const FAQS = [
  {
    q: "Do I need a screen reader to use FormFill?",
    a: "No. Every control is a real button, link, or input — reachable and operable by keyboard alone, with or without a screen reader running.",
  },
  {
    q: "What file types are supported?",
    a: "PDF, PNG, or JPG. Every form is read directly by an AI model to turn it into questions, whether or not the PDF has real fillable fields. If it does, your answers can be written back into the original file's fields when you download; otherwise you'll get a summary of your answers instead.",
  },
  {
    q: "Is my information sent anywhere?",
    a: "The document itself is sent to an AI model (via OpenRouter) so it can be read and turned into questions — this app deliberately sends the actual file rather than text extracted locally, since local extraction was found to be unreliable on real forms. Your typed answers are never sent anywhere: matching them back into the original PDF's fields, and generating the file you download, all happen in your browser.",
  },
  {
    q: "Can I go back and change an answer?",
    a: "Yes, any time before you download. Use Previous while answering, or Back to questions from the review page.",
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
          className="text-3xl font-bold tracking-tight sm:text-4xl"
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
          The N / P / H / L / R shortcuts are only active while focus is on the question page
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
