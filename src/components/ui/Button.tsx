import type { ButtonHTMLAttributes } from "react";

type ButtonVariant = "primary" | "secondary";

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
}

const base =
  "inline-flex items-center justify-center rounded-md px-6 py-3 text-base font-semibold transition-colors disabled:cursor-not-allowed disabled:opacity-50";

/*
 * Primary always uses accent-strong (#9A3412) with white text: 7.31:1 contrast,
 * which holds regardless of the surrounding light/dark theme. Hover only
 * darkens (brightness), it never swaps to the brighter accent, so contrast
 * never dips below AA. This keeps orange reserved for the one action that
 * should draw the eye, per the "don't overuse orange" rule.
 */
const variants: Record<ButtonVariant, string> = {
  primary: "bg-accent-strong text-white hover:brightness-90 disabled:hover:brightness-100",
  secondary:
    "border-2 border-foreground bg-transparent text-foreground hover:bg-foreground hover:text-background",
};

export default function Button({ variant = "primary", className = "", ...props }: ButtonProps) {
  return <button className={`${base} ${variants[variant]} ${className}`} {...props} />;
}
