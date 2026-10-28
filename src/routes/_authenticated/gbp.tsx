import { MainKpis } from "@/components/MainKpis";
import { marketingSearch } from "@/lib/property-filter";
import { parseRequiredMetrics, firstMetricError } from "@/lib/form-rules";
import { MonthlyActivityPlans } from "@/components/MonthlyActivityPlans";
import { GbpDutyTasks } from "@/components/GbpDutyTasks";
import { PipelineBaselines } from "@/components/PipelineBaselines";
import { FetchedSourcePanel, useFetchedRows, sumByMonth } from "@/components/FetchedSourcePanel";
import { demoIn } from "@/lib/demo";
import { useGbpProfileNames } from "@/lib/gbp-profiles";
import { useEffect, useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { PerformanceTabs } from "@/components/PerformanceTabs";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { CheckCircle2 } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { PageHeader } from "@/components/PageHeader";
import { EmptyState } from "@/components/EmptyState";
import { StatusBadge } from "@/components/StatusBadge";
import { GbpKpiSection } from "@/components/GbpKpiSection";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { monthKey, monthLabel, monthOptions } from "@/lib/kpi";
import {
  GBP_METRICS,
  GBP_REPORT_KINDS,
  type GbpEntry,
  type GbpReport,
} from "@/lib/gbp";

const GBP_NUM_KEYS = ["posts", "photos", "five_star_reviews", "profile_interactions", "chat_clicks", "calls", "website_clicks", "views", "booking_clicks", "direction_requests"] as const;

/** Anju's GBP workspace groups (Batch 4): entry form split into labelled sections. */
const GBP_FORM_GROUPS: Array<{ title: string; keys: string[] }> = [
  { title: "Photos & posts", keys: ["posts", "photos"] },
  { title: "Reviews & reputation", keys: ["five_star_reviews", "profile_interactions"] },
  { title: "Actions & reach", keys: ["chat_clicks", "calls", "website_clicks", "views", "booking_clicks", "direction_requests"] },
];

export const Route = createFileRoute("/_authenticated/gbp")({
  head: () => ({
    meta: [
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
      { title: "Google Business Profile KPIs — Alcor North Star" },
      {
        name: "description",
        content:
          "Log monthly Google Business Profile posts, photos, reviews, interactions, chats, calls and website clicks, and upload NAP and yearly growth reports.",
      },
      { property: "og:title", content: "Google Business Profile KPIs — Alcor North Star" },
      {
        property: "og:description",
        content: "Monthly GBP performance and report library for assigned hotels.",
      },
    ],
  }),
  validateSearch: marketingSearch,
  component: GbpPage,
});

function GbpPage() {
  const { tab } = Route.useSearch();
  return (
    <PerformanceTabs
      tab={tab ?? "performance"}
      source="localo"
      title="GBP Performance"
      description="Google Business Profile results from Localo across every hotel. Staff see all fetched months (marked if not yet approved); hotels see approved months only."
      entry={<GbpKpis />}
    />
  );
}

type Assignment = {
  id: string;
  client_id: string;
  clients: { hotel_name: string; city: string | null; gbp_profile_name: string | null; is_internal: boolean } | null;
  start_date: string | null;
  pipelines: { id: string; name: string; code: string } | null;
};

const EMPTY = {
  posts: "",
  photos: "",
  five_star_reviews: "",
  profile_interactions: "",
  chat_clicks: "",
  calls: "",
  website_clicks: "",
  views: "",
  booking_clicks: "",
  direction_requests: "",
  notes: "",
};

const STATUS_LABEL: Record<string, string> = {
  draft: "Draft",
  submitted: "Awaiting approval",
  approved: "Approved",
};

function GbpKpis() {
  const { user, isManager } = useAuth();
  const qc = useQueryClient();
  const [clientPipelineId, setClientPipelineId] = useState("");
  const [month, setMonth] = useState(monthKey());
  const [form, setForm] = useState(EMPTY);
  const [seededForm, setSeededForm] = useState(EMPTY);
  const formDirty = JSON.stringify(form) !== JSON.stringify(seededForm);
  const [report, setReport] = useState({ kind: "nap", title: "", month: monthKey(), notes: "" });
  const [file, setFile] = useState<File | null>(null);

  const { data: assignments = [] } = useQuery({
    queryKey: ["gbp-assignments", user?.id, isManager],
    enabled: Boolean(user?.id),
    queryFn: async () => {
      const q = supabase
        .from("client_pipelines")
        .select("id, client_id, start_date, clients!inner(hotel_name, city, gbp_profile_name, is_internal, is_test), pipelines!inner(id, name, code)").not("client_id", "in", demoIn())
        .eq("pipelines.code", "gbp")
        .eq("clients.is_test", false);
      // QA-11: row-level access (can_view_pipeline: managers, pipeline members, assignments) decides the list.
      const { data, error } = await q;
      if (error) throw error;
      return (data as unknown as Assignment[]).sort((a, b) =>
        (a.clients?.hotel_name ?? "").localeCompare(b.clients?.hotel_name ?? ""),
      );
    },
  });

  useEffect(() => {
    if (!clientPipelineId && assignments.length) setClientPipelineId(assignments[0]!.id);
  }, [assignments, clientPipelineId]);

  const selected = assignments.find((a) => a.id === clientPipelineId);
  const { data: profileNames = {} } = useGbpProfileNames();
  const namesFor = (a: Assignment | undefined): string[] =>
    a ? (profileNames[a.client_id]?.length ? profileNames[a.client_id]! : (a.clients?.gbp_profile_name ? [a.clients.gbp_profile_name] : [])) : [];

  const { data: entries = [] } = useQuery({
    queryKey: ["gbp-entries", clientPipelineId],
    enabled: Boolean(clientPipelineId),
    queryFn: async () => {
      const { data, error } = await supabase
        .from("gbp_kpi_entries")
        .select(
          "id, month, posts, photos, five_star_reviews, profile_interactions, chat_clicks, calls, website_clicks, views, booking_clicks, direction_requests, notes, status",
        ).not("client_id", "in", demoIn())
        .eq("client_pipeline_id", clientPipelineId)
        .order("month", { ascending: false })
        .limit(48);
      if (error) throw error;
      return data as unknown as GbpEntry[];
    },
  });

  const { data: reports = [] } = useQuery({
    queryKey: ["gbp-reports", clientPipelineId],
    enabled: Boolean(clientPipelineId),
    queryFn: async () => {
      const { data, error } = await supabase
        .from("gbp_reports")
        .select("id, kind, title, month, file_path, notes, created_at").not("client_id", "in", demoIn())
        .eq("client_pipeline_id", clientPipelineId)
        .order("created_at", { ascending: false })
        .limit(50);
      if (error) throw error;
      return data as unknown as GbpReport[];
    },
  });

  const existing = entries.find((e) => e.month === month);
  const { data: fetchedRows = [] } = useFetchedRows(clientPipelineId, "localo");
  const fetchedByMonth = sumByMonth(fetchedRows);
  const fetchedNow = fetchedByMonth.get(month);
  // Staff chart: approved/entered months plus fetched months not yet entered (marked "not yet approved").
  const chartEntries: GbpEntry[] = [
    ...entries,
    ...Array.from(fetchedByMonth.entries())
      .filter(([m]) => !entries.some((e) => e.month === m))
      .slice(0, 18)
      .map(([m, f]) => ({
        id: `fetched-${m}`,
        month: m,
        ...Object.fromEntries(GBP_METRICS.map((x) => [x.key, f.values[x.key] ?? null])),
        status: f.statuses.every((st) => st === "approved") ? "approved" : f.statuses.some((st) => st === "fetched") ? "fetched" : "reviewed",
      }) as unknown as GbpEntry),
  ];

  useEffect(() => {
    const seed = (
      existing
        ? {
            posts: String(existing.posts ?? ""),
            photos: String(existing.photos ?? ""),
            five_star_reviews: String(existing.five_star_reviews ?? ""),
            profile_interactions: String(existing.profile_interactions ?? ""),
            chat_clicks: String(existing.chat_clicks ?? ""),
            calls: String(existing.calls ?? ""),
            website_clicks: String(existing.website_clicks ?? ""),
            views: String(existing.views ?? ""),
            booking_clicks: String(existing.booking_clicks ?? ""),
            direction_requests: String(existing.direction_requests ?? ""),
            notes: existing.notes ?? "",
          }
        : fetchedNow
          ? { ...EMPTY, ...Object.fromEntries(GBP_METRICS.filter((x) => fetchedNow.values[x.key] != null).map((x) => [x.key, String(fetchedNow.values[x.key])])) }
          : EMPTY
    );
    setForm(seed);
    setSeededForm(seed);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [existing, month, clientPipelineId, fetchedRows]);

  const saveEntry = useMutation({
    mutationFn: async () => {
      if (!selected) throw new Error("Select a hotel first");
      const parsed = parseRequiredMetrics(form as Record<string, unknown>, GBP_NUM_KEYS);
      if (!parsed.ok) throw new Error(firstMetricError(parsed.errors) ?? "Check the numbers");
      const { error } = await supabase.from("gbp_kpi_entries").upsert(
        {
          client_id: selected.client_id,
          client_pipeline_id: selected.id,
          month,
          ...parsed.values,
          notes: form.notes || null,
          created_by: user?.id ?? null,
        },
        { onConflict: "client_pipeline_id,month" },
      );
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Google Business Profile numbers saved");
      void qc.invalidateQueries({ queryKey: ["gbp-entries", clientPipelineId] });
      void qc.invalidateQueries({ queryKey: ["gbp-dashboard"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const approve = useMutation({
    mutationFn: async () => {
      if (!existing) throw new Error("Save the month first");
      const { error } = await supabase
        .from("gbp_kpi_entries")
        .update({ status: "approved", approved_by: user?.id ?? null, approved_at: new Date().toISOString() })
        .eq("id", existing.id!);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Approved — the hotel can now see this month");
      void qc.invalidateQueries({ queryKey: ["gbp-entries", clientPipelineId] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const uploadReport = useMutation({
    mutationFn: async () => {
      if (!selected) throw new Error("Select a hotel first");
      if (!report.title.trim()) throw new Error("Give the report a title");
      let path: string | null = null;
      if (file) {
        path = `${selected.client_id}/gbp/${Date.now()}-${file.name.replace(/[^\w.-]+/g, "_")}`;
        const { error: upErr } = await supabase.storage
          .from("client-files")
          .upload(path, file, { upsert: false });
        if (upErr) throw upErr;
      }
      const { error } = await supabase.from("gbp_reports").insert({
        client_id: selected.client_id,
        client_pipeline_id: selected.id,
        kind: report.kind,
        title: report.title.trim(),
        month: report.month,
        file_path: path,
        notes: report.notes || null,
        uploaded_by: user?.id ?? null,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Report uploaded");
      setReport({ kind: "nap", title: "", month: monthKey(), notes: "" });
      setFile(null);
      void qc.invalidateQueries({ queryKey: ["gbp-reports", clientPipelineId] });
      void qc.invalidateQueries({ queryKey: ["gbp-reports-dashboard"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <div className="space-y-6">
      <PageHeader
        title="Google Business Profile KPIs"
        description="Log monthly GBP delivery and engagement and upload the NAP and yearly growth reports. The hotel sees a month only after management approves it."
        actions={
          <Button asChild variant="outline">
            <Link to="/targets" search={{ pipeline: "gbp" }}>KPI targets</Link>
          </Button>
        }
      />

      {assignments.length === 0 ? (
        <EmptyState
          title="No Google Business Profile hotels assigned yet"
          description="BD assigns hotels during onboarding."
        />
      ) : (
        <>
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label>Hotel</Label>
              <Select value={clientPipelineId} onValueChange={setClientPipelineId}>
                <SelectTrigger>
                  <SelectValue placeholder="Select a hotel" />
                </SelectTrigger>
                <SelectContent>
                  {assignments.map((a) => (
                    <SelectItem key={a.id} value={a.id}>
                      {a.clients?.hotel_name}
                      {a.clients?.city ? ` · ${a.clients.city}` : ""}
                      {namesFor(a).length ? ` — ${namesFor(a).join(" · ")}` : ""}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>Month</Label>
              <Select value={month} onValueChange={setMonth}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {monthOptions(240).map((m) => (
                    <SelectItem key={m.value} value={m.value}>
                      {m.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          {selected ? (
            <FetchedSourcePanel cp={selected.id} source="localo" startDate={selected.start_date} internal={!!selected.clients?.is_internal} />
          ) : null}

          <MainKpis clientPipelineId={clientPipelineId} month={month} />
          <h2 className="text-section-title font-semibold">All KPIs</h2>
          <section className="card-surface p-5">
            {!existing && fetchedNow ? (
              <p className="mb-2 text-label text-muted-foreground">Pre-filled from Localo — edit if needed; the fetched values stay on record above.</p>
            ) : null}
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h2 className="text-section-title font-semibold">
                {existing ? "Update" : "Add"} {monthLabel(month)}
              </h2>
              {namesFor(selected).map((n) => (
                <p key={n} className="text-label text-muted-foreground">Profile: {n}</p>
              ))}
              {existing ? (
                <StatusBadge status={existing.status ?? "draft"} label={STATUS_LABEL[existing.status ?? "draft"] ?? existing.status ?? "draft"} />
              ) : null}
            </div>
            {GBP_FORM_GROUPS.map((group) => (
              <div key={group.title} className="mt-4">
                <h3 className="text-label font-semibold uppercase tracking-wide text-muted-foreground">{group.title}</h3>
                <div className="mt-2 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
                  {GBP_METRICS.filter((m) => group.keys.includes(m.key)).map((m) => (
                    <div key={m.key} className="space-y-1.5">
                      <Label htmlFor={m.key}>{m.label}</Label>
                      <Input
                        id={m.key}
                        inputMode="numeric"
                        value={form[m.key] ?? ""}
                        onChange={(e) => setForm({ ...form, [m.key]: e.target.value })}
                      />
                    </div>
                  ))}
                </div>
              </div>
            ))}
            <div className="mt-4 space-y-1.5">
              <Label htmlFor="gbp-notes">Notes for management</Label>
              <Textarea
                id="gbp-notes"
                rows={2}
                value={form.notes ?? ""}
                onChange={(e) => setForm({ ...form, notes: e.target.value })}
              />
            </div>
            <div className="mt-4 flex flex-wrap gap-2">
              <Button onClick={() => saveEntry.mutate()} disabled={saveEntry.isPending}>
                {saveEntry.isPending ? "Saving…" : existing ? "Update month" : "Save month"}
              </Button>
              {isManager && existing && existing.status !== "approved" ? (
                <Button variant="outline" onClick={() => approve.mutate()} disabled={approve.isPending || formDirty} title={formDirty ? "Save your changes before approving" : undefined}>
                  <CheckCircle2 className="mr-2 h-4 w-4" /> Approve for client
                </Button>
              ) : null}
            </div>
            <p className="mt-2 text-label text-muted-foreground">
              The hotel sees a month only after management approves it. Editing an approved month
              sends it back for approval.
            </p>
          </section>

          <section className="card-surface p-5">
            <h2 className="text-section-title font-semibold">Upload a report</h2>
            <p className="text-label text-muted-foreground">
              NAP report and yearly growth report are shared with management, admin and the hotel.
            </p>
            <div className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
              <div className="space-y-1.5">
                <Label>Report type</Label>
                <Select
                  value={report.kind}
                  onValueChange={(v) => setReport({ ...report, kind: v })}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {GBP_REPORT_KINDS.map((k) => (
                      <SelectItem key={k.value} value={k.value}>
                        {k.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="rtitle">Title</Label>
                <Input
                  id="rtitle"
                  value={report.title}
                  onChange={(e) => setReport({ ...report, title: e.target.value })}
                />
              </div>
              <div className="space-y-1.5">
                <Label>Month</Label>
                <Select value={report.month} onValueChange={(v) => setReport({ ...report, month: v })}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {monthOptions().map((m) => (
                      <SelectItem key={m.value} value={m.value}>
                        {m.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="rfile">File</Label>
                <Input
                  id="rfile"
                  type="file"
                  onChange={(e) => setFile(e.target.files?.[0] ?? null)}
                />
              </div>
            </div>
            <div className="mt-4 space-y-1.5">
              <Label htmlFor="rnotes">Notes</Label>
              <Textarea
                id="rnotes"
                rows={2}
                value={report.notes}
                onChange={(e) => setReport({ ...report, notes: e.target.value })}
              />
            </div>
            <Button
              className="mt-4"
              onClick={() => uploadReport.mutate()}
              disabled={uploadReport.isPending}
            >
              {uploadReport.isPending ? "Uploading…" : "Upload report"}
            </Button>
          </section>

          {selected && selected.pipelines ? (
            <GbpDutyTasks
              clientPipelineId={selected.id}
              clientId={selected.client_id}
              pipelineId={selected.pipelines.id}
              code="gbp"
            />
          ) : null}

          <GbpKpiSection
            title={`${selected?.clients?.hotel_name ?? "Hotel"} — Google Business Profile`}
            entries={chartEntries}
            reports={reports}
          />
        </>
      )}
      <MonthlyActivityPlans code="gbp" hideTasks />
      <PipelineBaselines code="gbp" pipelineId={clientPipelineId || undefined} />
    </div>
  );
}
