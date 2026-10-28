import { Link } from "@tanstack/react-router";
import { ArrowRight, Bell } from "lucide-react";
import { cn } from "@/lib/utils";

export type AlertItem = { id: string; title: string; body?: string | null; to?: string | null; at?: string | null; unread?: boolean };

/** Stacked alert cards, newest on top, with a count badge; each links to where the action is. */
export function AlertStack({
  title,
  items,
  count,
  max = 3,
  allTo,
  emptyText = "You're all caught up.",
}: {
  title: string;
  items: AlertItem[];
  count?: number;
  max?: number;
  allTo?: string;
  emptyText?: string;
}) {
  const sorted = [...items].sort((a, b) => (b.at ?? "").localeCompare(a.at ?? "")).slice(0, max);
  const badge = count ?? items.filter((i) => i.unread).length;
  return (
    <section className="card-surface flex flex-col p-5">
      <div className="mb-3 flex items-center gap-2">
        <Bell className="h-4 w-4 text-gold" aria-hidden="true" />
        <h2 className="text-card-title font-medium">{title}</h2>
        {badge ? (
          <span className="rounded-full bg-gold px-2 text-label font-semibold text-gold-foreground tabular-nums" aria-label={`${badge} unread`}>
            {badge}
          </span>
        ) : null}
        {allTo ? (
          <Link to={allTo as never} className="ml-auto inline-flex items-center gap-1 text-label text-muted-foreground hover:text-foreground">
            All <ArrowRight className="h-3.5 w-3.5" />
          </Link>
        ) : null}
      </div>
      {sorted.length === 0 ? (
        <p className="text-small text-muted-foreground">{emptyText}</p>
      ) : (
        <ol className="relative space-y-2">
          {sorted.map((a, i) => {
            const body = (
              <>
                <p className={cn("truncate text-[0.8125rem] leading-[1.125rem]", a.unread ? "font-medium" : "text-muted-foreground")}>{a.title}</p>
                {a.body ? <p className="line-clamp-1 text-label text-muted-foreground">{a.body}</p> : null}
              </>
            );
            const cls = cn(
              "block rounded-lg border px-3 py-2 transition-colors duration-[var(--motion-fast)]",
              a.unread ? "border-gold/40 bg-gold/5" : "border-border/70 bg-card",
              a.to && "hover:border-gold/60",
            );
            return (
              <li key={a.id} style={{ marginLeft: i * 4, marginRight: i * 4 }}>
                {a.to ? <Link to={a.to as never} className={cls}>{body}</Link> : <div className={cls}>{body}</div>}
              </li>
            );
          })}
        </ol>
      )}
    </section>
  );
}
