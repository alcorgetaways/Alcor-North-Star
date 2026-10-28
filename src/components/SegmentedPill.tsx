import { useLayoutEffect, useRef, useState } from "react";
import { Link } from "@tanstack/react-router";
import { cn } from "@/lib/utils";

export type PillItem = {
  value: string;
  label: string;
  count?: number;
  /** When set, the pill navigates with a router Link (no full reload). */
  to?: string;
  search?: Record<string, unknown>;
};

/** Sliding-pill toggle / tabs with optional counts. */
export function SegmentedPill({
  items,
  value,
  onChange,
  ariaLabel,
  className,
}: {
  items: PillItem[];
  value: string;
  onChange?: (value: string) => void;
  ariaLabel: string;
  className?: string;
}) {
  const wrap = useRef<HTMLDivElement>(null);
  const [box, setBox] = useState<{ left: number; width: number } | null>(null);

  useLayoutEffect(() => {
    const el = wrap.current?.querySelector<HTMLElement>(`[data-value="${CSS.escape(value)}"]`);
    if (el) setBox({ left: el.offsetLeft, width: el.offsetWidth });
  }, [value, items]);

  return (
    <div className={cn("max-w-full overflow-x-auto", className)}>
      <div ref={wrap} role="tablist" aria-label={ariaLabel} className="relative inline-flex rounded-full border border-border bg-muted p-1">
        {box ? (
          <span
            aria-hidden="true"
            className="absolute inset-y-1 rounded-full bg-card shadow-sm transition-[left,width] duration-[var(--motion-base)] ease-[var(--ease-spring)]"
            style={{ left: box.left, width: box.width }}
          />
        ) : null}
        {items.map((it) => {
          const active = it.value === value;
          const inner = (
            <>
              {it.label}
              {it.count != null ? (
                <span className={cn("ml-1.5 rounded-full px-1.5 text-label tabular-nums", active ? "bg-gold/20 text-foreground" : "bg-background/60")}>
                  {it.count}
                </span>
              ) : null}
            </>
          );
          const cls = cn(
            "relative z-10 whitespace-nowrap rounded-full px-3.5 py-1.5 text-[0.8125rem] leading-[1.125rem] font-medium transition-colors duration-[var(--motion-fast)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-ring",
            active ? "text-foreground" : "text-muted-foreground hover:text-foreground",
          );
          return it.to ? (
            <Link key={it.value} to={it.to as never} search={it.search as never} role="tab" aria-selected={active} data-value={it.value} className={cls}>
              {inner}
            </Link>
          ) : (
            <button key={it.value} type="button" role="tab" aria-selected={active} data-value={it.value} className={cls} onClick={() => onChange?.(it.value)}>
              {inner}
            </button>
          );
        })}
      </div>
    </div>
  );
}
