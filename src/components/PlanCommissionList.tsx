import { Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { DataTable } from "@/components/DataTable";
import { StatusBadge } from "@/components/StatusBadge";
import { fmtCommission } from "@/lib/commission";

type Row = {
  client_id: string;
  hotel_name: string;
  plan_name: string | null;
  base_plan_name: string | null;
  is_custom: boolean;
  commission_direct_pct: number | null;
  commission_ota_pct: number | null;
  commission_weddings_pct: number | null;
  open_flags: number;
  commission_pending: boolean;
};

/** BD dashboard: plan + commission per active client, read from the same launch terms as Finance. */
export function PlanCommissionList() {
  const { data = [] } = useQuery({
    queryKey: ["commercial-terms-list"],
    queryFn: async () => {
      const { data, error } = await supabase.rpc("commercial_terms_list");
      if (error) throw error;
      return data as unknown as Row[];
    },
  });
  return (
    <section className="card-surface p-5">
      <h2 className="text-section-title font-semibold">Client plans &amp; commission</h2>
      <p className="text-xs text-muted-foreground">Active launches. "Not specified" means no commission has been confirmed.</p>
      <DataTable<Row>
        className="mt-3 rounded-none border-0 bg-transparent shadow-none"
        rows={data}
        rowKey={(r) => r.client_id}
        emptyMessage="No active launches yet."
        columns={[
          {
            key: "client",
            header: "Client",
            render: (r) => (
              <Link to="/clients/$clientId" params={{ clientId: r.client_id }} className="font-medium hover:underline">
                {r.hotel_name}
              </Link>
            ),
          },
          {
            key: "plan",
            header: "Plan",
            render: (r) => (
              <span className="text-muted-foreground">
                {r.plan_name ?? "—"}
                {r.is_custom ? <span className="block text-label">Base: {r.base_plan_name}</span> : null}
              </span>
            ),
          },
          { key: "direct", header: "Direct", align: "right", render: (r) => <span className={r.commission_direct_pct == null ? "text-muted-foreground" : ""}>{fmtCommission(r.commission_direct_pct)}</span> },
          { key: "ota", header: "OTA", align: "right", render: (r) => <span className={r.commission_ota_pct == null ? "text-muted-foreground" : ""}>{fmtCommission(r.commission_ota_pct)}</span> },
          { key: "weddings", header: "Weddings", align: "right", render: (r) => <span className={r.commission_weddings_pct == null ? "text-muted-foreground" : ""}>{fmtCommission(r.commission_weddings_pct)}</span> },
          {
            key: "review",
            header: "Review",
            render: (r) => (
              <span className="text-label">
                {r.commission_pending ? <StatusBadge status="pending" label="Commission pending confirmation" /> : null}
                {r.open_flags > (r.commission_pending ? 1 : 0) ? (
                  <span className="ml-1 text-muted-foreground">{r.open_flags - (r.commission_pending ? 1 : 0)} flag(s)</span>
                ) : null}
              </span>
            ),
          },
        ]}
      />
    </section>
  );
}
