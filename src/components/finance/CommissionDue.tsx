import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Input } from "@/components/ui/input";
import { currency } from "@/lib/kpi";
import { DataTable } from "@/components/DataTable";

type LineRow = { r: Row; l: (typeof LINES)[number]; i: number };

type Row = {
  client_id: string; hotel_name: string; plan_name: string | null; bookings: number;
  revenue: { direct: number; ota: number; weddings: number; total: number };
  pct: { direct: number | null; ota: number | null; weddings: number | null; team_incentive: number | null };
  due: { direct: number | null; ota: number | null; weddings: number | null; team_incentive: number | null };
};

const LINES = [
  { k: "direct", label: "Direct (non-OTA sources)", base: "direct" },
  { k: "ota", label: "OTA source", base: "ota" },
  { k: "weddings", label: "Weddings / events", base: "weddings" },
  { k: "team_incentive", label: "Team incentive (all Alcor revenue)", base: "total" },
] as const;

function lastMonth() {
  const d = new Date();
  d.setUTCDate(1);
  d.setUTCMonth(d.getUTCMonth() - 1);
  return d.toISOString().slice(0, 7);
}

/** Commission and incentive due per client for one stay month — BOOKED revenue × the launch's terms. */
export function CommissionDue() {
  const [month, setMonth] = useState(lastMonth());
  const { data, isLoading } = useQuery({
    queryKey: ["commission-due", month],
    queryFn: async () => {
      const { data, error } = await supabase.rpc("commission_due", { _month: `${month}-01` });
      if (error) throw error;
      return data as unknown as Row[];
    },
  });
  const grand = (data ?? []).reduce((s, r) => s + LINES.reduce((t, l) => t + (r.due[l.k] ?? 0), 0), 0);

  return (
    <section className="space-y-3 card-surface p-5">
      <div className="flex flex-wrap items-center gap-3">
        <h2 className="text-section-title font-semibold">Commission &amp; incentive due</h2>
        <Input type="month" className="w-44" value={month} onChange={(e) => e.target.value && setMonth(e.target.value)} aria-label="Stay month" />
        <span className="ml-auto text-sm">Total due: <span className="font-semibold">{currency(grand)}</span></span>
      </div>
      <p className="text-xs text-muted-foreground">
        From BOOKED bookings in the ledger for this stay month (cancelled excluded), × the commission % on the launch in force that month.
        Weddings/events category uses the weddings %; otherwise OTA source uses the OTA %; everything else uses the direct %. Team incentive applies to all booked revenue.
        "Not specified" means no % is set on the contract, so no amount is shown.
      </p>
      {isLoading ? null : (
        <DataTable<LineRow>
          className="rounded-none border-0 bg-transparent shadow-none"
          rows={(data ?? []).flatMap((r) =>
            LINES.map((l, i) => ({ r, l, i })).filter(({ r, l, i }) => i === 3 || r.revenue[l.base]),
          )}
          rowKey={({ r, l }) => `${r.client_id}-${l.k}`}
          emptyMessage="No booked revenue for this month."
          columns={[
            {
              key: "client",
              header: "Client",
              render: ({ r, i }) => (
                <>
                  {i === 0 || (!r.revenue.direct && i === 1) ? <span className="font-medium">{r.hotel_name}</span> : null}
                  {i === 0 ? <span className="block text-label text-muted-foreground">{r.plan_name ?? "No launch"} · {r.bookings} bookings</span> : null}
                </>
              ),
            },
            { key: "line", header: "Line", render: ({ l }) => l.label },
            { key: "base", header: "Booked revenue", align: "right", render: ({ r, l }) => currency(r.revenue[l.base]) },
            {
              key: "pct",
              header: "%",
              align: "right",
              render: ({ r, l }) => {
                const p = r.pct[l.k];
                return p == null || (l.k === "team_incentive" && !p) ? <span className="text-muted-foreground">Not specified</span> : `${p}%`;
              },
            },
            {
              key: "calc",
              header: "Calculation",
              render: ({ r, l }) => {
                const due = r.due[l.k];
                return <span className="text-label text-muted-foreground">{due == null ? "—" : `${currency(r.revenue[l.base])} × ${r.pct[l.k]}%`}</span>;
              },
            },
            { key: "due", header: "Due", align: "right", render: ({ r, l }) => (r.due[l.k] == null ? "—" : currency(r.due[l.k]!)) },
          ]}
        />
      )}
    </section>
  );
}
