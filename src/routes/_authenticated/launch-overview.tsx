import { ProgressRing } from "@/components/ProgressRing";
import { demoIn } from "@/lib/demo";
import { SegmentedPill } from "@/components/SegmentedPill";
import { useMemo, useState } from "react";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { PageHeader } from "@/components/PageHeader";
import { DataTable } from "@/components/DataTable";
import { StatusBadge } from "@/components/StatusBadge";
import { LAUNCH_STATUS_LABEL, fmtDate, isOverdue, launchWeek } from "@/lib/launch";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/_authenticated/launch-overview")({
  head: () => ({
    meta: [
      { title: "Launch Overview — Alcor North Star" },
      { name: "description", content: "Every running launch: current week, next gate, overdue tasks and go-live dates." },
      { property: "og:title", content: "Launch Overview — Alcor North Star" },
      { property: "og:description", content: "Every running launch at a glance." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: LaunchOverview,
});

type Overview = {
  id: string;
  status: string;
  day0_date: string | null;
  launch_date: string | null;
  exit_date: string | null;
  notice_date: string | null;
  clients: { hotel_name: string } | null;
  plans: { name: string; duration_weeks: number } | null;
  client_gates: Array<{ id: string; gate_name: string; due_date: string; status: string }>;
  client_tasks: Array<{ id: string; status: string; due_date: string; phase: string }>;
};

function LaunchOverview() {
  const navigate = useNavigate();
  const launches = useQuery({
    queryKey: ["launch-overview"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("client_launches")
        .select("id, status, day0_date, launch_date, exit_date, notice_date, clients(hotel_name), plans(name, duration_weeks), client_gates(id, gate_name, due_date, status), client_tasks(id, status, due_date, phase)").not("client_id", "in", demoIn())
        .in("status", ["draft", "awaiting_day0", "active", "live", "offboarding"])
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data as unknown as Overview[];
    },
  });

  const rows = useMemo(() => {
    return (launches.data ?? [])
      .map((l) => {
        const n = l.plans?.duration_weeks ?? 0;
        const onboarding = l.client_tasks.filter((t) => t.phase === "onboarding");
        const nextGate = [...l.client_gates].filter((g) => g.status !== "signed").sort((a, b) => a.due_date.localeCompare(b.due_date))[0];
        const overdue = onboarding.filter((t) => isOverdue({ due_date: t.due_date, status: t.status } as never)).length;
        const waiting = onboarding.filter((t) => t.status === "waiting_client").length;
        const exitOpen = l.client_tasks.filter((t) => t.phase === "offboarding" && t.status !== "done" && t.status !== "not_applicable").length;
        return { ...l, n, nextGate, overdue, waiting, exitOpen, week: launchWeek(l.day0_date, n) };
      })
      .sort((a, b) => b.overdue - a.overdue);
  }, [launches.data]);

  const [tab, setTab] = useState<"setting_up" | "running" | "live" | "exiting">("running");
  const visible = rows.filter((r) =>
    tab === "setting_up" ? r.status === "draft" || r.status === "awaiting_day0"
      : tab === "running" ? r.status === "active"
        : tab === "live" ? r.status === "live"
          : r.status === "offboarding",
  );

  return (
    <div className="space-y-6">
      <PageHeader title="Launch Overview" description="Every launch, worst first." />
      <DataTable
        rows={visible}
        rowKey={(r) => r.id}
        loading={launches.isLoading}
        emptyMessage="No launches are running right now."
        onRowClick={(r) => navigate({ to: "/launches/$launchId", params: { launchId: r.id } })}
        toolbar={
          <SegmentedPill
            ariaLabel="Launch status"
            value={tab}
            onChange={(v) => setTab(v as typeof tab)}
            items={[
              { value: "setting_up", label: "Setting up", count: rows.filter((r) => r.status === "draft" || r.status === "awaiting_day0").length },
              { value: "running", label: "Running", count: rows.filter((r) => r.status === "active").length },
              { value: "live", label: "Live", count: rows.filter((r) => r.status === "live").length },
              { value: "exiting", label: "Exiting", count: rows.filter((r) => r.status === "offboarding").length },
            ]}
          />
        }
        columns={[
          { key: "hotel", header: "Hotel", render: (r) => <span className="font-medium">{r.clients?.hotel_name}</span> },
          { key: "plan", header: "Plan", render: (r) => r.plans?.name },
          {
            key: "status",
            header: "Status",
            render: (r) => <StatusBadge status={r.status} label={LAUNCH_STATUS_LABEL[r.status] ?? r.status} />,
          },
          { key: "week", header: "Week", render: (r) => (r.week === null ? "—" : <ProgressRing size="small" value={r.week} goal={r.n} label={`Week ${r.week} of ${r.n}`} caption={`${r.week} / ${r.n}`} />) },
          {
            key: "gate",
            header: "Next gate",
            render: (r) => (r.nextGate ? `${r.nextGate.gate_name} · ${fmtDate(r.nextGate.due_date)}` : "All signed"),
          },
          {
            key: "overdue",
            header: "Overdue",
            align: "right",
            render: (r) => <span className={cn(r.overdue > 0 && "font-semibold text-destructive")}>{r.overdue}</span>,
          },
          { key: "waiting", header: "Waiting on client", align: "right", render: (r) => r.waiting },
          {
            key: "date",
            header: "Go-live / Exit",
            render: (r) =>
              r.status === "offboarding"
                ? `${fmtDate(r.exit_date)}${r.exitOpen ? ` · ${r.exitOpen} open` : ""}`
                : fmtDate(r.launch_date),
          },
        ]}
      />
    </div>
  );
}
