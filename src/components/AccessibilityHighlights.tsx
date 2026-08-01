const FEATURES = [
  "Keyboard-first navigation",
  "Works with screen readers",
  "Optional text-to-speech support",
];

export default function AccessibilityHighlights() {
  return (
    <section aria-labelledby="a11y-highlights-heading" className="border-t border-muted/30 pt-6">
      <h2 id="a11y-highlights-heading" className="flex items-center gap-2 text-lg font-semibold">
        <svg
          aria-hidden="true"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          className="h-6 w-6"
        >
          <circle cx="12" cy="4.5" r="1.5" fill="currentColor" stroke="none" />
          <path d="M4 8.5c2.5 1 5.3 1.5 8 1.5s5.5-.5 8-1.5" />
          <path d="M12 10v4m0 0-3 7m3-7 3 7" />
          <path d="M9 13h6" />
        </svg>
        Accessibility
      </h2>
      <ul className="mt-3 list-disc space-y-1 pl-6">
        {FEATURES.map((feature) => (
          <li key={feature}>{feature}</li>
        ))}
      </ul>
    </section>
  );
}
