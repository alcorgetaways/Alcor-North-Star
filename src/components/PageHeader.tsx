import { Link } from "@tanstack/react-router";
import { ChevronRight } from "lucide-react";
import type { ReactNode } from "react";

export type BreadcrumbItem = { label: string; to?: string };

/**
 * Standard page header: optional breadcrumb, Fraunces page title (28/34),
 * one-line muted description, actions on the right (one primary, the rest
 * secondary/ghost), optional tabs underneath.
 */
export function PageHeader({
  title,
  description,
  actions,
  breadcrumb,
  tabs,
}: {
  title: string;
  description?: string | undefined;
  actions?: ReactNode | undefined;
  breadcrumb?: BreadcrumbItem[] | undefined;
  tabs?: ReactNode | undefined;
}) {
  return (
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
          <h1 className="font-display text-page-title font-semibold text-foreground">{title}</h1>
          {description ? (
            <p className="mt-1 max-w-2xl text-small text-muted-foreground">{description}</p>
          ) : null}
        </div>
        {actions ? <div className="flex flex-wrap items-center gap-2">{actions}</div> : null}
      </div>
      {tabs ? <div className="-mb-5 mt-4">{tabs}</div> : null}
    </div>
  );
}

/**
 * Underline tabs for use in PageHeader's `tabs` slot. Active tab gets a gold
 * underline; inactive tabs are muted.
 */
export function HeaderTabs({
  tabs,
  value,
  onChange,
}: {
  tabs: Array<{ value: string; label: string }>;
  value: string;
  onChange: (value: string) => void;
}) {
  return (
    <div className="flex gap-1 overflow-x-auto" role="tablist">
      {tabs.map((t) => (
        <button
          key={t.value}
          role="tab"
          aria-selected={value === t.value}
          onClick={() => onChange(t.value)}
          className={
            value === t.value
              ? "border-b-2 border-gold px-3 pb-2 text-small font-medium text-foreground"
              : "border-b-2 border-transparent px-3 pb-2 text-small text-muted-foreground hover:text-foreground"
          }
        >
          {t.label}
        </button>
      ))}
    </div>
  );
}
