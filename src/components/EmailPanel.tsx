import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Loader2, Mail } from "lucide-react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription,
  AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { getEmailStatus, previewStaffLoginEmails, sendLoginEmail, sendStaffLoginEmails } from "@/lib/login-email.functions";
import { DataTable } from "@/components/DataTable";
import { StatusBadge } from "@/components/StatusBadge";

type Row = { id: string; to_address: string | null; created_at: string; sent_at: string | null; attempts: number; error: string | null; failed_at: string | null; held?: boolean; kind?: string; source?: string };

function status(r: Row) {
  if (r.sent_at) return <StatusBadge status="sent" label="Sent" tone="success" />;
  if (r.failed_at) return <StatusBadge status="failed" label="Failed" />;
  if (r.held) return <StatusBadge status="on hold" label="On hold" />;
  return <StatusBadge status="pending" label={r.attempts ? `Retrying (${r.attempts}/3)` : "Queued"} />;
}
const when = (d: string | null) => (d ? new Date(d).toLocaleString("en-IN", { timeZone: "Asia/Kolkata", day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" }) : "—");

/** Admin-only: email switch state, login emails and outbox with status/retries/errors, and the bulk staff send. */
export function EmailPanel() {
  const qc = useQueryClient();
  const statusFn = useServerFn(getEmailStatus);
  const previewFn = useServerFn(previewStaffLoginEmails);
  const bulkFn = useServerFn(sendStaffLoginEmails);
  const [confirmCount, setConfirmCount] = useState<number | null>(null);
  const { data } = useQuery({ queryKey: ["email-status"], queryFn: () => statusFn() });
  const preview = useMutation({ mutationFn: () => previewFn(), onSuccess: (r) => setConfirmCount(r.count), onError: (e: Error) => toast.error(e.message) });
  const bulk = useMutation({
    mutationFn: (n: number) => bulkFn({ data: { expectedCount: n } }),
    onSuccess: (r) => { toast.success(`Sent ${r["sent"] ?? 0}; not sent ${(r["failed"] ?? 0) + (r["retry"] ?? 0) + (r["pending"] ?? 0)}`); qc.invalidateQueries({ queryKey: ["email-status"] }); },
    onError: (e: Error) => toast.error(e.message),
  });
  if (!data) return null;
  const rows: Row[] = [
    ...data.logins.map((l) => ({ ...l, kind: `Login email (${l.source})` })),
    ...data.outbox.map((o) => ({ ...o, kind: o.kind })),
  ].sort((a, b) => b.created_at.localeCompare(a.created_at));

  return (
    <section className="space-y-3 card-surface p-5">
      <div className="flex flex-wrap items-center gap-3">
        <h2 className="flex flex-wrap items-center gap-2 text-section-title font-semibold"><Mail className="h-4 w-4" />Emails</h2>
        <Badge variant={data.smtpConfigured ? "default" : "outline"}>{data.smtpConfigured ? "Hostinger SMTP connected" : "SMTP not set up"}</Badge>
        <Badge variant={data.sendingEnabled ? "default" : "secondary"}>{data.sendingEnabled ? "Automatic sending on" : "Automatic sending paused"}</Badge>
        <Button size="sm" variant="outline" className="ml-auto" disabled={preview.isPending || bulk.isPending} onClick={() => preview.mutate()}>
          {bulk.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
          Send login emails to all staff who haven't received one
        </Button>
      </div>
      <div className="max-h-96 overflow-auto">
        <DataTable<Row>
          className="rounded-none border-0 bg-transparent shadow-none"
          rows={rows}
          rowKey={(r) => r.id}
          emptyMessage="No emails yet."
          columns={[
            { key: "queued", header: "Queued", render: (r) => <span className="text-label">{when(r.created_at)}</span> },
            { key: "type", header: "Type", render: (r) => r.kind },
            { key: "to", header: "To", render: (r) => r.to_address ?? "—" },
            { key: "status", header: "Status", render: (r) => status(r) },
            { key: "sent", header: "Sent", render: (r) => <span className="text-label">{when(r.sent_at)}</span> },
            {
              key: "error",
              header: "Error",
              render: (r) => (
                <span className="block max-w-64 truncate text-label text-destructive" title={r.error ?? ""}>{r.error ?? ""}</span>
              ),
            },
          ]}
        />
      </div>
      <AlertDialog open={confirmCount !== null} onOpenChange={(o) => !o && setConfirmCount(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Send login emails to {confirmCount} staff?</AlertDialogTitle>
            <AlertDialogDescription>
              Each person gets "Welcome to Alcor North Star" with their login email, the shared temporary password and a personal set-password link.
              Every send is logged. Hotel owners are not included.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction disabled={!confirmCount} onClick={() => { if (confirmCount) bulk.mutate(confirmCount); setConfirmCount(null); }}>
              Send {confirmCount} emails
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </section>
  );
}

/** Admin-only button for one user, with a confirmation. */
export function SendLoginEmailButton({ userId, email }: { userId: string; email: string | null }) {
  const qc = useQueryClient();
  const fn = useServerFn(sendLoginEmail);
  const [open, setOpen] = useState(false);
  const m = useMutation({
    mutationFn: () => fn({ data: { userId } }),
    onSuccess: (r) => { r["sent"] ? toast.success("Login email sent") : toast.error("Not sent — see Emails on the Access page"); qc.invalidateQueries({ queryKey: ["email-status"] }); },
    onError: (e: Error) => toast.error(e.message),
  });
  return (
    <>
      <Button size="sm" variant="outline" disabled={m.isPending || !email} onClick={() => setOpen(true)}>
        {m.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Mail className="mr-2 h-4 w-4" />}Send login email
      </Button>
      <AlertDialog open={open} onOpenChange={setOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Send the login email to 1 person?</AlertDialogTitle>
            <AlertDialogDescription>{email} will get their login details, the temporary password and a set-password link. The send is logged.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={() => m.mutate()}>Send</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
