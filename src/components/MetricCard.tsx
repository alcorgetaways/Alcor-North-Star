import { useEffect, useRef, useState, type ReactNode } from "react";
import { Info } from "lucide-react";
import { cn } from "@/lib/utils";
import { int, type MissingReason } from "@/lib/format";
import { useReducedMotion } from "@/hooks/use-reduced-motion";
import { MissingValue } from "@/components/MissingValue";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";

/** Cards that have already counted up this browser session. */
const seen = new Set<string>();
const SESSION_KEY = "ns-metric-seen";

function hasSeen(id: string): boolean {
  if (seen.has(id)) return true;
  try {
    const list = JSON.parse(sessionStorage.getItem(SESSION_KEY) ?? "[]") as string[];
    return list.includes(id);
  } catch {
    return false;
  }
}
function markSeen(id: string) {
  seen.add(id);
  try {
    sessionStorage.setItem(SESSION_KEY, JSON.stringify(Array.from(seen)));
  } catch {
    /* storage unavailable — in-memory set still applies */
  }
}

/** Count up only on the first mount per session and never with reduced motion. */
export function shouldCountUp(id: string | undefined, reduced: boolean, alreadySeen: boolean): boolean {
  return Boolean(id) && !reduced && !alreadySeen;
}

/** Spring-ish ease-out used for the count-up. */
export const easeOut = (t: number) => 1 - Math.pow(1 - t, 3);

export type MetricDelta = { pct: number | null; vs: string; invert?: boolean; suffix?: string };

export function MetricCard({
  id,
  label,
  value,
  format = int,
  missing = "no_data",
  delta,
  sparkline,
  info,
  hero = false,
  tone = "default",
  footer,
  className,
}: {
  /** Stable id used to count up once per session. Omit to never animate. */
  id?: string;
  label: string;
  value: number | null | undefined;
  format?: (n: number) => string;
  missing?: MissingReason | string;
  delta?: MetricDelta | undefined;
  sparkline?: Array<number | null> | undefined;
  info?: ReactNode;
  hero?: boolean;
  tone?: "default" | "gold" | "success" | "danger";
  footer?: ReactNode;
  className?: string;
}) {
  const reduced = useReducedMotion();
  const has = value != null && Number.isFinite(Number(value));
  const target = has ? Number(value) : 0;
  const [shown, setShown] = useState<number>(target);
  const raf = useRef<number | null>(null);

  useEffect(() => {
    if (!has) return;
    if (!id || !shouldCountUp(id, reduced, hasSeen(id))) {
      setShown(target);
      return;
    }
    markSeen(id);
    const start = performance.now();
    const dur = 700;
    const tick = (now: number) => {
      const t = Math.min(1, (now - start) / dur);
      setShown(target * easeOut(t));
      if (t < 1) raf.current = requestAnimationFrame(tick);
    };
    setShown(0);
    raf.current = requestAnimationFrame(tick);
    return () => {
      if (raf.current) cancelAnimationFrame(raf.current);
    };
  }, [id, target, has, reduced]);

  const toneClass = { default: "text-foreground", gold: "text-gold", success: "text-success", danger: "text-destructive" }[tone];
  const up = delta?.pct != null && delta.pct > 0;
  const down = delta?.pct != null && delta.pct < 0;
  const good = delta?.invert ? down : up;
  const bad = delta?.invert ? up : down;

  return (
    <div className={cn("card-surface flex flex-col p-5", className)}>
      <div className="flex items-start justify-between gap-2">
        <p className="text-label-muted">{label}</p>
        {info ? (
          <TooltipProvider delayDuration={150}>
            <Tooltip>
              <TooltipTrigger asChild>
                <button type="button" aria-label={`About ${label}`} className="text-muted-foreground hover:text-foreground">
                  <Info className="h-3.5 w-3.5" />
                </button>
              </TooltipTrigger>
              <TooltipContent className="max-w-xs">{info}</TooltipContent>
            </Tooltip>
          </TooltipProvider>
        ) : null}
      </div>
      <div className="mt-3 flex flex-wrap items-baseline gap-2">
        <p
          className={cn("font-semibold tabular-nums leading-none", hero ? "font-display text-5xl" : "text-[1.75rem]", toneClass)}
          data-testid="metric-value"
        >
          {has ? format(shown === target ? target : Math.round(shown)) : <MissingValue reason={missing} />}
        </p>
        {delta ? (
          delta.pct == null ? (
            <span className="text-label text-muted-foreground">No change data vs {delta.vs}</span>
          ) : (
            <span
              className={cn(
                "inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-label font-medium",
                good ? "bg-success/12 text-success" : bad ? "bg-destructive/12 text-destructive" : "bg-muted text-muted-foreground",
              )}
            >
              {up ? "↑" : down ? "↓" : "→"} {Math.abs(delta.pct).toFixed(Math.abs(delta.pct) < 10 ? 1 : 0).replace(/\.0$/, "")}
              {delta.suffix ?? "%"}
              <span className="font-normal opacity-80">vs {delta.vs}</span>
            </span>
          )
        ) : null}
      </div>
      {sparkline && sparkline.some((v) => v != null) ? <Sparkline values={sparkline} /> : null}
      {footer ? <div className="mt-2 text-label text-muted-foreground">{footer}</div> : null}
    </div>
  );
}

export function Sparkline({ values }: { values: Array<number | null> }) {
  const nums = values.filter((v): v is number => v != null);
  const min = Math.min(...nums);
  const max = Math.max(...nums);
  const w = 120;
  const h = 28;
  const step = values.length > 1 ? w / (values.length - 1) : w;
  let d = "";
  values.forEach((v, i) => {
    if (v == null) return;
    const y = max === min ? h / 2 : h - ((v - min) / (max - min)) * h;
    d += `${d && values[i - 1] != null ? "L" : "M"}${(i * step).toFixed(1)},${y.toFixed(1)}`;
  });
  return (
    <svg viewBox={`0 0 ${w} ${h}`} className="mt-3 h-7 w-full text-gold" preserveAspectRatio="none" aria-hidden="true">
      <path d={d} fill="none" stroke="currentColor" strokeWidth={1.75} vectorEffect="non-scaling-stroke" />
    </svg>
  );
}

export function MetricGrid({ children, className }: { children: ReactNode; className?: string }) {
  return <div className={cn("grid grid-cols-2 gap-4 lg:grid-cols-4", className)}>{children}</div>;
}
