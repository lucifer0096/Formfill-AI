import Card from "@/components/ui/Card";

export interface Step {
  title: string;
  description: string;
}

interface StepsPanelProps {
  heading: string;
  steps: Step[];
}

export default function StepsPanel({ heading, steps }: StepsPanelProps) {
  return (
    <Card as="section" aria-labelledby="steps-panel-heading" tabIndex={0}>
      <h2 id="steps-panel-heading" className="text-xl font-semibold">
        {heading}
      </h2>
      <ol className="mt-5 space-y-6">
        {steps.map((step, index) => (
          <li key={step.title} className="flex gap-4">
            <span
              aria-hidden="true"
              className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full border-2 border-muted text-sm font-bold"
            >
              {index + 1}
            </span>
            <span>
              <span className="block font-semibold">{step.title}</span>
              <span className="mt-0.5 block text-sm text-muted">{step.description}</span>
            </span>
          </li>
        ))}
      </ol>
    </Card>
  );
}
