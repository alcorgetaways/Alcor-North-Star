import { useState } from "react";
import { ConfirmButton } from "@/components/ConfirmButton";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { CheckCircle2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { StatusBadge } from "@/components/StatusBadge";
import { EmptyState } from "@/components/EmptyState";
import { monthLabel } from "@/lib/kpi";
import { num } from "@/lib/gbp";
import { alcorPeriod, fetchedRowOpen, FETCHED_QUERY_PREFIXES, FETCHED_STATUS_LABEL } from "@/lib/kpi-review";

export type FetchedRow = {
  id: string;
  month: string;
  status: string;
  fetched_values: Record<string, number | null>;
  corrected_values: Record<string, number | null> | null;
  mapping_id: string | null;
  kpi_source_mappings?: { external_name: string } | null;
};

const LABELS: Record<string, string> = {
  views: "Profile views",
  calls: "Calls",
  website_clicks: "Website clicks",
  direction_requests: "Direction requests",
  profile_interactions: "Interactions",
  five_star_reviews: "5-star reviews (total)",
  views_search: "Views — Search",
  views_maps: "Views — Maps",
  reviews_received: "Reviews (total)",
  rating: "Rating",
  posts: "Posts",
  photos: "Photos",
};
export function fetchedLabel(key: string) {
  if (LABELS[key]) return LABELS[key]!;
  const [platform, metric] = key.split(".");
  const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);
  return metric ? `${cap(platform === "youtube" ? "YouTube" : platform === "linkedin" ? "LinkedIn" : platform!)} ${metric.replaceAll("_", " ")}` : cap(key.replaceAll("_", " "));
}
const ORDER = Object.keys(LABELS);

export function valuesOf(r: FetchedRow) {
  return { ...r.fetched_values, ...(r.corrected_values ?? {}) };
}

/** Last 18 months of fetched source values for one client pipeline (staff only; RLS-scoped). */
export function useFetchedRows(cp: string, source: "localo" | "metricool") {
  return useQuery({
    queryKey: ["fetched-source", cp, source],
    enabled: !!cp,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("kpi_fetched_values")
        .select("id, month, status, fetched_values, corrected_values, mapping_id, kpi_source_mappings(external_name)")
        .eq("client_pipeline_id", cp)
        .eq("source", source)
        .eq("is_partial", false)
        .order("month", { ascending: false })
        .limit(200);
      if (error) throw error;
      return data as unknown as FetchedRow[];
    },
  });
}

/** Sum all listings' values per month (a hotel can have several GBP listings). */
export function sumByMonth(rows: FetchedRow[]) {
  const map = new Map<string, { values: Record<string, number>; statuses: string[] }>();
  for (const r of rows) {
    const cur = map.get(r.month) ?? { values: {}, statuses: [] };
    for (const [k, v] of Object.entries(valuesOf(r))) if (v != null && !k.startsWith("keyword_rank.")) cur.values[k] = (cur.values[k] ?? 0) + Number(v);
    cur.statuses.push(r.status);
    map.set(r.month, cur);
  }
  return map;
}

export function FetchedSourcePanel({
  cp,
  source,
  startDate,
  internal,
}: {
  cp: string;
  source: "localo" | "metricool";
  startDate: string | null | undefined;
  internal: boolean;
}) {
  const { isManager } = useAuth();
  const qc = useQueryClient();
  const [busy, setBusy] = useState<string | null>(null);
  const { data: all = [], isLoading } = useFetchedRows(cp, source);
  const months = Array.from(new Set(all.map((r) => r.month))).slice(0, 18);
  const rows = all.filter((r) => months.includes(r.month));
  const keys = Array.from(new Set(rows.flatMap((r) => Object.keys(valuesOf(r))).filter((k) => !k.startsWith("keyword_rank.")))).sort(
    (a, b) => (ORDER.indexOf(a) + 1 || 99) - (ORDER.indexOf(b) + 1 || 99) || a.localeCompare(b),
  );
  const multi = new Set(rows.map((r) => r.mapping_id)).size > 1;
  const now = new Date();
  const sourceName = source === "localo" ? "Localo" : "Metricool";

  async function act(r: FetchedRow, kind: "review" | "approve"): Promise<boolean> {
    setBusy(r.id);
    try {
      const { error } =
        kind === "approve"
          ? await supabase.rpc("approve_fetched_kpis", { _id: r.id })
          : await supabase.rpc("review_fetched_kpis", { _id: r.id, _values: valuesOf(r), _confirm: true });
      if (error) throw error;
      toast.success(kind === "approve" ? "Approved" : "Marked reviewed");
      for (const k of FETCHED_QUERY_PREFIXES) void qc.invalidateQueries({ queryKey: [...k] });
      return true;
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Update failed");
      return false;
    } finally {
      setBusy(null);
    }
  }

  return (
    <section className="card-surface">
      <div className="border-b border-border/70 px-5 py-4">
        <h2 className="text-section-title font-semibold">Fetched from {sourceName}</h2>
        <p className="text-xs text-muted-foreground">
          Last 18 months pulled automatically. Mark each month reviewed (last month only on the 1st–3rd; earlier months any time), then Management approves. The hotel sees only approved months.
        </p>
      </div>
      {isLoading ? (
        <p className="px-5 py-4 text-sm text-muted-foreground">Loading…</p>
      ) : rows.length === 0 ? (
        <EmptyState title={`No ${sourceName} data fetched for this hotel yet.`} />
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-muted/30 text-left text-xs text-muted-foreground">
              <tr>
                <th className="px-3 py-2">Month</th>
                {multi ? <th className="px-3 py-2">Profile</th> : null}
                <th className="px-3 py-2">Period</th>
                {keys.map((k) => (
                  <th key={k} className="px-3 py-2 text-right">{fetchedLabel(k)}</th>
                ))}
                <th className="px-3 py-2">Status</th>
                <th className="px-3 py-2" />
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => {
                const v = valuesOf(r);
                const period = alcorPeriod(r.month, startDate, internal);
                const reviewable = r.status === "fetched" && fetchedRowOpen(r as { month: string; is_partial?: boolean | null }, now);
                return (
                  <tr key={r.id} className="border-t border-border/60">
                    <td className="whitespace-nowrap px-3 py-2 font-medium">{monthLabel(r.month)}</td>
                    {multi ? <td className="px-3 py-2 text-xs">{r.kpi_source_mappings?.external_name ?? "—"}</td> : null}
                    <td className="whitespace-nowrap px-3 py-2 text-xs">
                      {period === "Before Alcor" ? <span className="font-medium text-warning">Before Alcor</span> : period ?? "—"}
                    </td>
                    {keys.map((k) => {
                      const corrected = r.corrected_values?.[k] != null && r.corrected_values[k] !== r.fetched_values[k];
                      return (
                        <td key={k} className="px-3 py-2 text-right tabular-nums" title={corrected ? `Fetched: ${num(r.fetched_values[k])}` : undefined}>
                          {num(v[k])}
                          {corrected ? <span className="text-xs text-muted-foreground"> *</span> : null}
                        </td>
                      );
                    })}
                    <td className="px-3 py-2">
                      <StatusBadge status={r.status === "approved" ? "approved" : r.status === "confirmed" ? "submitted" : "pending"} label={FETCHED_STATUS_LABEL[r.status] ?? r.status} />
                    </td>
                    <td className="whitespace-nowrap px-3 py-2 text-right">
                      {!isManager && r.status === "fetched" ? (
                        <ConfirmButton size="sm" variant="outline" doneLabel="Reviewed" disabled={!reviewable || busy === r.id} title={reviewable ? undefined : "Last month opens 1st–3rd; the running month after it ends"} onConfirm={() => act(r, "review")}>
                          Mark reviewed
                        </ConfirmButton>
                      ) : null}
                      {isManager && r.status === "confirmed" ? (
                        <ConfirmButton size="sm" doneLabel="Approved" disabled={busy === r.id} onConfirm={() => act(r, "approve")}>
                          <CheckCircle2 className="mr-1 h-3.5 w-3.5" /> Approve
                        </ConfirmButton>
                      ) : null}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          <p className="px-5 py-2 text-xs text-muted-foreground">* corrected by the team — hover to see the fetched value. "Before Alcor" months are context only and never count toward targets or scorecards.</p>
        </div>
      )}
    </section>
  );
}
