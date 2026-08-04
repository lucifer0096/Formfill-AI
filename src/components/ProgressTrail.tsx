interface ProgressTrailProps {
  current: 1 | 2 | 3 | 4 | 5;
}

const LABELS = [
  "Upload form",
  "Review extracted fields",
  "Form overview",
  "Answer questions",
  "Review answers",
];

export default function ProgressTrail({ current }: ProgressTrailProps) {
  return (
    <nav aria-label="Form session progress">
      <ol className="flex flex-wrap gap-x-6 gap-y-2 text-sm">
        {LABELS.map((label, index) => {
          const step = index + 1;
          const isCurrent = step === current;
          const isDone = step < current;
          return (
            <li key={label} className="flex items-center gap-2">
              <span
                aria-hidden="true"
                className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-full border-2 text-xs font-bold ${
                  isCurrent
                    ? "border-accent-strong bg-accent-strong text-white"
                    : isDone
                      ? "border-accent-strong text-accent-strong"
                      : "border-muted/50 text-muted"
                }`}
              >
                {step}
              </span>
              <span
                className={isCurrent ? "font-semibold" : "text-muted"}
                aria-current={isCurrent ? "step" : undefined}
              >
                {label}
              </span>
            </li>
          );
        })}
      </ol>
    </nav>
  );
}
