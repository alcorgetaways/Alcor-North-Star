import { ChevronLeft, ChevronRight } from "lucide-react";
import { Fragment, type ReactNode } from "react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";

export type DataTableColumn<T> = {
  key: string;
  header: ReactNode;
  render: (row: T) => ReactNode;
  /** Right-align (numbers and currency use tabular figures). */
  align?: "left" | "right";
  className?: string;
  headerClassName?: string;
};

/**
 * One table for the whole app: sticky header, 13px text, no zebra, row hover,
 * right-aligned numbers, loading skeleton, empty state and a pagination footer.
 * Wraps in a white card; tables scroll horizontally inside the card on mobile.
 */
export function DataTable<T>({
  columns,
  rows,
  rowKey,
  loading = false,
  emptyMessage = "Nothing to show yet.",
  emptyHint,
  toolbar,
  page,
  pageSize = 20,
  total,
  onPageChange,
  onRowClick,
  expandedContent,
  className,
}: {
  columns: Array<DataTableColumn<T>>;
  rows: T[];
  rowKey: (row: T, index: number) => string;
  loading?: boolean;
  emptyMessage?: string;
  emptyHint?: string;
  /** Search / filter chips / column toggle / export rendered above the table. */
  toolbar?: ReactNode;
  /** 1-based page. Pass page + total + onPageChange to show the footer. */
  page?: number;
  pageSize?: number;
  total?: number;
  onPageChange?: (page: number) => void;
  onRowClick?: (row: T) => void;
  /** Return extra content rendered as a full-width row beneath a row, or null. */
  expandedContent?: (row: T) => ReactNode;
  className?: string;
}) {
  const showFooter = page !== undefined && total !== undefined && onPageChange;
  const from = total === 0 ? 0 : (page ?? 1) * pageSize - pageSize + 1;
  const to = Math.min((page ?? 1) * pageSize, total ?? 0);
  const pages = Math.max(1, Math.ceil((total ?? 0) / pageSize));

  return (
    <div className={cn("card-surface min-w-0 max-w-full overflow-hidden", className)}>
      {toolbar ? <div className="flex flex-wrap items-center gap-2 border-b border-border/70 px-4 py-3">{toolbar}</div> : null}
      <div className="overflow-x-auto" style={{ contain: "paint" }}>
        <table className="w-full text-small">
          <thead className="sticky top-0 z-10 bg-muted/60 text-left text-label font-medium text-muted-foreground">
            <tr>
              {columns.map((c) => (
                <th
                  key={c.key}
                  className={cn(
                    "px-4 py-3 font-medium whitespace-nowrap",
                    c.align === "right" && "text-right",
                    c.headerClassName,
                  )}
                >
                  {c.header}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-border/70">
            {loading ? (
              Array.from({ length: 5 }).map((_, i) => (
                <tr key={`skel-${i}`}>
                  {columns.map((c) => (
                    <td key={c.key} className="px-4 py-3">
                      <Skeleton className="h-4 w-3/4" />
                    </td>
                  ))}
                </tr>
              ))
            ) : rows.length === 0 ? (
              <tr>
                <td colSpan={columns.length} className="px-4 py-12 text-center">
                  <p className="text-body text-muted-foreground">{emptyMessage}</p>
                  {emptyHint ? <p className="mt-1 text-label text-muted-foreground">{emptyHint}</p> : null}
                </td>
              </tr>
            ) : (
              rows.map((row, i) => {
                const expanded = expandedContent?.(row);
                return (
                  <Fragment key={rowKey(row, i)}>
                    <tr
                      className={cn("transition-colors hover:bg-muted/40", onRowClick && "cursor-pointer")}
                      onClick={onRowClick ? () => onRowClick(row) : undefined}
                    >
                      {columns.map((c) => (
                        <td
                          key={c.key}
                          className={cn(
                            "px-4 py-3 align-middle",
                            c.align === "right" && "text-right tabular-nums",
                            c.className,
                          )}
                        >
                          {c.render(row)}
                        </td>
                      ))}
                    </tr>
                    {expanded ? (
                      <tr className="bg-muted/30">
                        <td colSpan={columns.length} className="px-4 py-4">
                          {expanded}
                        </td>
                      </tr>
                    ) : null}
                  </Fragment>
                );
              })
            )}
          </tbody>
        </table>
      </div>
      {showFooter ? (
        <div className="flex items-center justify-between border-t border-border/70 px-4 py-2.5 text-label text-muted-foreground">
          <span className="tabular-nums">
            {from}–{to} of {total}
          </span>
          <div className="flex items-center gap-1">
            <Button
              variant="ghost"
              size="icon"
              className="h-7 w-7"
              disabled={(page ?? 1) <= 1}
              onClick={() => onPageChange((page ?? 1) - 1)}
              aria-label="Previous page"
            >
              <ChevronLeft className="h-4 w-4" />
            </Button>
            <Button
              variant="ghost"
              size="icon"
              className="h-7 w-7"
              disabled={(page ?? 1) >= pages}
              onClick={() => onPageChange((page ?? 1) + 1)}
              aria-label="Next page"
            >
              <ChevronRight className="h-4 w-4" />
            </Button>
          </div>
        </div>
      ) : null}
    </div>
  );
}
