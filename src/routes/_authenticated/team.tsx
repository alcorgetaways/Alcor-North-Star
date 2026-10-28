import { useEffect, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ChevronsUpDown, KeyRound, Loader2, RefreshCw, ShieldOff, UserPlus } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { banUser, transferTeamMemberWork, unbanUser } from "@/lib/team.functions";
import { fetchActiveStaff } from "@/lib/staff";
import { inviteUser, setUserRole, setTemporaryPassword } from "@/lib/admin.functions";
import { importStaff, type ImportRow } from "@/lib/staff-import.functions";
import { importClients, type ClientImportReport } from "@/lib/client-import.functions";
import { PageHeader } from "@/components/PageHeader";
import { DataTable } from "@/components/DataTable";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { LAUNCH_ROLES, ROLE_LABELS, ROLE_OPTIONS, type AppRole } from "@/lib/constants";
import { useAuth } from "@/hooks/useAuth";

export const Route = createFileRoute("/_authenticated/team")({
  head: () => ({
    meta: [
      { title: "Team — Alcor North Star" },
      { name: "description", content: "Manage internal users, roles and client portal accounts." },
      { property: "og:title", content: "Team — Alcor North Star" },
      { property: "og:description", content: "Manage internal users and roles." },
    ],
  }),
  component: TeamPage,
});

type Member = {
  id: string;
  full_name: string;
  email: string | null;
  mobile: string | null;
  department: string | null;
  status: string;
  client_id: string | null;
  launch_roles: string[] | null;
  roles: AppRole[];
};

type Workload = {
  modules: Array<{ module: string; name: string; owner_role: string; launches: number }>;
  open_tasks: number;
  pipelines: number;
  open_actions: number;
};

function TeamPage() {
  const qc = useQueryClient();
  const { user, isManager, isBD, isAdmin } = useAuth();
  const [pwTarget, setPwTarget] = useState<{ id: string; name: string } | null>(null);
  const [tempPw, setTempPw] = useState("");
  const [deactivateTarget, setDeactivateTarget] = useState<Member | null>(null);
  const [importResult, setImportResult] = useState<{
    rows: ImportRow[];
    counts: Record<string, number>;
    membershipNotes: string[];
  } | null>(null);
  const importMutation = useMutation({
    mutationFn: async (dryRun: boolean) => importStaff({ data: { dry_run: dryRun } }),
    onSuccess: (res) => {
      setImportResult(res);
      qc.invalidateQueries({ queryKey: ["team"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });
  const [clientImportResult, setClientImportResult] = useState<ClientImportReport | null>(null);
  const clientImportMutation = useMutation({
    mutationFn: async (dryRun: boolean) => importClients({ data: { dry_run: dryRun } }),
    onSuccess: (res) => {
      setClientImportResult(res);
      qc.invalidateQueries({ queryKey: ["clients"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });
  const resetPw = useMutation({
    mutationFn: async () => setTemporaryPassword({ data: { user_id: pwTarget!.id, password: tempPw } }),
    onSuccess: () => {
      toast.success(`Temporary password set for ${pwTarget?.name}. Share it privately.`);
      setPwTarget(null);
      setTempPw("");
    },
    onError: (e: Error) => toast.error(e.message),
  });
  const reactivate = useMutation({
    mutationFn: async (m: Member) => {
      await unbanUser({ data: { user_id: m.id } });
      const { error } = await supabase.rpc("reactivate_team_member", { _user: m.id });
      if (error) throw error;
    },
    onSuccess: (_v, m) => {
      toast.success(`${m.full_name} is active again`);
      qc.invalidateQueries({ queryKey: ["team"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });
  const clientOnly = !isManager && isBD;
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({
    full_name: "",
    email: "",
    password: "",
    mobile: "",
    department: "",
    role: "team_member" as AppRole,
    client_id: "",
  });

  const { data: members = [] } = useQuery({
    queryKey: ["team"],
    queryFn: async () => {
      const [{ data: profiles, error }, { data: roles }] = await Promise.all([
        supabase
          .from("profiles")
          .select("id, full_name, email, mobile, department, status, client_id, launch_roles")
          .order("full_name"),
        supabase.from("user_roles").select("user_id, role"),
      ]);
      if (error) throw error;
      return (profiles ?? []).map((p) => ({
        ...p,
        roles: (roles ?? []).filter((r) => r.user_id === p.id).map((r) => r.role as AppRole),
      })) as Member[];
    },
  });

  const { data: clients = [] } = useQuery({
    queryKey: ["clients-mini"],
    queryFn: async () => {
      const { data, error } = await supabase.from("clients").select("id, hotel_name").order("hotel_name");
      if (error) throw error;
      return data;
    },
  });

  const invite = useMutation({
    mutationFn: async () =>
      inviteUser({
        data: {
          email: form.email,
          password: form.password,
          full_name: form.full_name,
          mobile: form.mobile || null,
          department: form.department || null,
          role: form.role,
          client_id: form.role === "client" && form.client_id ? form.client_id : null,
        },
      }),
    onSuccess: () => {
      toast.success("User created");
      setOpen(false);
      setForm({ ...form, full_name: "", email: "", password: "", mobile: "" });
      qc.invalidateQueries({ queryKey: ["team"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const setLaunchRoles = useMutation({
    mutationFn: async (v: { user_id: string; launch_roles: string[] }) => {
      const { error } = await supabase.from("profiles").update({ launch_roles: v.launch_roles }).eq("id", v.user_id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Launch roles updated");
      void qc.invalidateQueries({ queryKey: ["team"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const changeRole = useMutation({
    mutationFn: async (v: { user_id: string; role: AppRole }) => setUserRole({ data: v }),
    onSuccess: () => {
      toast.success("Role updated");
      qc.invalidateQueries({ queryKey: ["team"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const roleCell = (m: Member) =>
    isManager && m.status !== "inactive" ? (
      <div className="flex flex-wrap items-center gap-1.5">
        <Select
          value={m.roles[0] ?? ""}
          onValueChange={(v) => changeRole.mutate({ user_id: m.id, role: v as AppRole })}
        >
          <SelectTrigger className="h-8 w-40">
            <SelectValue placeholder={m.roles.length ? ROLE_LABELS[m.roles[0]!] : "No role"} />
          </SelectTrigger>
          <SelectContent>
            {ROLE_OPTIONS.map((r) => (
              <SelectItem key={r.value} value={r.value}>
                {r.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        {m.roles.slice(1).map((r) => (
          <Badge key={r} variant="secondary" className="text-label">
            {ROLE_LABELS[r]}
          </Badge>
        ))}
      </div>
    ) : (
      <div className="flex flex-wrap gap-1">
        {m.roles.map((r) => (
          <Badge key={r} variant="secondary">
            {ROLE_LABELS[r]}
          </Badge>
        )) || <span className="text-xs text-muted-foreground">No role</span>}
      </div>
    );

  const launchRolesCell = (m: Member) =>
    isManager && m.status !== "inactive" ? (
      <LaunchRolesPicker
        value={(m.launch_roles as string[] | null) ?? []}
        onSave={(roles) => setLaunchRoles.mutate({ user_id: m.id, launch_roles: roles })}
      />
    ) : (
      <span className="text-xs text-muted-foreground">
        {((m.launch_roles as string[] | null) ?? []).map((r) => LAUNCH_ROLES.find((x) => x.value === r)?.label ?? r).join(", ") || "—"}
      </span>
    );

  const actionsCell = (m: Member) => {
    const inactive = m.status === "inactive";
    if (!isAdmin && !isManager) return null;
    return (
      <div className="flex flex-wrap justify-end gap-2 md:justify-start">
        {isAdmin ? (
          <Button variant="outline" size="sm" disabled={inactive} onClick={() => setPwTarget({ id: m.id, name: m.full_name })}>
            <KeyRound className="h-3.5 w-3.5" /> Set password
          </Button>
        ) : null}
        {isManager && !m.roles.includes("client") ? (
          inactive ? (
            <Button variant="outline" size="sm" disabled={reactivate.isPending} onClick={() => reactivate.mutate(m)}>
              {reactivate.isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="h-3.5 w-3.5" />}
              Reactivate
            </Button>
          ) : (
            <Button
              variant="outline"
              size="sm"
              disabled={m.id === user?.id}
              title={m.id === user?.id ? "You cannot deactivate your own account" : undefined}
              onClick={() => setDeactivateTarget(m)}
            >
              <ShieldOff className="h-3.5 w-3.5" /> Deactivate
            </Button>
          )
        ) : null}
      </div>
    );
  };

  return (
    <div className="space-y-6">
      <PageHeader
        title="Team"
        description={
          clientOnly
            ? "Create and review hotel client portal logins for the hotels you onboard."
            : "Internal users and client portal accounts. Management grants access to team leaders and every internal role."
        }
        actions={
          isManager || isBD ? (
            <div className="flex items-center gap-2">
              {isAdmin ? (
                <>
                  <Button
                    size="sm"
                    variant="outline"
                    disabled={importMutation.isPending}
                    onClick={() => importMutation.mutate(true)}
                  >
                    Preview import
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    disabled={importMutation.isPending}
                    onClick={() => importMutation.mutate(false)}
                  >
                    {importMutation.isPending ? (
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    ) : null}
                    Import staff
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    disabled={clientImportMutation.isPending}
                    onClick={() => clientImportMutation.mutate(true)}
                  >
                    Preview client import
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    disabled={clientImportMutation.isPending}
                    onClick={() => clientImportMutation.mutate(false)}
                  >
                    {clientImportMutation.isPending ? (
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    ) : null}
                    Import clients
                  </Button>
                </>
              ) : null}
            <Dialog
              open={open}
              onOpenChange={(v) => {
                setOpen(v);
                if (v && clientOnly) setForm((f) => ({ ...f, role: "client" }));
              }}
            >
              <DialogTrigger asChild>
                <Button size="sm">
                  <UserPlus className="mr-2 h-4 w-4" />
                  {clientOnly ? "Create client login" : "Add user"}
                </Button>
              </DialogTrigger>
              <DialogContent>
                <DialogHeader>
                  <DialogTitle>
                    {clientOnly ? "Create a client portal login" : "Add a user"}
                  </DialogTitle>
                </DialogHeader>
                <div className="grid gap-4">
                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label>Full name</Label>
                      <Input
                        value={form.full_name}
                        onChange={(e) => setForm({ ...form, full_name: e.target.value })}
                      />
                    </div>
                    <div className="space-y-2">
                      <Label>Mobile</Label>
                      <Input
                        value={form.mobile}
                        onChange={(e) => setForm({ ...form, mobile: e.target.value })}
                      />
                    </div>
                  </div>
                  <div className="space-y-2">
                    <Label>Email</Label>
                    <Input
                      type="email"
                      value={form.email}
                      onChange={(e) => setForm({ ...form, email: e.target.value })}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>Temporary password</Label>
                    <Input
                      value={form.password}
                      onChange={(e) => setForm({ ...form, password: e.target.value })}
                      placeholder="Minimum 8 characters"
                    />
                  </div>
                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label>Role</Label>
                      {clientOnly ? (
                        <div className="flex h-9 items-center rounded-md border border-input px-3 text-sm text-muted-foreground">
                          {ROLE_LABELS["client"]}
                        </div>
                      ) : (
                        <Select
                          value={form.role}
                          onValueChange={(v) => setForm({ ...form, role: v as AppRole })}
                        >
                          <SelectTrigger>
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            {ROLE_OPTIONS.map((r) => (
                              <SelectItem key={r.value} value={r.value}>
                                {r.label}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      )}
                    </div>
                    <div className="space-y-2">
                      <Label>Department</Label>
                      <Input
                        value={form.department}
                        onChange={(e) => setForm({ ...form, department: e.target.value })}
                      />
                    </div>
                  </div>
                  {form.role === "client" ? (
                    <div className="space-y-2">
                      <Label>Linked hotel</Label>
                      <Select
                        value={form.client_id}
                        onValueChange={(v) => setForm({ ...form, client_id: v })}
                      >
                        <SelectTrigger>
                          <SelectValue placeholder="Select hotel" />
                        </SelectTrigger>
                        <SelectContent>
                          {clients.map((c) => (
                            <SelectItem key={c.id} value={c.id}>
                              {c.hotel_name}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                  ) : null}
                </div>
                <DialogFooter>
                  <Button
                    onClick={() => invite.mutate()}
                    disabled={
                      invite.isPending ||
                      !form.full_name ||
                      !form.email ||
                      form.password.length < 8 ||
                      (form.role === "client" && !form.client_id)
                    }
                  >
                    {clientOnly ? "Create client login" : "Create user"}
                  </Button>
                </DialogFooter>
              </DialogContent>
            </Dialog>
            </div>
          ) : null
        }
      />

      <Dialog open={Boolean(importResult)} onOpenChange={(o) => { if (!o) setImportResult(null); }}>
        <DialogContent className="max-h-[80vh] overflow-y-auto sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle>Staff import results</DialogTitle>
          </DialogHeader>
          {importResult ? (
            <div className="space-y-4 text-sm">
              <div className="flex flex-wrap gap-2">
                {(["created", "already_exists", "updated", "skipped", "failed"] as const).map((k) => (
                  <Badge key={k} variant={k === "failed" ? "destructive" : "secondary"}>
                    {k.replace("_", " ")}: {importResult.counts[k] ?? 0}
                  </Badge>
                ))}
              </div>
              <DataTable
                className="rounded-none border-0 bg-transparent shadow-none"
                rows={importResult.rows}
                rowKey={(r) => r.email}
                columns={[
                  { key: "name", header: "Name", render: (r) => <span className="font-medium">{r.name}</span> },
                  { key: "email", header: "Email", render: (r) => <span className="text-muted-foreground">{r.email}</span> },
                  { key: "result", header: "Result", render: (r) => r.status.replace("_", " ") },
                  { key: "reason", header: "Reason", render: (r) => <span className="text-muted-foreground">{r.reason}</span> },
                ]}
              />
              {importResult.membershipNotes.length ? (
                <div className="space-y-1">
                  <p className="font-medium">Membership notes</p>
                  {importResult.membershipNotes.map((n, i) => (
                    <p key={i} className="text-xs text-muted-foreground">{n}</p>
                  ))}
                </div>
              ) : null}
              <p className="text-xs text-muted-foreground">
                New accounts must change their password at first sign-in. No emails were sent.
              </p>
            </div>
          ) : null}
        </DialogContent>
      </Dialog>

      <Dialog open={Boolean(clientImportResult)} onOpenChange={(o) => { if (!o) setClientImportResult(null); }}>
        <DialogContent className="max-h-[80vh] overflow-y-auto sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle>
              Client import results{clientImportResult?.dry_run ? " (dry run — nothing written)" : ""}
            </DialogTitle>
          </DialogHeader>
          {clientImportResult ? (
            <div className="space-y-4 text-sm">
              <div className="flex flex-wrap gap-2">
                <Badge variant="secondary">rows read: {clientImportResult.rows_read}</Badge>
                <Badge variant="secondary">clients created: {clientImportResult.clients.created}</Badge>
                <Badge variant="secondary">clients existing: {clientImportResult.clients.existing}</Badge>
                <Badge variant="secondary">launches created: {clientImportResult.launches.created}</Badge>
                <Badge variant="secondary">rows merged: {clientImportResult.rows_merged_into_existing_clients}</Badge>
                <Badge variant="secondary">custom plans: {clientImportResult.custom_plans.created}</Badge>
                <Badge variant="secondary">standard matched: {clientImportResult.custom_plans.standard_matched}</Badge>
                <Badge variant={clientImportResult.errors.length ? "destructive" : "secondary"}>
                  errors: {clientImportResult.errors.length}
                </Badge>
              </div>
              <div className="flex flex-wrap gap-2">
                <Badge variant="secondary">owner logins created: {clientImportResult.owner_logins.created}</Badge>
                <Badge variant="secondary">reused: {clientImportResult.owner_logins.reused}</Badge>
                <Badge variant="secondary">skipped: {clientImportResult.owner_logins.skipped}</Badge>
                <Badge variant={clientImportResult.owner_logins.failed ? "destructive" : "secondary"}>
                  failed: {clientImportResult.owner_logins.failed}
                </Badge>
              </div>
              {clientImportResult.owner_logins.rows.length ? (
                <DataTable
                  className="rounded-none border-0 bg-transparent shadow-none"
                  rows={clientImportResult.owner_logins.rows}
                  rowKey={(r) => r.email}
                  columns={[
                    { key: "client", header: "Client", render: (r) => <span className="font-medium">{r.client}</span> },
                    { key: "email", header: "Email", render: (r) => <span className="text-muted-foreground">{r.email}</span> },
                    { key: "result", header: "Result", render: (r) => r.status },
                    { key: "reason", header: "Reason", render: (r) => <span className="text-muted-foreground">{r.reason}</span> },
                  ]}
                />
              ) : null}
              {clientImportResult.shared_contacts_kept_separate.length ? (
                <div className="space-y-1">
                  <p className="font-medium">Shared contact, kept separate</p>
                  {clientImportResult.shared_contacts_kept_separate.map((s, i) => (
                    <p key={i} className="text-xs text-muted-foreground">{s}</p>
                  ))}
                </div>
              ) : null}
              {clientImportResult.flags.length ? (
                <div className="space-y-1">
                  <p className="font-medium">Flagged values ({clientImportResult.flags.length})</p>
                  {clientImportResult.flags.map((f, i) => (
                    <p key={i} className="text-xs text-muted-foreground">{f}</p>
                  ))}
                </div>
              ) : null}
              {clientImportResult.errors.length ? (
                <div className="space-y-1">
                  <p className="font-medium text-destructive">Errors</p>
                  {clientImportResult.errors.map((e, i) => (
                    <p key={i} className="text-xs text-destructive">{e}</p>
                  ))}
                </div>
              ) : null}
              <p className="text-xs text-muted-foreground">
                New owner accounts must change their password at first sign-in. No emails were sent.
              </p>
            </div>
          ) : null}
        </DialogContent>
      </Dialog>

      {/* Desktop table */}
      <DataTable<Member>
        className="hidden md:block"
        rows={members}
        rowKey={(m) => m.id}
        columns={[
          {
            key: "name",
            header: "Name",
            render: (m) => (
              <span className={m.status === "inactive" ? "opacity-50" : undefined}>
                <span className="font-medium">{m.full_name}</span>
                {m.status === "inactive" ? (
                  <Badge variant="secondary" className="ml-2 text-label">
                    Inactive
                  </Badge>
                ) : null}
              </span>
            ),
          },
          { key: "email", header: "Email", render: (m) => <span className="text-muted-foreground">{m.email}</span> },
          { key: "department", header: "Department", render: (m) => <span className="text-muted-foreground">{m.department || "—"}</span> },
          { key: "role", header: "Role", render: (m) => roleCell(m) },
          { key: "launchroles", header: "Launch roles", render: (m) => launchRolesCell(m) },
          { key: "actions", header: "Actions", align: "right", render: (m) => actionsCell(m) },
        ]}
      />

      {/* Mobile cards */}
      <div className="space-y-3 md:hidden">
        {members.map((m) => {
          const inactive = m.status === "inactive";
          return (
            <div key={m.id} className={inactive ? "space-y-3 card-surface p-5 opacity-60" : "space-y-3 card-surface p-5"}>
              <div>
                <p className="font-medium">
                  {m.full_name}
                  {inactive ? (
                    <Badge variant="secondary" className="ml-2 text-label">
                      Inactive
                    </Badge>
                  ) : null}
                </p>
                <p className="text-xs text-muted-foreground">{m.email}</p>
                {m.department ? <p className="text-xs text-muted-foreground">{m.department}</p> : null}
              </div>
              {roleCell(m)}
              {launchRolesCell(m)}
              <div className="flex flex-wrap gap-2">{actionsCell(m)}</div>
            </div>
          );
        })}
      </div>

      <PipelineTeams staff={members} />

      <DeactivateDialog
        member={deactivateTarget}
        onClose={() => setDeactivateTarget(null)}
        onDone={() => {
          setDeactivateTarget(null);
          qc.invalidateQueries({ queryKey: ["team"] });
        }}
      />

      <Dialog open={Boolean(pwTarget)} onOpenChange={(o) => { if (!o) { setPwTarget(null); setTempPw(""); } }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Set temporary password · {pwTarget?.name}</DialogTitle>
          </DialogHeader>
          <div className="space-y-2">
            <Label htmlFor="temp-pw">New password (min 8 characters)</Label>
            <div className="flex gap-2">
              <Input id="temp-pw" value={tempPw} onChange={(e) => setTempPw(e.target.value)} autoComplete="off" />
              <Button type="button" variant="outline" onClick={() => {
                const c = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789";
                const a = crypto.getRandomValues(new Uint32Array(12));
                setTempPw(Array.from(a, (n) => c[n % c.length]).join(""));
              }}>Generate</Button>
            </div>
            <p className="text-xs text-muted-foreground">Copy it now — it can't be shown again. Their old password stops working immediately.</p>
          </div>
          <DialogFooter>
            <Button onClick={() => resetPw.mutate()} disabled={tempPw.length < 8 || resetPw.isPending}>
              {resetPw.isPending ? "Saving…" : "Set password"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

/** Pipeline heads, members and external vendors. Managers edit any pipeline; a head edits only their own (RLS enforces it). */
function PipelineTeams({ staff }: { staff: Member[] }) {
  const qc = useQueryClient();
  const { user, isManager } = useAuth();
  const [pick, setPick] = useState<Record<string, { user: string; role: string }>>({});
  const [vendorName, setVendorName] = useState<Record<string, string>>({});

  const { data: pipelines = [] } = useQuery({
    queryKey: ["pipelines-all"],
    queryFn: async () => {
      const { data, error } = await supabase.from("pipelines").select("id, code, name, client_facing").eq("active", true).order("sort_order");
      if (error) throw error;
      return data;
    },
  });
  const { data: memberships = [] } = useQuery({
    queryKey: ["pipeline-members"],
    queryFn: async () => {
      const { data, error } = await supabase.from("pipeline_members").select("id, user_id, pipeline_id, role, backup_id").eq("active", true);
      if (error) throw error;
      return data;
    },
  });
  const { data: vendors = [] } = useQuery({
    queryKey: ["pipeline-vendors"],
    queryFn: async () => {
      const { data, error } = await supabase.from("pipeline_vendors").select("id, pipeline_id, name, note");
      if (error) throw error;
      return data;
    },
  });

  const refresh = () => {
    qc.invalidateQueries({ queryKey: ["pipeline-members"] });
    qc.invalidateQueries({ queryKey: ["pipeline-vendors"] });
  };
  const addMember = useMutation({
    mutationFn: async (v: { pipeline_id: string; user_id: string; role: string }) => {
      const { error } = await supabase.from("pipeline_members").insert({ ...v, source: "manual" });
      if (error) throw error;
    },
    onSuccess: () => { refresh(); toast.success("Added to pipeline"); },
    onError: (e: Error) => toast.error(e.message),
  });
  const setBackup = useMutation({
    mutationFn: async (v: { member: string; backup: string }) => {
      const { error } = await supabase.rpc("set_pipeline_backup", { _member: v.member, _backup: v.backup });
      if (error) throw error;
    },
    onSuccess: () => { refresh(); toast.success("Pipeline backup updated"); },
    onError: (e: Error) => toast.error(e.message),
  });
  const removeMember = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("pipeline_members").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: refresh,
    onError: (e: Error) => toast.error(e.message),
  });
  const addVendor = useMutation({
    mutationFn: async (v: { pipeline_id: string; name: string }) => {
      const { error } = await supabase.from("pipeline_vendors").insert(v);
      if (error) throw error;
    },
    onSuccess: () => { refresh(); toast.success("Vendor added"); },
    onError: (e: Error) => toast.error(e.message),
  });
  const removeVendor = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("pipeline_vendors").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: refresh,
    onError: (e: Error) => toast.error(e.message),
  });

  const myHeadIds = new Set(memberships.filter((m) => m.user_id === user?.id && m.role === "head").map((m) => m.pipeline_id));
  const canManage = (pid: string) => isManager || myHeadIds.has(pid);
  const staffName = (id: string) => staff.find((s) => s.id === id)?.full_name ?? "Unknown";

  return (
    <section className="space-y-3">
      <h2 className="text-section-title font-semibold">Pipeline teams</h2>
      <div className="grid gap-3 md:grid-cols-2">
        {pipelines.map((p) => {
          const ms = memberships.filter((m) => m.pipeline_id === p.id);
          const vs = vendors.filter((v) => v.pipeline_id === p.id);
          const heads = ms.filter((m) => m.role === "head");
          const members = ms.filter((m) => m.role === "team_member");
          const editable = canManage(p.id);
          const sel = pick[p.id] ?? { user: "", role: "team_member" };
          return (
            <div key={p.id} className="space-y-2 rounded-lg border border-border/70 bg-card p-4 text-sm">
              <p className="font-medium">{p.name}{p.client_facing === false ? <span className="ml-2 text-label-muted">internal</span> : null}</p>
              {ms.length === 0 ? (
                <p className="text-xs text-muted-foreground">No team member assigned yet.</p>
              ) : (
                <ul className="space-y-1 text-xs">
                  {heads.map((m) => (
                    <li key={m.id} className="flex items-center gap-2">
                      <Badge variant="secondary" className="text-label">Head</Badge>
                      {staffName(m.user_id)}
                      {editable ? (
                        <button type="button" className="text-muted-foreground hover:text-destructive" onClick={() => removeMember.mutate(m.id)}>✕</button>
                      ) : null}
                    </li>
                  ))}
                  {members.map((m) => (
                    <li key={m.id} className="flex items-center gap-2">
                      <Badge variant="outline" className="text-label">Member</Badge>
                      {staffName(m.user_id)}
                      {myHeadIds.has(p.id) ? <Select value={m.backup_id ?? heads[0]?.user_id ?? ""} onValueChange={backup => setBackup.mutate({ member: m.id, backup })}><SelectTrigger aria-label={`Backup for ${staffName(m.user_id)}`} className="w-40"><SelectValue placeholder="Backup"/></SelectTrigger><SelectContent>{ms.map(person => <SelectItem key={person.id} value={person.user_id}>{staffName(person.user_id)}</SelectItem>)}</SelectContent></Select> : <span className="text-muted-foreground">Backup: {m.backup_id ? staffName(m.backup_id) : heads[0] ? staffName(heads[0].user_id) : '—'}</span>}
                      {editable ? (
                        <button type="button" className="text-muted-foreground hover:text-destructive" onClick={() => removeMember.mutate(m.id)}>✕</button>
                      ) : null}
                    </li>
                  ))}
                </ul>
              )}
              {vs.length ? (
                <p className="text-xs text-muted-foreground">
                  Vendors:{" "}
                  {vs.map((v, i) => (
                    <span key={v.id}>
                      {i > 0 ? ", " : ""}
                      {v.name}{v.note ? ` (${v.note})` : ""}
                      {editable ? (
                        <button type="button" className="ml-1 hover:text-destructive" onClick={() => removeVendor.mutate(v.id)}>✕</button>
                      ) : null}
                    </span>
                  ))}
                </p>
              ) : null}
              {editable ? (
                <div className="flex flex-wrap items-center gap-2 border-t border-border/60 pt-2">
                  <Select value={sel.user} onValueChange={(u) => setPick({ ...pick, [p.id]: { ...sel, user: u } })}>
                    <SelectTrigger className="h-8 w-40"><SelectValue placeholder="Person" /></SelectTrigger>
                    <SelectContent>
                      {staff.filter((s) => s.status === "active" && !s.client_id).map((s) => (
                        <SelectItem key={s.id} value={s.id}>{s.full_name}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <Select value={sel.role} onValueChange={(r) => setPick({ ...pick, [p.id]: { ...sel, role: r } })}>
                    <SelectTrigger className="h-8 w-32"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="head">Head</SelectItem>
                      <SelectItem value="team_member">Member</SelectItem>
                    </SelectContent>
                  </Select>
                  <Button
                    size="sm"
                    variant="outline"
                    disabled={!sel.user || addMember.isPending}
                    onClick={() => addMember.mutate({ pipeline_id: p.id, user_id: sel.user, role: sel.role })}
                  >
                    Add
                  </Button>
                  <Input
                    className="h-8 w-32"
                    placeholder="Vendor name"
                    value={vendorName[p.id] ?? ""}
                    onChange={(e) => setVendorName({ ...vendorName, [p.id]: e.target.value })}
                  />
                  <Button
                    size="sm"
                    variant="ghost"
                    disabled={!(vendorName[p.id] ?? "").trim() || addVendor.isPending}
                    onClick={() => {
                      addVendor.mutate({ pipeline_id: p.id, name: vendorName[p.id]!.trim() });
                      setVendorName({ ...vendorName, [p.id]: "" });
                    }}
                  >
                    Add vendor
                  </Button>
                </div>
              ) : null}
            </div>
          );
        })}
      </div>
    </section>
  );
}

function LaunchRolesPicker({ value, onSave }: { value: string[]; onSave: (roles: string[]) => void }) {
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState<string[]>(value);

  useEffect(() => {
    if (open) setDraft(value);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  function commit(nextOpen: boolean) {
    if (open && !nextOpen) {
      const same = draft.length === value.length && draft.every((r) => value.includes(r));
      if (!same) onSave(draft);
    }
    setOpen(nextOpen);
  }

  return (
    <Popover open={open} onOpenChange={commit}>
      <PopoverTrigger asChild>
        <Button variant="outline" size="sm" className="w-44 justify-start">
          <span className="truncate text-xs">
            {value.length ? `${value.length} role${value.length > 1 ? "s" : ""} selected` : "None"}
          </span>
          <ChevronsUpDown className="ml-auto h-3.5 w-3.5 opacity-60" />
        </Button>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-64 p-2">
        <div className="max-h-72 overflow-y-auto">
          {LAUNCH_ROLES.map((r) => (
            <label key={r.value} className="flex items-center gap-2 rounded px-2 py-1.5 text-xs hover:bg-muted">
              <input
                type="checkbox"
                checked={draft.includes(r.value)}
                onChange={(e) => {
                  const next = e.target.checked ? [...draft, r.value] : draft.filter((x) => x !== r.value);
                  setDraft(next);
                }}
              />
              {r.label}
            </label>
          ))}
        </div>
        <Button type="button" size="sm" className="mt-2 w-full" onClick={() => commit(false)}>
          Save
        </Button>
      </PopoverContent>
    </Popover>
  );
}

function DeactivateDialog({
  member,
  onClose,
  onDone,
}: {
  member: Member | null;
  onClose: () => void;
  onDone: () => void;
}) {
  const [wl, setWl] = useState<Workload | null>(null);
  const [staff, setStaff] = useState<Array<{ id: string; full_name: string; launch_roles: string[] }>>([]);
  const [loading, setLoading] = useState(false);
  const [main, setMain] = useState("");
  const [overrides, setOverrides] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!member) return;
    setLoading(true);
    setWl(null);
    setMain("");
    setOverrides({});
    (async () => {
      const [wlRes, staffRes] = await Promise.all([
        supabase.rpc("team_member_workload", { _user: member.id }),
        fetchActiveStaff(),
      ]);
      if (wlRes.error) toast.error(wlRes.error.message);
      setWl((wlRes.data ?? {}) as Workload);
      setStaff(staffRes.filter((s) => s.id !== member.id));
      setLoading(false);
    })();
  }, [member]);

  const eligibleFor = (ownerRole: string) =>
    staff.filter((s) => !ownerRole || s.launch_roles.includes(ownerRole));
  const chosen = (code: string) => overrides[code] || main;

  async function confirm() {
    if (!member) return;
    setBusy(true);
    try {
      if (!staff.length) throw new Error("There is no active colleague to hand this work to. Create or reactivate a teammate first.");
      if (!main) throw new Error("Choose who receives this work by default.");
      const moduleOverrides: Record<string, string> = {};
      for (const mod of wl?.modules ?? []) moduleOverrides[mod.module] = chosen(mod.module);
      const res = (await transferTeamMemberWork({
        data: { from_user: member.id, default_to: main, module_overrides: moduleOverrides, deactivate: true },
      })) as unknown as { tasks: number; pipelines: number; actions: number };
      await banUser({ data: { user_id: member.id } });
      toast.success(
        `Moved ${res.tasks} tasks, ${res.pipelines} pipelines and ${res.actions} actions. ${member.full_name} is now inactive.`,
      );
      onDone();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not deactivate this member");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog open={Boolean(member)} onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent className="max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Deactivate {member?.full_name}</DialogTitle>
        </DialogHeader>
        {loading || !member ? (
          <div className="flex items-center justify-center py-8">
            <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
          </div>
        ) : (
          <div className="space-y-4">
            <div className="rounded-lg border border-border/70 bg-muted/30 p-3 text-sm">
              <p className="font-medium">What they currently hold</p>
              {wl?.modules?.length ? (
                <ul className="mt-2 space-y-1 text-muted-foreground">
                  {wl.modules.map((mod) => (
                    <li key={mod.module}>
                      {mod.name} — {mod.launches} launch{mod.launches === 1 ? "" : "es"}
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="mt-1 text-muted-foreground">No launch departments.</p>
              )}
              <p className="mt-2 text-muted-foreground">
                {wl?.open_tasks ?? 0} open tasks · {wl?.pipelines ?? 0} KPI pipelines · {wl?.open_actions ?? 0} open actions
              </p>
            </div>

            <div className="space-y-2">
              <Label>Hand everything to</Label>
              <Select value={main} onValueChange={setMain}>
                <SelectTrigger>
                  <SelectValue placeholder="Select a teammate" />
                </SelectTrigger>
                <SelectContent>
                  {staff.map((s) => (
                    <SelectItem key={s.id} value={s.id}>
                      {s.full_name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {wl?.modules?.length ? (
              <div className="space-y-2">
                <Label>Per-department override (optional)</Label>
                {wl.modules.map((mod) => {
                  const eligible = eligibleFor(mod.owner_role);
                  return (
                    <div key={mod.module} className="grid grid-cols-[1fr_auto] items-center gap-2">
                      <p className="text-sm">
                        {mod.name}
                        <span className="text-muted-foreground"> · {chosen(mod.module) ? staff.find((s) => s.id === chosen(mod.module))?.full_name : "default choice"}</span>
                      </p>
                      <Select
                        value={overrides[mod.module] ?? ""}
                        onValueChange={(v) => setOverrides({ ...overrides, [mod.module]: v })}
                      >
                        <SelectTrigger className="h-8 w-40">
                          <SelectValue placeholder="Default" />
                        </SelectTrigger>
                        <SelectContent>
                          {(eligible.length ? eligible : staff).map((s) => (
                            <SelectItem key={s.id} value={s.id}>
                              {s.full_name}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      {!eligible.length ? (
                        <p className="col-span-2 -mt-1 text-label text-warning">No one holds this launch role yet — the default list is shown.</p>
                      ) : null}
                    </div>
                  );
                })}
              </div>
            ) : null}

            <p className="text-xs text-muted-foreground">
              Deactivating signs them out and blocks their login. Their past work and history stay in place.
            </p>
          </div>
        )}
        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={busy}>
            Cancel
          </Button>
          <Button variant="destructive" onClick={confirm} disabled={busy || loading}>
            {busy ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <ShieldOff className="mr-2 h-4 w-4" />}
            Deactivate
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
