import type { ElementType, HTMLAttributes } from "react";

interface CardProps extends HTMLAttributes<HTMLElement> {
  as?: ElementType;
}

export default function Card({ as: Component = "div", className = "", ...props }: CardProps) {
  return (
    <Component
      className={`rounded-lg border border-muted/30 bg-background p-6 ${className}`}
      {...props}
    />
  );
}
