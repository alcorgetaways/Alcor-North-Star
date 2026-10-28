import { ArrowDownRight, ArrowUpRight, CheckCircle2, FileText, Minus, XCircle } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { monthLabel } from "@/lib/kpi";
import { DataTable } from "@/components/DataTable";
import { EmptyState } from "@/components/EmptyState";
import {
  GBP_METRICS,
  changePct,
  num,
  reportKindLabel,
  type GbpEntry,
  type GbpReport,
} from "@/lib/gbp";

function Delta({ current, previous }: { current: number | null | undefined; previous: number | null | undefined }) {
  const cur = current == null ? null : current;
  const prev = previous == null ? null : previous;
  const change = changePct(cur, prev);
  if (change === null) return <span className="text-xs text-muted-foreground">—</span>;
  const up = change > 0.05;
  const down = change < -0.05;
  const Icon = up ? ArrowUpRight : down ? ArrowDownRight : Minus;
  const tone = up ? "text-success" : down ? "text-destructive" : "text-muted-foreground";
  return (
    <span className={`inline-flex items-center gap-0.5 text-xs ${tone}`}>
      <Icon className="h-3 w-3" />
      {Math.abs(change).toFixed(1)}%
    </span>
  );
}

async function openFile(path: string) {
  const { data, error } = await supabase.storage.from("client-files").createSignedUrl(path, 60);
  if (error || !data) {
    toast.error(error?.message ?? "Could not open the file");
    return;
  }
  window.open(data.signedUrl, "_blank", "noopener");
}

type Props = {
  title?: string;
  description?: string;
  entries: GbpEntry[];
  reports?: GbpReport[];
  limit?: number;
};

/**
 * Google Business Profile monthly KPIs with month-on-month change and the
 * NAP / yearly growth report library.
 */
export function GbpKpiSection({
  title = "Google Business Profile performance",
  description = "Monthly GBP delivery and engagement with month-on-month change.",
  entries,
  reports = [],
  limit = 12,
}: Props) {
  const sortedAll = [...entries].sort((a, b) => b.month.localeCompare(a.month));
  const rows = sortedAll.slice(0, limit);
  // Interactions = calls + website clicks + direction requests when not entered directly.
  const val = (r: GbpEntry | null, key: string): number | null => {
    if (!r) return null;
    const e = r as unknown as Record<string, number | null | undefined>;
    if (key === "profile_interactions" && !e[key]) {
      const parts = [e['calls'], e['website_clicks'], e['direction_requests']].filter((v): v is number => v != null);
      return parts.length ? parts.reduce((a, b) => a + b, 0) : (e[key] ?? null);
    }
    if (key === "five_star_added") {
      const i = sortedAll.indexOf(r);
      const prevRow = sortedAll[i + 1] as unknown as Record<string, number | null> | undefined;
      const prevMonth = new Date(Date.UTC(Number(r.month.slice(0, 4)), Number(r.month.slice(5, 7)) - 2, 1)).toISOString().slice(0, 10);
      if (!prevRow || sortedAll[i + 1]!.month !== prevMonth || e['five_star_reviews'] == null || prevRow['five_star_reviews'] == null) return null;
      return Math.max(0, Number(e['five_star_reviews']) - Number(prevRow['five_star_reviews']));
    }
    return e[key] ?? null;
  };
  const METRICS: Array<{ key: string; label: string; noDelta?: boolean }> = GBP_METRICS.flatMap((m) =>
    m.key === "five_star_reviews" ? [{ key: m.key, label: m.label, noDelta: true }, { key: "five_star_added", label: "5-star added this month" }] : [{ key: m.key, label: m.label }],
  );
  const latest = rows[0] ?? null;
  const prev = rows[1] ?? null;

  return (
    <section className="card-surface">
      <div className="border-b border-border/70 px-5 py-4">
        <h2 className="text-section-title font-semibold">{title}</h2>
        <p className="text-xs text-muted-foreground">{description}</p>
      </div>

      {!latest ? (
        <EmptyState title="No Google Business Profile numbers logged yet." />
      ) : (
        <>
          <div className="flex flex-wrap items-center justify-between gap-2 bg-muted/30 px-5 py-3">
            <h3 className="text-card-title font-semibold">Latest month · {monthLabel(latest.month)}{latest.status && latest.status !== "approved" ? " (not yet approved)" : ""}</h3>
          </div>
          <div className="grid gap-4 px-5 py-4 sm:grid-cols-3 lg:grid-cols-4">
            {METRICS.map((m) => (
              <div key={m.key}>
                <p className="text-label-muted">{m.label}</p>
                <p className="text-card-title font-semibold">{num(val(latest, m.key))}</p>
                {m.noDelta ? null : <Delta current={val(latest, m.key)} previous={val(prev, m.key)} />}
              </div>
            ))}
          </div>

          <div className="border-t border-border/70">
            <DataTable<GbpEntry>
              className="rounded-none border-0 bg-transparent shadow-none"
              rows={rows}
              rowKey={(r) => r.id ?? r.month}
              columns={[
                { key: "month", header: "Month", render: (r) => (
                  <span>
                    {monthLabel(r.month)}
                    {r.status && r.status !== "approved" ? <span className="block text-xs text-warning">Not yet approved</span> : null}
                  </span>
                ) },
                ...METRICS.map((m) => ({
                  key: m.key,
                  header: m.label,
                  align: "right" as const,
                  render: (r: GbpEntry) => {
                    const i = rows.indexOf(r);
                    const before = rows[i + 1] ?? null;
                    return (
                      <span className="inline-flex items-center justify-end gap-2">
                        <span className="tabular-nums">{num(val(r, m.key))}</span>
                        {m.noDelta ? null : <Delta current={val(r, m.key)} previous={val(before, m.key)} />}
                      </span>
                    );
                  },
                })),
              ]}
            />
          </div>
        </>
      )}

      {reports.length ? (
        <div className="border-t border-border/70 px-5 py-4">
          <p className="text-label-muted">
            NAP &amp; yearly growth reports
          </p>
          <ul className="mt-3 space-y-2">
            {reports.map((r) => (
              <li
                key={r.id}
                className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-border/70 px-4 py-3"
              >
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium">
                    {r.title}
                    {r.clients?.hotel_name ? (
                      <span className="text-muted-foreground"> · {r.clients.hotel_name}</span>
                    ) : null}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {reportKindLabel(r.kind)}
                    {r.month ? ` · ${monthLabel(r.month)}` : ""}
                    {r.notes ? ` · ${r.notes}` : ""}
                  </p>
                </div>
                {r.file_path ? (
                  <button
                    type="button"
                    onClick={() => void openFile(r.file_path!)}
                    className="inline-flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground"
                  >
                    <FileText className="h-3.5 w-3.5" /> Open
                  </button>
                ) : null}
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </section>
  );
}
