import { ConfirmButton } from "@/components/ConfirmButton";
import { MainKpis } from "@/components/MainKpis";
import { parseRequiredMetrics, firstMetricError } from "@/lib/form-rules";
import { marketingSearch } from "@/lib/property-filter";
import { MonthlyActivityPlans } from "@/components/MonthlyActivityPlans";
import { SegmentedPill } from "@/components/SegmentedPill";
import { PipelineBaselines } from "@/components/PipelineBaselines";
import { FetchedSourcePanel, useFetchedRows, sumByMonth } from "@/components/FetchedSourcePanel";
import { demoIn } from "@/lib/demo";
import { useEffect, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { PerformanceTabs } from "@/components/PerformanceTabs";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { CheckCircle2 } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { PageHeader } from "@/components/PageHeader";
import { EmptyState } from "@/components/EmptyState";
import { StatusBadge } from "@/components/StatusBadge";
import { SocialKpiSection } from "@/components/SocialKpiSection";
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
import { SOCIAL_PLATFORMS, type SocialEntry } from "@/lib/social";

export const Route = createFileRoute("/_authenticated/social")({
  head: () => ({
    meta: [
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
      { title: "Social Media KPIs — Alcor North Star" },
      {
        name: "description",
        content:
          "Log monthly posts, followers, content views and profile views across Instagram, Facebook, YouTube and LinkedIn for every assigned hotel.",
      },
      { property: "og:title", content: "Social Media KPIs — Alcor North Star" },
      {
        property: "og:description",
        content: "Monthly social media performance tracking for assigned hotels.",
      },
    ],
  }),
  validateSearch: marketingSearch,
  component: SocialPage,
});

function SocialPage() {
  const { tab } = Route.useSearch();
  return (
    <PerformanceTabs
      tab={tab ?? "performance"}
      source="metricool"
      title="Social Performance"
      description="Posts per platform from Metricool across every social client. Staff see all fetched months; hotels see approved months only."
      entry={<SocialKpis />}
    />
  );
}

type Assignment = {
  id: string;
  client_id: string;
  clients: { hotel_name: string; city: string | null; is_internal: boolean } | null;
  start_date: string | null;
};

const STATUS_LABEL: Record<string, string> = {
  draft: "Draft",
  submitted: "Awaiting approval",
  approved: "Approved",
};

const EMPTY = { posts: "", followers: "", content_views: "", profile_views: "", engagement: "", new_followers: "", notes: "" };

function SocialKpis() {
  const { user, isManager } = useAuth();
  const qc = useQueryClient();
  const [clientPipelineId, setClientPipelineId] = useState("");
  const [month, setMonth] = useState(monthKey());
  const [platform, setPlatform] = useState<string>("instagram");
  const [form, setForm] = useState(EMPTY);

  const { data: assignments = [] } = useQuery({
    queryKey: ["social-assignments", user?.id, isManager],
    enabled: Boolean(user?.id),
    queryFn: async () => {
      let q = supabase
        .from("client_pipelines")
        .select("id, client_id, start_date, clients!inner(hotel_name, city, is_internal, is_test), pipelines!inner(name, code)").not("client_id", "in", demoIn())
        .eq("pipelines.code", "social_media")
        .eq("clients.is_test", false);
      if (!isManager) q = q.or(`manager_id.eq.${user!.id},backup_manager_id.eq.${user!.id}`);
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

  const { data: entries = [] } = useQuery({
    queryKey: ["social-entries", clientPipelineId],
    enabled: Boolean(clientPipelineId),
    queryFn: async () => {
      const { data, error } = await supabase
        .from("social_kpi_entries")
        .select("id, month, platform, posts, followers, content_views, profile_views, engagement, new_followers, notes, status").not("client_id", "in", demoIn())
        .eq("client_pipeline_id", clientPipelineId)
        .order("month", { ascending: false })
        .limit(200);
      if (error) throw error;
      return data as unknown as SocialEntry[];
    },
  });

  const existing = entries.find((e) => e.month === month && e.platform === platform);
  const { data: fetchedRows = [] } = useFetchedRows(clientPipelineId, "metricool");
  const fetchedByMonth = sumByMonth(fetchedRows);
  const fetchedPosts = fetchedByMonth.get(month)?.values[`${platform}.posts`];
  // Staff chart: entered months plus fetched months not yet entered (marked "not yet approved").
  const chartEntries: SocialEntry[] = [
    ...entries,
    ...Array.from(fetchedByMonth.entries()).slice(0, 18).flatMap(([m, f]) =>
      SOCIAL_PLATFORMS.filter((p) => f.values[`${p.value}.posts`] != null && !entries.some((e) => e.month === m && e.platform === p.value)).map(
        (p) =>
          ({
            id: `fetched-${m}-${p.value}`,
            month: m,
            platform: p.value,
            posts: f.values[`${p.value}.posts`],
            followers: null, content_views: null, profile_views: null, engagement: null, new_followers: null,
            status: f.statuses.every((st) => st === "approved") ? "approved" : "fetched",
          }) as unknown as SocialEntry,
      ),
    ),
  ];

  useEffect(() => {
    setForm(
      existing
        ? {
            posts: String(existing.posts ?? ""),
            followers: String(existing.followers ?? ""),
            content_views: String(existing.content_views ?? ""),
            profile_views: String(existing.profile_views ?? ""),
            engagement: String(existing.engagement ?? ""),
            new_followers: String(existing.new_followers ?? ""),
            notes: existing.notes ?? "",
          }
        : { ...EMPTY, posts: fetchedPosts != null ? String(fetchedPosts) : "" },
    );
  }, [existing, month, platform, clientPipelineId, fetchedPosts]);

  const save = useMutation({
    mutationFn: async () => {
      if (!selected) throw new Error("Select a hotel first");
      const parsed = parseRequiredMetrics(form, ["posts", "followers", "content_views", "profile_views", "engagement", "new_followers"] as const);
      const validation = firstMetricError(parsed.errors);
      if (validation) throw new Error(validation);
      const { error } = await supabase.from("social_kpi_entries").upsert(
        {
          client_id: selected.client_id,
          client_pipeline_id: selected.id,
          month,
          platform,
          ...parsed.values,
          notes: form.notes || null,
          created_by: user?.id ?? null,
        },
        { onConflict: "client_pipeline_id,month,platform" },
      );
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Social numbers saved");
      void qc.invalidateQueries({ queryKey: ["social-entries", clientPipelineId] });
      void qc.invalidateQueries({ queryKey: ["social-dashboard"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <div className="space-y-6">
      <PageHeader
        title="Social Media KPIs"
        description="Log posts, followers, content views and profile views each month for Instagram, Facebook, YouTube and LinkedIn. Saved numbers appear on the management and client dashboards with month-on-month change."
      />

      {assignments.length === 0 ? (
        <EmptyState
          title="No social media hotels assigned yet"
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
            <FetchedSourcePanel cp={selected.id} source="metricool" startDate={selected.start_date} internal={!!selected.clients?.is_internal} />
          ) : null}

          <SegmentedPill ariaLabel="Social platform" items={SOCIAL_PLATFORMS.map(({ value, label }) => ({ value, label }))} value={platform} onChange={setPlatform} />

          <MainKpis clientPipelineId={clientPipelineId} month={month} />
          <h2 className="text-section-title font-semibold">All KPIs</h2>
          <section className="card-surface p-5">
            <h2 className="text-section-title font-semibold">
              {SOCIAL_PLATFORMS.find((p) => p.value === platform)?.label} ·{" "}
              {existing ? "Update" : "Add"} {monthLabel(month)}
            </h2>
            <div className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
              <div className="space-y-1.5">
                <Label htmlFor="posts">Posts published</Label>
                <Input
                  id="posts"
                  inputMode="numeric"
                  value={form.posts}
                  onChange={(e) => setForm({ ...form, posts: e.target.value })}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="followers">Followers</Label>
                <Input
                  id="followers"
                  inputMode="numeric"
                  value={form.followers}
                  onChange={(e) => setForm({ ...form, followers: e.target.value })}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="views">Total content views</Label>
                <Input
                  id="views"
                  inputMode="numeric"
                  value={form.content_views}
                  onChange={(e) => setForm({ ...form, content_views: e.target.value })}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="pviews">Profile views</Label>
                <Input
                  id="pviews"
                  inputMode="numeric"
                  value={form.profile_views}
                  onChange={(e) => setForm({ ...form, profile_views: e.target.value })}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="engagement">Engagement</Label>
                <Input
                  id="engagement"
                  inputMode="numeric"
                  value={form.engagement}
                  onChange={(e) => setForm({ ...form, engagement: e.target.value })}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="newf">New followers</Label>
                <Input
                  id="newf"
                  inputMode="numeric"
                  value={form.new_followers}
                  onChange={(e) => setForm({ ...form, new_followers: e.target.value })}
                />
              </div>
            </div>
            <div className="mt-4 space-y-1.5">
              <Label htmlFor="notes">Notes for management</Label>
              <Textarea
                id="notes"
                rows={2}
                value={form.notes}
                onChange={(e) => setForm({ ...form, notes: e.target.value })}
              />
            </div>
            <div className="mt-4 flex flex-wrap items-center gap-2">
              <ConfirmButton onConfirm={() => save.mutateAsync()} doneLabel="Saved" disabled={save.isPending}>
                {save.isPending ? "Saving…" : existing ? "Update month" : "Save month"}
              </ConfirmButton>
              {isManager && existing && existing.status !== "approved" ? (
                <ConfirmButton doneLabel="Approved"
                  variant="outline"
                  onConfirm={async () => {
                    if (!existing.id) return false;
                    const { error } = await supabase
                      .from("social_kpi_entries")
                      .update({ status: "approved", approved_by: user?.id ?? null, approved_at: new Date().toISOString() })
                      .eq("id", existing.id);
                    if (error) {
                      toast.error(error.message);
                      return false;
                    }
                    toast.success("Approved — the hotel can now see this month");
                    void qc.invalidateQueries({ queryKey: ["social-entries", clientPipelineId] });
                    return true;
                  }}
                >
                  <CheckCircle2 className="mr-2 h-4 w-4" /> Approve for client
                </ConfirmButton>
              ) : null}
              {existing ? (
                <StatusBadge status={existing.status ?? "draft"} label={STATUS_LABEL[existing.status ?? "draft"] ?? existing.status ?? "draft"} />
              ) : null}
            </div>
            <p className="mt-2 text-label text-muted-foreground">
              The hotel sees a month only after management approves it. Editing an approved month sends it back for approval.
            </p>
          </section>

          <SocialKpiSection
            title={`Social performance · ${selected?.clients?.hotel_name ?? "Hotel"}`}
            entries={chartEntries}
          />
        </>
      )}
      <MonthlyActivityPlans code="social_media" />
      <PipelineBaselines code="social_media" pipelineId={clientPipelineId || undefined} />
    </div>
  );
}
