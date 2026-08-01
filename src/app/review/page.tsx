import Card from "@/components/ui/Card";
import LinkButton from "@/components/ui/LinkButton";
import Notice from "@/components/ui/Notice";
import ProgressTrail from "@/components/ProgressTrail";

/*
 * Placeholder data. Once /api/understand exists, this page receives a real
 * Form (packages/form-model) and renders its sections/fields instead.
 */
const DETECTED_FIELDS = [
  { label: "Full name", type: "Name", confidence: "high" as const },
  { label: "Date of birth", type: "Date", confidence: "high" as const },
  { label: "National Insurance number", type: "Text", confidence: "medium" as const },
  { label: "Home address", type: "Address", confidence: "high" as const },
  { label: "Applicant's declaration of relevant prior interests", type: "Choice", confidence: "low" as const },
];

const CONFIDENCE_LABEL: Record<"high" | "medium" | "low", string> = {
  high: "Detected with high confidence",
  medium: "Detected, worth a quick check",
  low: "Uncertain — please confirm this one",
};

export default function ReviewFieldsPage() {
  return (
    <main id="main-content" className="mx-auto w-full max-w-3xl flex-1 px-6 py-10">
      <ProgressTrail current={2} />

      <section aria-labelledby="page-heading" tabIndex={0} className="mt-8 rounded-lg">
        <h1 id="page-heading" className="text-3xl font-bold tracking-tight sm:text-4xl">
          Review extracted fields
        </h1>
        <p className="mt-3 text-lg text-muted">
          We found {DETECTED_FIELDS.length} questions on your form. Check the list below before
          we build the full overview.
        </p>
      </section>

      <Card as="section" aria-labelledby="fields-heading" tabIndex={0} className="mt-8">
        <h2 id="fields-heading" className="sr-only">
          Detected fields
        </h2>
        <ul className="divide-y divide-muted/20">
          {DETECTED_FIELDS.map((field) => (
            <li key={field.label} className="flex items-start justify-between gap-4 py-4 first:pt-0 last:pb-0">
              <div>
                <p className="font-medium">{field.label}</p>
                <p className="text-sm text-muted">{field.type}</p>
              </div>
              <span
                className={`shrink-0 rounded-full px-3 py-1 text-xs font-semibold ${
                  field.confidence === "low"
                    ? "bg-accent-strong/10 text-accent-strong"
                    : "bg-muted/10 text-muted"
                }`}
              >
                {CONFIDENCE_LABEL[field.confidence]}
              </span>
            </li>
          ))}
        </ul>
      </Card>

      <div className="mt-6">
        <Notice>
          Low-confidence fields are never guessed silently — you will be asked to confirm them
          in your own words when we get there.
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
