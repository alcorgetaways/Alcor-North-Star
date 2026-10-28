import { Skeleton } from "@/components/ui/skeleton";

/** Page-level loading placeholder: header line + a row of cards + a block. */
export function PageSkeleton({ label = "Loading" }: { label?: string }) {
  return (
    <div className="space-y-6" aria-busy="true" aria-label={label}>
      <Skeleton className="h-8 w-56" />
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <Skeleton key={i} className="h-28 rounded-xl" />
        ))}
      </div>
      <Skeleton className="h-64 rounded-xl" />
    </div>
  );
}

export function CardSkeleton({ className = "h-28" }: { className?: string }) {
  return <Skeleton className={`${className} rounded-xl`} aria-hidden="true" />;
}

/** Visible error line for a failed query. */
export function QueryError({ error, what }: { error: unknown; what: string }) {
  if (!error) return null;
  return (
    <p role="alert" className="rounded-lg border border-destructive/30 bg-destructive/5 px-4 py-3 text-small text-destructive">
      Could not load {what}: {error instanceof Error ? error.message : String((error as { message?: string })?.message ?? error)}
    </p>
  );
}
