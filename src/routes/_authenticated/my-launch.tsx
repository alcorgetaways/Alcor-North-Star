import { ownerUploadError } from "@/lib/form-rules";
import { ExitChecklist } from "@/components/ExitChecklist";
import { useEffect, useState } from "react";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { PageHeader } from "@/components/PageHeader";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { LAUNCH_STATUS_LABEL, fmtDate } from "@/lib/launch";
import { StatusBadge } from "@/components/StatusBadge";
import { ProgressRing } from "@/components/ProgressRing";
import { ConfirmButton } from "@/components/ConfirmButton";
import { PageSkeleton, QueryError } from "@/components/Skeletons";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/_authenticated/my-launch")({
  head: () => ({
    meta: [
      { title: "My Launch — Alcor North Star" },
      { name: "description", content: "Your hotel's launch progress: weeks, gates and what we need from you." },
      { property: "og:title", content: "My Launch — Alcor North Star" },
      { property: "og:description", content: "Your hotel's launch progress and approvals." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: MyLaunch,
});

type MyLaunchData = {
  no_launch_checklist: boolean;
  plan: string;
  status: string;
  day0: string | null;
  launch_date: string | null;
  total_weeks: number;
  week: number;
  upgraded_from: string | null;
  exit_date: string | null;
  progress_pct: number | null;
  gates: Array<{ id: string; client_approved_at: string | null; approval_method: string | null; name: string; due: string; status: string; phase: string | null; phase_name: string | null }> | null;
  waiting_on_you: Array<{ id: string; code: string; name: string; standard: string | null; evidence_url: string | null; requested: string; action_kind: string; locked: boolean }> | null;
  approved_by_you: Array<{ code: string; name: string; approved: string }> | null;
  modules: Array<{ module: string; phase: string | null; phase_name: string | null; done: number; total: number }> | null;
};

function MyLaunch() {
  useAuth();
  const qc = useQueryClient();
  const navigate = useNavigate();
  const [comment, setComment] = useState<Record<string, string>>({});
  const [busyId, setBusyId] = useState<string | null>(null);
  const [openApproved, setOpenApproved] = useState(false);

  async function openEvidence(url: string) {
    if (/^https?:/i.test(url)) {
      window.open(url, "_blank", "noopener");
      return;
    }
    const { data, error } = await supabase.storage.from("client-files").createSignedUrl(url, 300);
    if (error || !data) {
      toast.error("Could not open the file");
      return;
    }
    window.open(data.signedUrl, "_blank", "noopener");
  }

  const launch = useQuery({
    queryKey: ["my-launch"],
    queryFn: async () => {
      const { data, error } = await supabase.rpc("get_my_launch");
      if (error) throw error;
      return (data ?? null) as MyLaunchData | null;
    },
  });

  useEffect(() => {
    if (launch.isLoading) return;
    const status = launch.data?.status;
    if (status && ["live", "closed"].includes(status)) navigate({ to: "/my-growth", replace: true });
  }, [launch.isLoading, launch.data, navigate]);

  if (launch.isLoading) return <PageSkeleton label="Loading your launch" />;
  if (launch.error) return <QueryError error={launch.error} what="your launch" />;

  const l = launch.data;
  if (!l) {
    return (
      <div className="space-y-6">
        <PageHeader title="My Launch" description="Your onboarding status." />
        <div className="rounded-xl border border-dashed border-border p-12 text-center">
          <p className="text-section-title font-semibold">Your onboarding is complete</p>
          <p className="mt-1 text-sm text-muted-foreground">Follow your results in MY GROWTH.</p>
          <Button asChild className="mt-4">
            <Link to="/my-growth">Open MY GROWTH</Link>
          </Button>
        </div>
      </div>
    );
  }

  const waiting = l.waiting_on_you ?? [];

  async function approve(id: string) {
    const { error } = await supabase.rpc("client_approve_task", {
      _task_id: id,
      _note: comment[id]?.trim() ? comment[id].trim() : (null as unknown as string),
    });
    if (error) throw error;
    setComment((c) => ({ ...c, [id]: "" }));
  }

  async function requestChanges(id: string) {
    const note = (comment[id] ?? "").trim();
    if (!note) throw new Error("Please tell the team what to change");
    const { error } = await supabase.rpc("client_request_changes", { _task_id: id, _comment: note });
    if (error) throw error;
    setComment((c) => ({ ...c, [id]: "" }));
  }
  const refresh = () => qc.invalidateQueries({ queryKey: ["my-launch"] });

  return (
    <div className="space-y-6">
      <PageHeader
        title="My Launch"
        description={`${l.plan} · Day 0 ${fmtDate(l.day0)}`}
        actions={<StatusBadge status={l.status} label={LAUNCH_STATUS_LABEL[l.status] ?? "Launch update"} />}
      />

      {l.status === "offboarding" && l.exit_date ? (
        <div className="rounded-xl border border-destructive/40 bg-destructive/10 px-4 py-3 text-sm">
          <span className="font-medium">Serving notice</span> · exit on {fmtDate(l.exit_date)}
        </div>
      ) : null}
      {l.status === "offboarding" ? <ExitChecklist /> : null}
      {l.upgraded_from ? (
        <p className="text-sm text-muted-foreground">Upgraded from {l.upgraded_from}</p>
      ) : null}

      <div className="card-surface flex flex-wrap items-center gap-6 p-5">
        <ProgressRing size="large" value={l.progress_pct ?? null} caption={`Week ${l.week} of ${l.total_weeks}`} label="of onboarding steps done" />
        <div className="space-y-1">
          <p className="text-label-muted">Onboarding steps done</p>
          <p className="text-section-title font-semibold">Waiting on you: {waiting.length}</p>
          <p className="text-label text-muted-foreground">Go-live {fmtDate(l.launch_date)}</p>
        </div>
      </div>

      {waiting.length ? (
        <section className="rounded-xl border border-gold/50 bg-gold/5 p-5">
          <h2 className="text-section-title font-semibold">Waiting on you ({waiting.length})</h2>
          <p className="text-xs text-muted-foreground">These steps need your written approval to close.</p>
          <ul className="mt-3 space-y-3">
            {waiting.map((w) => (
              <li key={w.id} className="rounded-lg border border-border/70 bg-card p-3">
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <p className="text-sm font-medium">{w.code} · {w.name}</p>
                  {w.evidence_url ? (
                    <Button variant="outline" size="sm"
                      onClick={() => openEvidence(w.evidence_url as string)}
                      className="rounded-md border border-gold/50 bg-gold/10 px-2.5 py-1 text-xs font-medium text-foreground transition-colors hover:bg-gold/20"
                    >
                      Open file
                    </Button>
                  ) : null}
                </div>
                {w.locked ? <p className="text-warning-foreground">Locked: waiting for Gate A</p> : null}
                {w.action_kind !== "approval" ? <div className="space-y-2"><Label>Upload requested file</Label><Input type="file" disabled={w.locked || busyId === w.id} accept="application/pdf,image/png,image/jpeg" onChange={async e => {
                  const input = e.currentTarget, file = input.files?.[0];
                  if (!file) return;
                  const invalid = ownerUploadError(file);
                  if (invalid) { toast.error(invalid); input.value = ""; return; }
                  setBusyId(w.id);
                  try {
                    const { data: { user }, error: authError } = await supabase.auth.getUser();
                    if (authError || !user) throw new Error("Please sign in again before uploading");
                    const { data: profile, error: profileError } = await supabase.from("profiles").select("client_id").eq("id", user.id).single();
                    if (profileError) throw profileError;
                    if (!profile?.client_id) throw new Error("No hotel is linked to your account");
                    const path = `${profile.client_id}/owner-input/${crypto.randomUUID()}-${file.name.replace(/[^\w.-]/g,"_")}`;
                    const { error: uploadError } = await supabase.storage.from("client-files").upload(path, file);
                    if (uploadError) throw uploadError;
                    const { error } = await supabase.rpc("owner_launch_upload", { _task: w.id, _path: path });
                    if (error) throw error;
                    toast.success("File recorded"); void qc.invalidateQueries({ queryKey: ["my-launch"] });
                  } catch (error) { toast.error(error instanceof Error ? error.message : "Could not upload the file"); }
                  finally { setBusyId(null); input.value = ""; }
                }} /></div> : null}
                {w.action_kind !== "approval" ? <><Label>Your input</Label><Textarea value={comment[w.id] ?? ""} onChange={e => setComment(c => ({...c,[w.id]:e.target.value}))} /><div className="mt-2"><ConfirmButton size="sm" doneLabel="Sent" disabled={w.locked || busyId === w.id || !comment[w.id]?.trim()} onConfirm={() => supabase.rpc("owner_launch_input",{_task:w.id,_input:comment[w.id] ?? ""})} onDone={refresh}>Submit input</ConfirmButton></div></> : null}
                {w.standard ? <p className="mt-1.5 whitespace-pre-line text-xs text-muted-foreground">{w.standard}</p> : null}
                {w.action_kind === "approval" ? <><Textarea
                  rows={2}
                  placeholder="Optional comment"
                  className="mt-2"
                  value={comment[w.id] ?? ""}
                  onChange={(e) => setComment((c) => ({ ...c, [w.id]: e.target.value }))}
                />
                <div className="mt-2 flex flex-wrap items-start gap-2">
                  <ConfirmButton size="sm" doneLabel="Approved" onConfirm={() => approve(w.id)} onDone={refresh} disabled={w.locked || !w.evidence_url}>
                    Approve
                  </ConfirmButton>
                  <ConfirmButton size="sm" variant="outline" doneLabel="Sent" onConfirm={() => requestChanges(w.id)} onDone={refresh} disabled={w.locked}>
                    Request changes
                  </ConfirmButton>
                </div>
                {!w.evidence_url && !w.locked ? <p className="mt-1 text-label text-muted-foreground">Waiting for the team's evidence file before you can approve.</p> : null}
                </> : null}
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      {(l.approved_by_you ?? []).length ? (
        <section className="space-y-2">
          <button onClick={() => setOpenApproved((v) => !v)} className="flex items-center gap-1.5 text-section-title font-semibold">
            {openApproved ? "▾" : "▸"} Approved by you
            <span className="text-sm font-normal text-muted-foreground">({(l.approved_by_you ?? []).length})</span>
          </button>
          {openApproved ? (
            <div className="card-surface overflow-hidden">
              {(l.approved_by_you ?? []).map((a, i) => (
                <div key={i} className={cn("flex items-center justify-between gap-3 px-4 py-2.5 text-sm", i > 0 && "border-t border-border/70")}>
                  <span><span className="text-muted-foreground">{a.code}</span> · {a.name}</span>
                  <span className="text-xs text-muted-foreground">{fmtDate(a.approved)}</span>
                </div>
              ))}
            </div>
          ) : null}
        </section>
      ) : null}

      <section className="space-y-2">
        <h2 className="text-section-title font-semibold">Gates</h2>
        <div className="grid gap-2 sm:grid-cols-2">
          {(l.gates ?? []).map((g, i) => (
            <div key={i} className="card-surface p-5 text-small">
              {g.phase_name ? <p className="text-label-muted">{g.phase_name}</p> : null}
              <p className="mt-1 font-medium">{g.name}</p>
              <p className="mt-1 text-label text-muted-foreground">Due {fmtDate(g.due)}</p>
              {g.status === "ready" && !g.client_approved_at ? <div className="mt-2"><ConfirmButton size="sm" doneLabel="Approved" onConfirm={() => supabase.rpc("client_approve_gate",{_gate:g.id})} onDone={refresh}>Approve</ConfirmButton></div> : null}
              {g.client_approved_at ? <p className="text-success">Approved in your login</p> : null}
              <StatusBadge className="mt-2" status={g.status} label={g.status.replace(/[-_]+/g, " ").replace(/^./, (c) => c.toUpperCase())} />
            </div>
          ))}
          {!l.gates?.length ? <p className="text-sm text-muted-foreground">Gates appear once your launch starts.</p> : null}
        </div>
      </section>

    </div>
  );
}
