import { Fragment } from "react";
import { todayIST } from "@/lib/launch";
import { istToday } from "@/lib/form-rules";
import { toast } from "sonner";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Bell, CheckCheck } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { PageHeader } from "@/components/PageHeader";
import { EmptyState } from "@/components/EmptyState";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { Switch } from "@/components/ui/switch";
import { useAuth } from "@/hooks/useAuth";

export const Route = createFileRoute("/_authenticated/notifications")({
  head: () => ({
    meta: [
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
      { title: "Notifications — Alcor North Star" },
      { name: "description", content: "Approvals, submissions and alerts across your portfolio." },
      { property: "og:title", content: "Notifications — Alcor North Star" },
      { property: "og:description", content: "Approvals, submissions and alerts." },
    ],
  }),
  component: NotificationsPage,
});

function NotificationsPage() {
  const qc = useQueryClient();
  const navigate = useNavigate();
  const { data = [] } = useQuery({
    queryKey: ["notifications"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("notifications")
        .select("*")
        .order("created_at", { ascending: false })
        .limit(100);
      if (error) throw error;
      return data;
    },
  });

  const { user, isStaff, isClient } = useAuth();
  const { data: wantsEmail } = useQuery({
    queryKey: ["task-reminder-pref", user?.id],
    enabled: !!user && isStaff && !isClient,
    queryFn: async () => {
      const { data, error } = await supabase.from("profiles").select("email_task_reminders").eq("id", user!.id).maybeSingle();
      if (error) throw error;
      return data?.email_task_reminders ?? true;
    },
  });
  const setPref = useMutation({
    mutationFn: async (on: boolean) => {
      const { data, error } = await supabase.from("profiles").update({ email_task_reminders: on }).eq("id", user!.id).select("id");
      if (error) throw error;
      if (!data?.length) throw new Error("Could not save your reminder setting");
    },
    onSuccess: (_d, on) => {
      toast.success(on ? "Task reminder emails on" : "Task reminder emails off — reminders still appear here");
      void qc.invalidateQueries({ queryKey: ["task-reminder-pref"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const markAll = useMutation({
    mutationFn: async () => {
      const { error } = await supabase
        .from("notifications")
        .update({ read_at: new Date().toISOString() })
        .is("read_at", null);
      if (error) throw error;
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["notifications"] });
      void qc.invalidateQueries({ queryKey: ["notifications-bell"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <div className="space-y-6">
      <PageHeader
        title={`Notifications · ${data.filter((n) => !n.read_at).length} unread`}
        description="Everything that needs your attention, newest first."
        actions={
          <Button variant="outline" size="sm" onClick={() => markAll.mutate()}>
            <CheckCheck className="mr-2 h-4 w-4" /> Mark all read
          </Button>
        }
      />
      {isStaff && !isClient && wantsEmail !== undefined ? (
        <label className="card-surface flex items-center justify-between gap-4 p-4">
          <span>
            <span className="block font-medium">Email me task reminders</span>
            <span className="block text-small text-muted-foreground">Overdue, due today and next 2 working days — 11:00, 15:00 and 18:00 IST, Mon–Sat. Reminders always appear here too.</span>
          </span>
          <Switch checked={wantsEmail} disabled={setPref.isPending} onCheckedChange={(v) => setPref.mutate(v)} aria-label="Email me task reminders" />
        </label>
      ) : null}
      <div className="space-y-2">
        {data.length === 0 ? (
          <EmptyState icon={Bell} title="You're all caught up." className="card-surface" />
        ) : (
          data.map((n, i) => (
            <Fragment key={n.id}>
            {i === 0 || istToday(new Date(n.created_at)) === todayIST() && istToday(new Date(data[i-1]?.created_at ?? n.created_at)) !== todayIST() || istToday(new Date(n.created_at)) !== todayIST() && istToday(new Date(data[i-1]?.created_at ?? n.created_at)) === todayIST() ? <h2 className="pt-3 text-sm font-semibold">{istToday(new Date(n.created_at)) === todayIST() ? "Today" : "Earlier"}</h2> : null}
            <button
              key={n.id}
              onClick={async () => {
                if (!n.read_at) {
                  await supabase.from("notifications").update({ read_at: new Date().toISOString() }).eq("id", n.id);
                  qc.invalidateQueries({ queryKey: ["notifications"] });
                }
                if (n.link) navigate({ to: n.link });
              }}
              className={cn(
                "block w-full rounded-lg border border-border/70 bg-card px-4 py-3 text-left",
                !n.read_at && "border-gold/40 bg-gold/5",
              )}
            >
              <div className="flex items-start justify-between gap-4">
                <div>
                  <p className="text-sm font-medium">{n.title}</p>
                  {n.body ? (
                    <p className="mt-0.5 whitespace-pre-line text-sm text-muted-foreground">{n.body}</p>
                  ) : null}
                </div>
                <span className="shrink-0 text-xs text-muted-foreground">
                  {new Date(n.created_at).toLocaleDateString("en-IN", {
                    day: "2-digit",
                    month: "short",
                  })}
                </span>
              </div>
            </button></Fragment>
          ))
        )}
      </div>
    </div>
  );
}
