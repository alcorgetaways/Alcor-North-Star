import { useEffect, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { supabase } from '@/integrations/supabase/client';
import { DataTable } from '@/components/DataTable';
import { StatusBadge } from '@/components/StatusBadge';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { FormSection } from '@/components/FormSection';
import { Input } from '@/components/ui/input';
/** Escalation ladder names shown to staff (level 0–3). Kept as-is; change here if the chain changes. */
export const ESCALATION_LEVEL_NAMES = ['Not escalated', 'Pipeline Head', 'Shalini · BD', 'Mohnish · Admin'] as const;
export const escalationLabel = (level: number) => ESCALATION_LEVEL_NAMES[Math.min(3, Math.max(0, level))] ?? 'Not escalated';
type Blocker = { id: string; task_kind: string; task_id: string; task_name: string; reason: string; impact: string; owner_approved_at: string | null };
type Task = { id: string; name: string; hotel_name: string; escalation_level: number; blocker_reason: string | null; blocked_since: string | null; kind: string };
export function BlockedTasks({ owner = false }: { owner?: boolean }) {
 const qc = useQueryClient(); const [open, setOpen] = useState(false); const [notes, setNotes] = useState<Record<string, string>>({}); const [busy, setBusy] = useState(false);
 const { data, error } = useQuery({ queryKey: ['blocked-workspace'], queryFn: async () => { const { data, error } = await supabase.rpc('blocked_workspace'); if (error) throw error; return data as unknown as { blockers: Blocker[]; tasks: Task[] }; } });
 const blockers = data?.blockers ?? []; const signature = blockers.map(b => b.id).join(',');
 useEffect(() => { if (owner && signature) setOpen(true); }, [owner, signature]);
 const action = async (b: Blocker, approve: boolean) => { setBusy(true); const { error } = approve ? await supabase.rpc('approve_recurring_blocker', { _id: b.id }) : await supabase.rpc('resolve_approval_blocker', { _id: b.id, _note: notes[b.id] ?? '' }); setBusy(false); if (error) toast.error(error.message); else { toast.success(approve ? 'Approval recorded; awaiting issue resolution' : 'Approval issue resolved'); void qc.invalidateQueries({ queryKey: ['blocked-workspace'] }); } };
 const pending = <div className="space-y-4">{blockers.map(b => <FormSection key={b.id} title={b.task_name}><StatusBadge status="overdue" label="High priority · pending approval"/><p>{b.reason}: {b.impact}</p>{b.owner_approved_at ? <StatusBadge status="approved" label="Approved · awaiting issue resolution"/> : owner && b.task_kind === 'recurring' ? <Button disabled={busy} onClick={() => void action(b, true)}>Approve item</Button> : owner ? <a className="text-primary underline" href="/my-launch">Review launch approval</a> : null}{!owner ? <><Input aria-label={`Resolution for ${b.task_name}`} placeholder="Resolution note" value={notes[b.id] ?? ''} onChange={e => setNotes(n => ({ ...n, [b.id]: e.target.value }))}/><Button disabled={busy || !(notes[b.id] ?? '').trim() || !b.owner_approved_at} onClick={() => void action(b, false)}>Mark issue resolved</Button></> : null}</FormSection>)}</div>;
 if (error) return <p className="text-small text-destructive">{error.message}</p>;
 if (owner) return blockers.length ? <section className="space-y-4"><h2 className="text-section-title font-semibold">Pending approvals</h2><Button variant="outline" onClick={() => setOpen(true)}>Review delayed approvals ({blockers.length})</Button><Dialog open={open} onOpenChange={setOpen}><DialogContent className="max-h-[85vh] overflow-y-auto"><DialogHeader><DialogTitle>Pending approvals</DialogTitle><DialogDescription>Client-side approvals delaying progress</DialogDescription></DialogHeader>{pending}</DialogContent></Dialog></section> : null;
 return <section className="space-y-4"><h2 className="text-section-title font-semibold">Blocked &amp; escalated</h2><DataTable rows={data?.tasks ?? []} rowKey={t => `${t.kind}-${t.id}`} emptyMessage="No blocked tasks in your scope." columns={[{ key: 'task', header: 'Task', render: t => <>{t.name}<span className="block text-label text-muted-foreground">{t.hotel_name}</span></> }, { key: 'reason', header: 'Blocker', render: t => t.blocker_reason ?? 'Other blocker' }, { key: 'level', header: 'Current level', render: t => <StatusBadge status={t.escalation_level ? 'overdue' : 'blocked'} label={escalationLabel(t.escalation_level)}/> } ]}/>{pending}</section>;
}