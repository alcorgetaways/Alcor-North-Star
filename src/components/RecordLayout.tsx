import { Link } from "@tanstack/react-router";
import { ChevronDown, ChevronRight } from "lucide-react";
import { useState, type ReactNode } from "react";
import { cn } from "@/lib/utils";
import type { BreadcrumbItem } from "@/components/PageHeader";

export type PropertyGroup = {
  title: string;
  rows: Array<{ label: string; value: ReactNode }>;
};

/**
 * Record page layout (client, launch, staff): Fraunces name header with code
 * chip / status badge / muted meta and actions, tabs underneath, main content
 * on the left and a 320px properties panel with collapsible label–value groups
 * on the right. Stacks to one column below lg.
 */
export function RecordLayout({
  breadcrumb,
  title,
  meta,
  badges,
  actions,
  tabs,
  properties,
  children,
}: {
  breadcrumb?: BreadcrumbItem[];
  /** Record name (hotel / person) — rendered in Fraunces. */
  title: ReactNode;
  /** Muted line under the name: property type, location, etc. */
  meta?: ReactNode;
  /** StatusBadge / chips rendered next to the name. */
  badges?: ReactNode;
  actions?: ReactNode;
  tabs?: ReactNode;
  properties?: PropertyGroup[];
  children: ReactNode;
}) {
  return (
    <div className="space-y-6">
      <div className="border-b border-border/70 pb-5">
        {breadcrumb && breadcrumb.length > 0 ? (
          <nav aria-label="Breadcrumb" className="mb-2 flex items-center gap-1 text-label text-muted-foreground">
            {breadcrumb.map((item, i) => (
              <span key={`${item.label}-${i}`} className="flex items-center gap-1">
                {i > 0 ? <ChevronRight className="h-3 w-3 opacity-60" aria-hidden="true" /> : null}
                {item.to ? (
                  <Link to={item.to} className="hover:text-foreground hover:underline">
                    {item.label}
                  </Link>
                ) : (
                  <span className={i === breadcrumb.length - 1 ? "text-foreground" : undefined}>{item.label}</span>
                )}
              </span>
            ))}
          </nav>
        ) : null}
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
              <h1 className="font-display text-page-title font-semibold text-foreground">{title}</h1>
              {badges}
            </div>
            {meta ? <p className="mt-1 text-small text-muted-foreground">{meta}</p> : null}
          </div>
          {actions ? <div className="flex flex-wrap items-center gap-2">{actions}</div> : null}
        </div>
        {tabs ? <div className="-mb-5 mt-4">{tabs}</div> : null}
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-[minmax(0,1fr)_320px]">
        <div className="min-w-0 space-y-6">{children}</div>
        {properties && properties.length > 0 ? (
          <aside className="space-y-4 lg:sticky lg:top-20 lg:self-start">
            {properties.map((group) => (
              <PropertyPanel key={group.title} group={group} />
            ))}
          </aside>
        ) : null}
      </div>
    </div>
  );
}

function PropertyPanel({ group }: { group: PropertyGroup }) {
  const [open, setOpen] = useState(true);
  return (
    <div className="card-surface overflow-hidden">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        className="flex w-full items-center justify-between px-4 py-3 text-left"
      >
        <span className="text-card-title font-medium text-foreground">{group.title}</span>
        <ChevronDown className={cn("h-4 w-4 text-muted-foreground transition-transform", !open && "-rotate-90")} />
      </button>
      {open ? (
        <dl className="divide-y divide-border/60 border-t border-border/70">
          {group.rows.map((row, i) => (
            <div key={`${row.label}-${i}`} className="flex items-baseline justify-between gap-3 px-4 py-2.5">
              <dt className="text-label-muted shrink-0">{row.label}</dt>
              <dd className="text-small text-right text-foreground">{row.value}</dd>
            </div>
          ))}
        </dl>
      ) : null}
    </div>
  );
}
