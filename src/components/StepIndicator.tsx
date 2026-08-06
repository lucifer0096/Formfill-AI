const STEPS = [
  "Upload form",
  "Review extracted fields",
  "Form overview",
  "Answer questions",
  "Review answers",
];

interface StepIndicatorProps {
  /** 0-based index into STEPS of the step currently active. */
  currentIndex: number;
}

export default function StepIndicator({ currentIndex }: StepIndicatorProps) {
  return (
    <nav aria-label="Form session progress">
      <ol className="flex flex-wrap gap-x-6 gap-y-3">
        {STEPS.map((step, index) => {
          const isCurrent = index === currentIndex;
          return (
            <li key={step} className="flex items-center gap-2">
              <span
                aria-hidden="true"
                className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-full border-2 text-sm font-bold ${
                  isCurrent
                    ? "border-accent-strong bg-accent-strong text-white"
                    : "border-muted text-muted"
                }`}
              >
                {index + 1}
              </span>
              <span
                className={isCurrent ? "font-semibold" : "text-muted"}
                aria-current={isCurrent ? "step" : undefined}
              >
                {step}
              </span>
            </li>
          );
        })}
      </ol>
    </nav>
  );
}
