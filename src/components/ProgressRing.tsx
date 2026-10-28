import { cn } from "@/lib/utils";

/** Pure maths for the ring so it can be tested without rendering. */
export function ringGeometry(value: number | null | undefined, goal = 100) {
  if (value == null || !Number.isFinite(Number(value)) || !goal) {
    return { pct: null as number | null, ratio: 0, complete: false, text: "—" };
  }
  const pct = Math.round((Number(value) / goal) * 100);
  const ratio = Math.max(0, Math.min(1, Number(value) / goal));
  return { pct, ratio, complete: pct >= 100, text: `${pct}%` };
}

/**
 * Value vs goal ring. Track = muted, arc = gold, success once ≥100%.
 * The arc draws once on mount (disabled with reduced motion).
 */
export function ProgressRing({
  value,
  goal = 100,
  caption,
  size = "small",
  label,
  className,
}: {
  value: number | null | undefined;
  goal?: number;
  /** ≤5 words, shown under the % in the large ring. */
  caption?: string;
  size?: "small" | "medium" | "large";
  /** Accessible description, e.g. "of yearly goal". */
  label?: string;
  className?: string;
}) {
  const g = ringGeometry(value, goal);
  const px = size === "large" ? 160 : size === "medium" ? 88 : 40;
  const stroke = size === "large" ? 12 : size === "medium" ? 8 : 4;
  const r = (px - stroke) / 2;
  const circ = 2 * Math.PI * r;
  const offset = circ * (1 - g.ratio);
  const aria = g.pct == null ? `No value yet${label ? ` ${label}` : ""}` : `${g.pct}% ${label ?? "of goal"}`;
  return (
    <div
      role="img"
      aria-label={aria}
      className={cn("relative inline-flex shrink-0 items-center justify-center", className)}
      style={{ width: px, height: px }}
    >
      <svg width={px} height={px} viewBox={`0 0 ${px} ${px}`} className="-rotate-90" aria-hidden="true">
        <circle cx={px / 2} cy={px / 2} r={r} fill="none" stroke="var(--muted)" strokeWidth={stroke} />
        {g.pct != null && g.ratio > 0 ? (
          <circle
            cx={px / 2}
            cy={px / 2}
            r={r}
            fill="none"
            stroke={g.complete ? "var(--success)" : "var(--gold)"}
            strokeWidth={stroke}
            strokeLinecap="round"
            strokeDasharray={circ}
            strokeDashoffset={offset}
            className="motion-ring"
            style={{ ["--ring-circ" as string]: `${circ}`, ["--ring-offset" as string]: `${offset}` }}
            data-testid="ring-arc"
          />
        ) : null}
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center text-center">
        <span className={cn("font-semibold tabular-nums", size === "large" ? "font-display text-4xl" : size === "medium" ? "font-display text-xl" : "text-[0.5625rem] tracking-tight")}>
          {g.text}
        </span>
        {size === "large" && caption ? <span className="mt-1 max-w-[7.5rem] text-label text-muted-foreground">{caption}</span> : null}
      </div>
    </div>
  );
}
