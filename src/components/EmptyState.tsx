import type { LucideIcon } from "lucide-react";
import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

/** Standard empty state: icon, title, one-line description, optional action. */
export function EmptyState({
  icon: Icon,
  title,
  description,
  action,
  className,
}: {
  icon?: LucideIcon;
  title: string;
  description?: string;
  action?: ReactNode;
  className?: string;
}) {
  return (
    <div role="status" className={cn("flex flex-col items-center justify-center px-6 py-12 text-center", className)}>
      {Icon ? <Icon className="h-10 w-10 text-muted-foreground/50" strokeWidth={1.75} aria-hidden="true" /> : null}
      <p className="mt-3 text-card-title font-medium text-foreground">{title}</p>
      {description ? <p className="mt-1 max-w-sm text-small text-muted-foreground">{description}</p> : null}
      {action ? <div className="mt-4">{action}</div> : null}
    </div>
  );
}
