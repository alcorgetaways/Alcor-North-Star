import { CompareTrackerButton } from "@/components/CompareTracker";
import { useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { Plus, Search } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { PageHeader } from "@/components/PageHeader";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { useAuth } from "@/hooks/useAuth";
import { ACTIVE_LAUNCH_STATUSES, LAUNCH_STATUS_LABEL } from "@/lib/launch";
import { DataTable } from "@/components/DataTable";
import { StatusBadge } from "@/components/StatusBadge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

const STATUS_FILTERS: Array<{ value: string; label: string }> = [
  { value: "active", label: "Active launch" },
  { value: "all", label: "All clients" },
  { value: "draft", label: "Draft" },
  { value: "proposed", label: "Proposed" },
  { value: "awaiting_day0", label: "Ready to activate" },
  { value: "on_hold", label: "On hold" },
  { value: "completed", label: "Completed" },
  { value: "cancelled", label: "Cancelled" },
  { value: "closed", label: "Closed" },
  { value: "none", label: "No launch" },
];
import { useTargetsMissing } from "@/lib/targets-missing";
import { PROPERTY_TYPES } from "@/lib/constants";

export const Route = createFileRoute("/_authenticated/clients/")({
  head: () => ({
    meta: [
      { title: "Clients — Alcor North Star" },
      {
        name: "description",
        content: "Every hotel on the Alcor Getaways roster with onboarding and pipeline status.",
      },
      { property: "og:title", content: "Clients — Alcor North Star" },
      { property: "og:description", content: "Hotel roster, onboarding and pipeline status." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: ClientsPage,
});

function ClientsPage() {
  const [q, setQ] = useState("");
  const [statusFilter, setStatusFilter] = useState("active");
  const [typeFilter, setTypeFilter] = useState("all");
  const { isBD, isManager } = useAuth();
  const { data: missing = [] } = useTargetsMissing(isManager);
  const missingBy = new Map(missing.map((m) => [m.clientId, m.count]));

  const { data = [], isLoading, error, refetch } = useQuery({
    queryKey: ["clients"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("clients")
        .select(
          "id, client_code, hotel_name, property_type, city, state, status, payment_status, is_test, client_launches(id, status, no_launch_checklist, core_onboarding_completed_at, created_at, plans(name, sort_order), custom_plans(name), client_gates(gate_code, status))",
        )
        .order("hotel_name")
        .limit(1000);
      if (error) throw error;
      return data as unknown as Array<{
        id: string;
        hotel_name: string;
        client_code: string | null;
        property_type: string | null;
        city: string | null;
        state: string | null;
        status: string;
        payment_status: string;
        is_test: boolean;
        client_launches: Array<{ id: string; status: string; no_launch_checklist: boolean; core_onboarding_completed_at: string | null; created_at: string; plans: { name: string; sort_order: number } | null; custom_plans: { name: string } | null; client_gates: Array<{ gate_code: string; status: string }> }>;
      }>;
    },
  });

  const latestLaunch = (c: (typeof data)[number]) =>
    [...c.client_launches].sort((a, b) => (a.created_at < b.created_at ? 1 : -1))[0];

  const filtered = data
    // Test clients stay out of every list except the explicit "All clients" view.
    .filter((c) => statusFilter === "all" || !c.is_test)
    .filter((c) => typeFilter === "all" || (typeFilter === "none" ? !c.property_type : c.property_type === typeFilter))
    .filter((c) =>
      `${c.hotel_name} ${c.client_code ?? ""} ${c.city ?? ""} ${c.state ?? ""}`.toLowerCase().includes(q.toLowerCase()),
    )
    .filter((c) => {
      // All clients hides hotels whose every launch is closed; they live under Closed.
      if (statusFilter === "all")
        return c.client_launches.length === 0 || c.client_launches.some((l) => l.status !== "closed");
      const latest = latestLaunch(c);
      if (statusFilter === "none") return !latest;
      if (statusFilter === "active")
        return !!latest && (ACTIVE_LAUNCH_STATUSES as readonly string[]).includes(latest.status);
      return latest?.status === statusFilter;
    });

  return (
    <div className="space-y-6">
      <PageHeader
        title="Clients"
        description="Hotels onboarded to Alcor Getaways, their onboarding stage and active pipelines."
        actions={
          isBD ? (
            <div className="flex flex-wrap gap-2">
              <CompareTrackerButton />
              <Button asChild size="sm">
                <Link to="/clients/new" search={{}}>
                  <Plus className="mr-2 h-4 w-4" strokeWidth={1.75} /> New client
                </Link>
              </Button>
            </div>
          ) : null
        }
      />

      <div className="flex flex-wrap items-center gap-3">
        <div className="relative w-full max-w-sm">
          <Search className="absolute top-2.5 left-3 h-4 w-4 text-muted-foreground" />
          <Input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search hotels or cities…"
            className="pl-9"
          />
        </div>
        <Select value={statusFilter} onValueChange={setStatusFilter}>
          <SelectTrigger className="h-9 w-48"><SelectValue /></SelectTrigger>
          <SelectContent>
            {STATUS_FILTERS.map((f) => (
              <SelectItem key={f.value} value={f.value}>{f.label}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={typeFilter} onValueChange={setTypeFilter}>
          <SelectTrigger className="h-9 w-44"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All property types</SelectItem>
            {PROPERTY_TYPES.map((t) => <SelectItem key={t} value={t}>{t}</SelectItem>)}
            <SelectItem value="none">Type not set</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {error ? (
        <div role="alert" className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-destructive/40 bg-destructive/5 px-4 py-3 text-sm">
          <p className="text-destructive">Could not load clients: {error.message}</p>
          <Button variant="outline" size="sm" onClick={() => refetch()}>Retry</Button>
        </div>
      ) : null}

      <DataTable
        rows={filtered}
        rowKey={(c) => c.id}
        loading={isLoading}
        emptyMessage={error ? "The client request failed; see the error above." : "No clients yet. Start by onboarding your first hotel."}
        columns={[
          {
            key: "hotel",
            header: "Hotel",
            render: (c) => (
              <>
                <Link
                  to="/clients/$clientId"
                  params={{ clientId: c.id }}
                  className="font-medium hover:underline"
                >
                  {c.hotel_name}
                </Link>
                {c.client_code ? (
                  <span className="ml-2 text-label-muted tabular-nums">{c.client_code}</span>
                ) : null}
                {missingBy.get(c.id) ? (
                  <Badge variant="outline" className="ml-2 border-destructive/40 text-destructive">
                    Targets missing
                  </Badge>
                ) : null}
              </>
            ),
          },
          {
            key: "location",
            header: "Location",
            headerClassName: "hidden sm:table-cell",
            className: "hidden text-muted-foreground sm:table-cell",
            render: (c) => (
              <>
                {[c.city, c.state].filter(Boolean).join(", ") || "—"}
                <span className="block text-label-muted">{c.property_type ?? "Type not set"}</span>
              </>
            ),
          },
          {
            key: "plan",
            header: "Plan",
            headerClassName: "hidden md:table-cell",
            className: "hidden md:table-cell",
            render: (c) =>
              latestLaunch(c)?.custom_plans?.name ?? latestLaunch(c)?.plans?.name ?? <span className="text-muted-foreground">—</span>,
          },
          {
            key: "launch",
            header: "Launch",
            render: (c) => {
              const l = latestLaunch(c);
              if (!l) return <span className="text-muted-foreground">No launch</span>;
              const coreLive = l.no_launch_checklist || l.core_onboarding_completed_at != null || l.client_gates.some((g) => g.gate_code === "gate_a" && g.status === "signed");
              const status = coreLive && l.status === "active" ? "live" : l.status;
              return <StatusBadge status={status} label={status === "live" && l.status === "active" ? "Live" : LAUNCH_STATUS_LABEL[status] ?? status} />;
            },
          },
          {
            key: "payment",
            header: "Payment",
            headerClassName: "hidden lg:table-cell",
            className: "hidden capitalize lg:table-cell",
            render: (c) => c.payment_status,
          },
        ]}
      />

    </div>
  );
}
