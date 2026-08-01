import type { ReactNode } from "react";

interface NoticeProps {
  children: ReactNode;
}

export default function Notice({ children }: NoticeProps) {
  return (
    <div className="flex items-start gap-3 rounded-md border border-muted/30 bg-muted/10 p-4">
      <svg
        aria-hidden="true"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        className="mt-0.5 h-5 w-5 shrink-0 text-muted"
      >
        <circle cx="12" cy="12" r="9" />
        <line x1="12" y1="11" x2="12" y2="16" />
        <circle cx="12" cy="8" r="0.5" fill="currentColor" />
      </svg>
      <p className="text-sm leading-relaxed">{children}</p>
    </div>
  );
}
