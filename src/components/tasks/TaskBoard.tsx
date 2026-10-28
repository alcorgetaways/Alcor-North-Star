import type { ReactNode } from "react";
import { CalendarDays, Lock } from "lucide-react";
import { cn } from "@/lib/utils";
import { initials, taskProgress } from "@/lib/task-board";

/** Column header tones — semantic tokens only. */
export const COLUMN_TONE = {
  danger: "bg-destructive text-destructive-foreground",
  warning: "bg-warning text-warning-foreground",
  success: "bg-success text-success-foreground",
  navy: "bg-primary text-primary-foreground",
  muted: "bg-muted-foreground/70 text-background",
  gold: "bg-gold text-gold-foreground",
} as const;
export type ColumnTone = keyof typeof COLUMN_TONE;

const BAR_TONE = (status: string, overdue: boolean) =>
  overdue ? "bg-destructive" : taskProgress(status) >= 100 ? "bg-success" : status === "waiting_client" ? "bg-warning" : "bg-primary";

export function ProgressBar({ status, overdue = false }: { status: string; overdue?: boolean }) {
  const p = taskProgress(status);
  return (
    <div className="flex items-center gap-2">
      <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-muted" role="progressbar" aria-valuenow={p} aria-valuemin={0} aria-valuemax={100} aria-label="Task progress">
        <div className={cn("h-full rounded-full transition-[width] duration-[var(--motion-base)]", BAR_TONE(status, overdue))} style={{ width: `${p}%` }} />
      </div>
      <span className="w-9 text-right text-[0.6875rem] tabular-nums text-muted-foreground">{p}%</span>
    </div>
  );
}

export function Initials({ name }: { name: string | null | undefined }) {
  return (
    <span title={name ?? "Unassigned"} aria-label={name ?? "Unassigned"} className="inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-primary text-[0.625rem] font-semibold text-primary-foreground">
      {initials(name)}
    </span>
  );
}

export function TaskCard({
  code,
  title,
  subtitle,
  due,
  status,
  overdue = false,
  locked = false,
  owner,
  chips,
  onOpen,
  footer,
}: {
  code?: string | null;
  title: string;
  subtitle?: string | null | undefined;
  due?: string | null;
  status: string;
  overdue?: boolean;
  locked?: boolean;
  owner?: string | null;
  chips?: ReactNode;
  onOpen?: () => void;
  footer?: ReactNode;
}) {
  return (
    <article className={cn("rounded-lg border bg-card p-3 shadow-sm transition-colors duration-[var(--motion-fast)]", overdue ? "border-destructive/50" : "border-border/70", onOpen && "hover:border-gold/60")}>
      <button type="button" onClick={onOpen} disabled={!onOpen} className="block w-full text-left disabled:cursor-default">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            {code ? <p className="text-label text-muted-foreground">{code}</p> : null}
            <p className={cn("line-clamp-2 text-[0.8125rem] font-medium leading-[1.125rem]", overdue && "text-destructive")}>{title}</p>
            {subtitle ? <p className="mt-0.5 truncate text-label text-muted-foreground">{subtitle}</p> : null}
          </div>
          {owner !== undefined ? <Initials name={owner} /> : null}
        </div>
        {chips ? <div className="mt-2 flex flex-wrap gap-1">{chips}</div> : null}
        <div className="mt-2 flex items-center gap-2 text-label text-muted-foreground">
          {due ? (
            <span className="inline-flex items-center gap-1 whitespace-nowrap"><CalendarDays className="h-3 w-3" aria-hidden="true" />{due}</span>
          ) : null}
          {locked ? <span className="inline-flex items-center gap-1 whitespace-nowrap text-warning-foreground"><Lock className="h-3 w-3" aria-hidden="true" />Gate A</span> : null}
        </div>
        <div className="mt-2"><ProgressBar status={status} overdue={overdue} /></div>
      </button>
      {footer ? <div className="mt-2 border-t border-border/60 pt-2">{footer}</div> : null}
    </article>
  );
}

export function BoardColumn({ title, count, tone, children, footer }: { title: string; count: number; tone: ColumnTone; children: ReactNode; footer?: ReactNode }) {
  return (
    <section className="flex w-[17rem] shrink-0 snap-start flex-col rounded-xl border border-border/70 bg-muted/40 md:w-auto md:min-w-0 md:flex-1" aria-label={`${title} (${count})`}>
      <header className={cn("flex items-center justify-between rounded-t-xl px-3 py-2", COLUMN_TONE[tone])}>
        <h3 className="text-[0.8125rem] font-semibold uppercase tracking-wide">{title}</h3>
        <span className="rounded-full bg-background/90 px-2 text-label font-semibold tabular-nums text-foreground">{count}</span>
      </header>
      <div className="flex max-h-[70vh] flex-col gap-2 overflow-y-auto p-2">
        {count === 0 ? <p className="px-1 py-4 text-center text-label text-muted-foreground">Nothing here</p> : children}
      </div>
      {footer ? <div className="border-t border-border/60 p-2">{footer}</div> : null}
    </section>
  );
}

export function Board({ children }: { children: ReactNode }) {
  return <div className="-mx-1 flex items-start snap-x snap-mandatory gap-3 overflow-x-auto px-1 pb-2 md:snap-none">{children}</div>;
}

export function Legend({ items }: { items: Array<{ label: string; tone: ColumnTone }> }) {
  return (
    <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-label text-muted-foreground" aria-label="Legend">
      {items.map((i) => (
        <span key={i.label} className="inline-flex items-center gap-1.5"><span className={cn("h-2.5 w-2.5 rounded-sm", COLUMN_TONE[i.tone])} />{i.label}</span>
      ))}
    </div>
  );
}

export const PRIORITY_CHIP: Record<string, string> = {
  critical: "border-destructive bg-destructive text-destructive-foreground",
  high: "border-destructive/40 bg-destructive/12 text-destructive",
  medium: "border-warning/50 bg-warning/15 text-warning-foreground",
  low: "border-success/40 bg-success/12 text-success",
};

export function Chip({ className, children }: { className?: string | undefined; children: ReactNode }) {
  return <span className={cn("inline-flex items-center rounded-full border px-2 py-0.5 text-[0.6875rem] font-medium", className)}>{children}</span>;
}
