import Link, { type LinkProps } from "next/link";
import type { AnchorHTMLAttributes, ReactNode } from "react";

type ButtonVariant = "primary" | "secondary";

interface LinkButtonProps extends LinkProps, AnchorHTMLAttributes<HTMLAnchorElement> {
  variant?: ButtonVariant;
  children: ReactNode;
  className?: string;
}

const base =
  "inline-flex items-center justify-center rounded-md px-6 py-3 text-base font-semibold transition-colors";

// Same variant styling as Button — kept in sync by hand since a <Link> and a
// <button> can't share one component (different element, different props).
const variants: Record<ButtonVariant, string> = {
  primary: "bg-accent-strong text-white hover:brightness-90",
  secondary:
    "border-2 border-foreground bg-transparent text-foreground hover:bg-foreground hover:text-background",
};

export default function LinkButton({
  variant = "primary",
  className = "",
  children,
  ...props
}: LinkButtonProps) {
  return (
    <Link className={`${base} ${variants[variant]} ${className}`} {...props}>
      {children}
    </Link>
  );
}
