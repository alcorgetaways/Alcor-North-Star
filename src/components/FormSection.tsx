import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

/**
 * Standard form section: card with a 16/24 semibold title, one-line muted
 * description and a one-column, labels-above field stack. Helper text and
 * inline validation use text-label text-muted-foreground / text-destructive.
 */
export function FormSection({
  title,
  description,
  children,
  className,
}: {
  title?: string;
  description?: string;
  children: ReactNode;
  className?: string;
}) {
  return (
    <section className={cn("card-surface p-5", className)}>
      {title ? <h2 className="text-section-title font-semibold text-foreground">{title}</h2> : null}
      {description ? <p className="mt-1 text-small text-muted-foreground">{description}</p> : null}
      <div className={cn("grid grid-cols-1 gap-4", (title || description) && "mt-4")}>{children}</div>
    </section>
  );
}
