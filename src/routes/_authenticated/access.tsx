import { useMemo, useState } from "react";
import { useAuth } from "@/hooks/useAuth";
import { EmailPanel, SendLoginEmailButton } from "@/components/EmailPanel";
import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { Download } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { PageHeader } from "@/components/PageHeader";
import { DataTable } from "@/components/DataTable";
import { StatusBadge } from "@/components/StatusBadge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { ACCESS_MAP, canAccess } from "@/lib/access";
import { ROLE_LABELS, type AppRole } from "@/lib/constants";

export const Route = createFileRoute("/_authenticated/access")({
  head: () => ({
    meta: [
      { title: "Access — Alcor North Star" },
      { name: "description", content: "Every login, its roles, pipelines and assigned clients." },
      { property: "og:title", content: "Access — Alcor North Star" },
      { property: "og:description", content: "Login access overview for management." },
    ],
  }),
  component: AccessPage,
});

type AccessRow = {
  user_id: string;
  full_name: string | null;
  email: string | null;
  status: string;
  account_type: "Staff" | "Owner" | "Test";
  roles: string[];
  department: string | null;
  linked_clients: string[];
  pipelines: Array<{ code: string; name: string; role: string }>;
  assigned_clients: number;
  am_clients: number;
  must_change_password: boolean;
  last_sign_in_at: string | null;
  joined_on: string | null;
  issues: string[];
};

type PersonSummary = {
  roles: string[];
  managed_pipelines: string[];
  clients: Array<{ id: string; hotel_name: string }>;
};

function fmtDate(iso: string | null): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" });
}

function csvCell(v: string | number | null | undefined): string {
  const s = v === null || v === undefined ? "" : String(v);
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

function AccessPage() {
  const { roles: myRoles } = useAuth();
  const isAdmin = myRoles.includes("admin");
  const { data: rows = [] } = useQuery({
    queryKey: ["access-overview"],
    queryFn: async () => {
      const { data, error } = await supabase.rpc("access_overview");
      if (error) throw error;
      return data as unknown as AccessRow[];
    },
  });

  const [role, setRole] = useState("all");
  const [pipeline, setPipeline] = useState("all");
  const [client, setClient] = useState("");
  const [type, setType] = useState("all");
  const [pending, setPending] = useState("all");
  const [selected, setSelected] = useState<AccessRow | null>(null);

  const allPipelines = useMemo(() => {
    const map = new Map<string, string>();
    for (const r of rows) for (const p of r.pipelines) map.set(p.code, p.name);
    return [...map.entries()].map(([code, name]) => ({ code, name }));
  }, [rows]);

  const filtered = useMemo(
    () =>
      rows.filter((r) => {
        if (role !== "all" && !r.roles.includes(role)) return false;
        if (pipeline !== "all" && !r.pipelines.some((p) => p.code === pipeline)) return false;
        if (type !== "all" && r.account_type !== type) return false;
        if (pending === "pending" && !r.must_change_password) return false;
        if (pending === "active" && r.must_change_password) return false;
        if (client.trim()) {
          const q = client.trim().toLowerCase();
          const inLinked = r.linked_clients.some((c) => c.toLowerCase().includes(q));
          if (!inLinked) return false;
        }
        return true;
      }),
    [rows, role, pipeline, client, type, pending],
  );

  function exportCsv() {
    const head = [
      "Name", "Email", "Account type", "Roles", "Linked clients / Department",
      "Pipelines", "Assigned clients", "AM clients", "Sign-in status", "Last sign-in", "Issues",
    ];
    const lines = filtered.map((r) =>
      [
        r.full_name, r.email, r.account_type,
        r.roles.map((x) => ROLE_LABELS[x as AppRole] ?? x).join("; "),
        r.account_type === "Staff" ? r.department ?? "" : r.linked_clients.join("; "),
        r.pipelines.map((p) => `${p.name} (${p.role})`).join("; "),
        r.assigned_clients, r.am_clients,
        r.must_change_password ? "Pending first sign-in" : "Active",
        fmtDate(r.last_sign_in_at), r.issues.join("; "),
      ].map(csvCell).join(","),
    );
    const blob = new Blob([[head.map(csvCell).join(","), ...lines].join("\n")], {
      type: "text/csv;charset=utf-8",
    });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = "access.csv";
    a.click();
    URL.revokeObjectURL(a.href);
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Access"
        description="Every login — roles, pipelines, assigned clients and sign-in status. Passwords are never stored or shown."
        actions={
          <Button variant="outline" onClick={exportCsv} disabled={!filtered.length}>
            <Download className="mr-2 h-4 w-4" /> Export CSV
          </Button>
        }
      />

      <DataTable<AccessRow>
        rows={filtered}
        rowKey={(r) => r.user_id}
        emptyMessage="No logins match the filters."
        onRowClick={(r) => setSelected(r)}
        toolbar={
          <>
            <Select value={type} onValueChange={setType}>
              <SelectTrigger className="w-36"><SelectValue placeholder="Type" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All types</SelectItem>
                <SelectItem value="Staff">Staff</SelectItem>
                <SelectItem value="Owner">Owner</SelectItem>
                <SelectItem value="Test">Test</SelectItem>
              </SelectContent>
            </Select>
            <Select value={role} onValueChange={setRole}>
              <SelectTrigger className="w-44"><SelectValue placeholder="Role" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All roles</SelectItem>
                {Object.entries(ROLE_LABELS).map(([v, l]) => (
                  <SelectItem key={v} value={v}>{l}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select value={pipeline} onValueChange={setPipeline}>
              <SelectTrigger className="w-48"><SelectValue placeholder="Pipeline" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All pipelines</SelectItem>
                {allPipelines.map((p) => (
                  <SelectItem key={p.code} value={p.code}>{p.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Input
              value={client}
              onChange={(e) => setClient(e.target.value)}
              placeholder="Linked client…"
              className="w-48"
            />
            <Select value={pending} onValueChange={setPending}>
              <SelectTrigger className="w-48"><SelectValue placeholder="Sign-in status" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Any status</SelectItem>
                <SelectItem value="pending">Pending first sign-in</SelectItem>
                <SelectItem value="active">Active</SelectItem>
              </SelectContent>
            </Select>
            <span className="ml-auto text-label text-muted-foreground tabular-nums">
              {filtered.length} of {rows.length} logins
            </span>
          </>
        }
        columns={[
          { key: "name", header: "Name", render: (r) => <span className="font-medium">{r.full_name || "—"}</span> },
          { key: "email", header: "Email", render: (r) => <span className="text-muted-foreground">{r.email || "—"}</span> },
          {
            key: "type",
            header: "Type",
            render: (r) => (
              <Badge variant={r.account_type === "Staff" ? "default" : "secondary"}>{r.account_type}</Badge>
            ),
          },
          {
            key: "roles",
            header: "Roles",
            render: (r) => (
              <span className="text-muted-foreground">
                {r.roles.map((x) => ROLE_LABELS[x as AppRole] ?? x).join(", ") || "—"}
              </span>
            ),
          },
          {
            key: "clients",
            header: "Clients / Department",
            className: "max-w-56",
            render: (r) => (
              <span className="line-clamp-2 text-muted-foreground">
                {r.account_type === "Staff" ? r.department || "—" : r.linked_clients.join(", ") || "—"}
              </span>
            ),
          },
          {
            key: "pipelines",
            header: "Pipelines",
            className: "max-w-56",
            render: (r) => (
              <span className="line-clamp-2 text-muted-foreground">
                {r.pipelines.map((p) => `${p.name} (${p.role})`).join(", ") || "—"}
              </span>
            ),
          },
          { key: "nclients", header: "Clients", align: "right", render: (r) => r.assigned_clients },
          { key: "am", header: "AM", align: "right", render: (r) => r.am_clients },
          {
            key: "status",
            header: "Status",
            render: (r) =>
              r.must_change_password ? (
                <StatusBadge status="pending" label="Pending first sign-in" />
              ) : (
                <StatusBadge status="active" label="Active" />
              ),
          },
          {
            key: "last",
            header: "Last sign-in",
            render: (r) => <span className="text-muted-foreground">{fmtDate(r.last_sign_in_at)}</span>,
          },
          {
            key: "issues",
            header: "Issues",
            className: "max-w-48",
            render: (r) => (
              <span className="line-clamp-2 text-label text-muted-foreground">{r.issues.join("; ") || "—"}</span>
            ),
          },
        ]}
      />

      {isAdmin ? <EmailPanel /> : null}

      <PersonDialog row={selected} onClose={() => setSelected(null)} isAdmin={isAdmin} />
    </div>
  );
}

function PersonDialog({ row, onClose, isAdmin }: { row: AccessRow | null; onClose: () => void; isAdmin: boolean }) {
  const { data: summary } = useQuery({
    queryKey: ["person-access", row?.user_id],
    enabled: !!row,
    queryFn: async () => {
      const { data, error } = await supabase.rpc("person_access_summary", {
        _user_id: row!.user_id,
      });
      if (error) throw error;
      return data as unknown as PersonSummary;
    },
  });

  const pages = useMemo(() => {
    if (!summary) return [];
    const roles = summary.roles as AppRole[];
    return ACCESS_MAP.filter((r) =>
      canAccess(r.path, {}, roles, summary.managed_pipelines),
    ).map((r) => r.path);
  }, [summary]);

  return (
    <Dialog open={!!row} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>{row?.full_name || row?.email} — what they can see</DialogTitle>
        </DialogHeader>
        <div className="space-y-4 text-sm">
          {isAdmin && row ? <SendLoginEmailButton userId={row.user_id} email={row.email} /> : null}
          <div>
            <p className="mb-1 text-label-muted">Pages</p>
            <div className="flex flex-wrap gap-1.5">
              {pages.map((p) => (
                <Badge key={p} variant="secondary">{p}</Badge>
              ))}
              {!pages.length ? <span className="text-muted-foreground">—</span> : null}
            </div>
          </div>
          <div>
            <p className="mb-1 text-label-muted">
              Clients ({summary?.clients.length ?? 0})
            </p>
            <div className="max-h-56 overflow-y-auto rounded-lg border border-border/60">
              {(summary?.clients ?? []).map((c) => (
                <p key={c.id} className="border-b border-border/40 px-3 py-1.5 last:border-0">
                  {c.hotel_name}
                </p>
              ))}
              {!summary?.clients.length ? (
                <p className="px-3 py-2 text-muted-foreground">No clients.</p>
              ) : null}
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
