import type { ReactNode } from "react";

type NoticeTone = "info" | "warning";

interface NoticeProps {
  children: ReactNode;
  /** Set when this Notice's content changes in response to user action and should be announced — e.g. a running count. Static notices should leave this unset. */
  live?: boolean;
  /** "warning" is for content the user needs to act on (e.g. an unheard-answers gate) — distinct icon shape and color, not just the same info glyph in every context. */
  tone?: NoticeTone;
}

const TONE_CLASSES: Record<NoticeTone, string> = {
  info: "border-muted/30 bg-muted/10 text-muted",
  warning: "border-accent-strong/40 bg-accent-strong/10 text-accent-strong",
};

export default function Notice({ children, live = false, tone = "info" }: NoticeProps) {
  return (
    <div
      role={live ? "status" : undefined}
      aria-live={live ? "polite" : undefined}
      className={`flex items-start gap-3 rounded-md border p-4 ${TONE_CLASSES[tone]}`}
    >
      {tone === "warning" ? (
        <svg
          aria-hidden="true"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          className="mt-0.5 h-5 w-5 shrink-0"
        >
          <path d="M12 3 2 20h20L12 3z" strokeLinejoin="round" />
          <line x1="12" y1="10" x2="12" y2="14" />
          <circle cx="12" cy="17" r="0.5" fill="currentColor" />
        </svg>
      ) : (
        <svg
          aria-hidden="true"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          className="mt-0.5 h-5 w-5 shrink-0"
        >
          <circle cx="12" cy="12" r="9" />
          <line x1="12" y1="11" x2="12" y2="16" />
          <circle cx="12" cy="8" r="0.5" fill="currentColor" />
        </svg>
      )}
      <p className="text-sm leading-relaxed text-foreground">{children}</p>
    </div>
  );
}
