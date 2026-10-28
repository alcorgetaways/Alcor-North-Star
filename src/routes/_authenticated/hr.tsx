import { useMemo, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { PageHeader } from "@/components/PageHeader";
import { DataTable } from "@/components/DataTable";
import { DepartmentScorecards } from "@/components/DepartmentScorecards";
import { RdGradesTable } from "@/components/ResDesk";
import { periodBounds } from "@/lib/rd-periods";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  BAND_CLASS,
  BAND_LABEL,
  band,
  useTeamScorecard,
} from "@/lib/scorecard";
import { monthLabel, monthOptions, previousMonthKey, monthKey } from "@/lib/kpi";
import { ROLE_LABELS, type AppRole } from "@/lib/constants";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/_authenticated/hr")({
  head: () => ({
    meta: [
      { title: "HR — Alcor North Star" },
      { name: "description", content: "Staff roster, joining details and monthly performance scorecards." },
      { property: "og:title", content: "HR — Alcor North Star" },
      { property: "og:description", content: "Staff performance overview for HR." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: HrPage,
});

type StaffRow = {
  user_id: string;
  full_name: string | null;
  email: string | null;
  status: string;
  department: string | null;
  joined_on: string | null;
  roles: string[];
  pipelines: Array<{ code: string; name: string; role: string }>;
  assigned_clients: number;
};

function fmtDate(d: string | null): string {
  if (!d) return "—";
  return new Date(`${d.slice(0, 10)}T00:00:00Z`).toLocaleDateString("en-IN", {
    day: "2-digit", month: "short", year: "numeric", timeZone: "UTC",
  });
}

function HrPage() {
  const [month, setMonth] = useState(previousMonthKey(monthKey()));
  const { data: staff = [] } = useQuery({
    queryKey: ["hr-staff-overview"],
    queryFn: async () => {
      const { data, error } = await supabase.rpc("hr_staff_overview");
      if (error) throw error;
      return data as unknown as StaffRow[];
    },
  });
  const { data: scores = [] } = useTeamScorecard(month);

  const scoreByUser = useMemo(() => new Map(scores.map((s) => [s.user_id, s])), [scores]);
  const months = monthOptions(12);

  return (
    <div className="space-y-6">
      <PageHeader
        title="HR"
        description="Every staff member — role, joining, pipelines and monthly performance. Read-only; no client commercial data."
        actions={
          <Select value={month} onValueChange={setMonth}>
            <SelectTrigger className="w-44"><SelectValue /></SelectTrigger>
            <SelectContent>
              {months.map((m) => (
                <SelectItem key={m.value} value={m.value}>{m.label}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        }
      />

      <DataTable<StaffRow>
        rows={staff}
        rowKey={(s) => s.user_id}
        emptyMessage="No staff found."
        columns={[
          {
            key: "name",
            header: "Name",
            render: (s) => (
              <span className="font-medium">
                {s.full_name || "—"}
                {s.status !== "active" ? (
                  <Badge variant="outline" className="ml-2">{s.status}</Badge>
                ) : null}
              </span>
            ),
          },
          {
            key: "role",
            header: "Role",
            render: (s) => (
              <span className="text-muted-foreground">
                {s.roles.map((r) => ROLE_LABELS[r as AppRole] ?? r).join(", ") || "—"}
              </span>
            ),
          },
          {
            key: "department",
            header: "Title / Department",
            render: (s) => <span className="text-muted-foreground">{s.department || "—"}</span>,
          },
          {
            key: "joined",
            header: "Joined",
            render: (s) => <span className="text-muted-foreground">{fmtDate(s.joined_on)}</span>,
          },
          {
            key: "pipelines",
            header: "Pipelines",
            className: "max-w-56",
            render: (s) => (
              <span className="line-clamp-2 text-muted-foreground">
                {s.pipelines.map((p) => `${p.name} (${p.role})`).join(", ") || "—"}
              </span>
            ),
          },
          { key: "clients", header: "Clients", align: "right", render: (s) => s.assigned_clients },
          {
            key: "ontime",
            header: "Reports on time",
            align: "right",
            render: (s) => {
              const sc = scoreByUser.get(s.user_id);
              return sc?.on_time_pct == null ? "—" : `${sc.on_time_pct}%`;
            },
          },
          {
            key: "kpi",
            header: "KPI %",
            align: "right",
            render: (s) => {
              const sc = scoreByUser.get(s.user_id);
              return sc?.kpi_pct == null ? "—" : `${sc.kpi_pct}%`;
            },
          },
          {
            key: "score",
            header: `Score (${monthLabel(month)})`,
            align: "right",
            render: (s) => {
              const sc = scoreByUser.get(s.user_id);
              return sc?.overall_score == null ? "—" : sc.overall_score;
            },
          },
          {
            key: "status",
            header: "Status",
            render: (s) => {
              const b = band(scoreByUser.get(s.user_id)?.overall_score);
              return (
                <span className={cn("rounded-full border px-2 py-0.5 text-label", BAND_CLASS[b])}>
                  {BAND_LABEL[b]}
                </span>
              );
            },
          },
        ]}
      />
      <p className="text-label text-muted-foreground">{staff.length} staff members</p>
      <RdGradesTable {...periodBounds("month", month)} />
      <DepartmentScorecards month={month} readOnly />
    </div>
  );
}
