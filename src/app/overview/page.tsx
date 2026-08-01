import Card from "@/components/ui/Card";
import LinkButton from "@/components/ui/LinkButton";
import ProgressTrail from "@/components/ProgressTrail";

/*
 * Placeholder data shaped like packages/form-model's Section[]. Once wired to
 * a real Form, this becomes a map over form.sections instead.
 */
const SECTIONS = [
  { title: "About you", fieldCount: 4 },
  { title: "Your address", fieldCount: 3 },
  { title: "Declaration", fieldCount: 1 },
];

const TOTAL_FIELDS = SECTIONS.reduce((sum, s) => sum + s.fieldCount, 0);
const ESTIMATED_MINUTES = Math.max(2, Math.round(TOTAL_FIELDS * 0.6));

export default function FormOverviewPage() {
  return (
    <main id="main-content" className="mx-auto w-full max-w-3xl flex-1 px-6 py-10">
      <ProgressTrail current={3} />

      <section aria-labelledby="page-heading" tabIndex={0} className="mt-8 rounded-lg">
        <h1 id="page-heading" className="text-3xl font-bold tracking-tight sm:text-4xl">
          Form overview
        </h1>
        <p className="mt-3 text-lg text-muted">
          {SECTIONS.length} sections, {TOTAL_FIELDS} questions in total. This should take about{" "}
          {ESTIMATED_MINUTES} minutes.
        </p>
      </section>

      <Card as="section" aria-labelledby="sections-heading" tabIndex={0} className="mt-8">
        <h2 id="sections-heading" className="text-xl font-semibold">
          Sections
        </h2>
        <ol className="mt-5 space-y-4">
          {SECTIONS.map((section, index) => (
            <li key={section.title} className="flex items-center gap-4">
              <span
                aria-hidden="true"
                className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full border-2 border-muted text-sm font-bold"
              >
                {index + 1}
              </span>
              <span>
                <span className="block font-semibold">{section.title}</span>
                <span className="block text-sm text-muted">
                  {section.fieldCount} {section.fieldCount === 1 ? "question" : "questions"}
                </span>
              </span>
            </li>
          ))}
        </ol>
      </Card>

      <p className="mt-6 text-sm text-muted">
        You will answer one question at a time. Press N for the next question, P to go back, and
        R at any point to review everything you have entered so far.
      </p>

      <div className="mt-8 flex flex-col gap-4 sm:flex-row sm:justify-between">
        <LinkButton href="/review" variant="secondary">
          Back
        </LinkButton>
        <LinkButton href="/questions" variant="primary">
          Start answering
        </LinkButton>
      </div>
    </main>
  );
}
