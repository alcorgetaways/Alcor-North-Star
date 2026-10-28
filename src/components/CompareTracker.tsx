import { useState } from "react";
import { FileSearch, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { compareTrackerRows, type NsClient, type TrackerCompare } from "@/lib/tracker-compare";
import { DataTable } from "@/components/DataTable";

type FinLaunch = { status: string; plan_code: string | null; retainer_inr: number | null; contract_start: string | null };
type FinClient = { id: string; hotel_name: string; is_test: boolean; launches: FinLaunch[] };
const OPEN = ["active", "live", "on_hold", "offboarding"];

async function loadNorthStar(): Promise<NsClient[]> {
  const [{ data: fin, error: e1 }, { data: base, error: e2 }] = await Promise.all([
    supabase.rpc("finance_overview"),
    supabase.from("clients").select("id, contact_person, mobile, state, destination"),
  ]);
  if (e1) throw e1;
  if (e2) throw e2;
  const info = new Map((base ?? []).map((c) => [c.id, c]));
  return ((fin as unknown as { clients: FinClient[] }).clients ?? [])
    .filter((c) => !c.is_test)
    .map((c) => {
      const ls = [...c.launches].sort((a, b) => ((a.contract_start ?? "") < (b.contract_start ?? "") ? 1 : -1));
      const l = ls.find((x) => OPEN.includes(x.status)) ?? ls[0];
      const b = info.get(c.id);
      return {
        name: c.hotel_name, status: l?.status ?? null, plan_code: l?.plan_code ?? null, retainer: l?.retainer_inr ?? null,
        contact: b?.contact_person ?? null, phone: b?.mobile ?? null, state: b?.state ?? null, destination: b?.destination ?? null,
      };
    });
}

/** Admin/BD: upload the BD tracker "Clients" tab as CSV and list every difference. Read-only — nothing is changed. */
export function CompareTrackerButton() {
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [res, setRes] = useState<TrackerCompare | null>(null);

  async function onFile(f: File | null) {
    if (!f) return;
    setBusy(true);
    try {
      const [csv, ns] = await Promise.all([f.text(), loadNorthStar()]);
      setRes(compareTrackerRows(csv, ns));
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not compare");
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <Button variant="outline" size="sm" onClick={() => setOpen(true)}>
        <FileSearch className="mr-2 h-4 w-4" /> Compare with BD tracker
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-h-[85vh] max-w-4xl overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Compare with BD tracker</DialogTitle>
            <DialogDescription>
              Upload the tracker's "Clients" tab saved as CSV. This is a dry run: it lists differences in status, plan, retainer,
              contact, phone, state and destination and changes nothing. New hotels are added only in North Star.
            </DialogDescription>
          </DialogHeader>
          <input type="file" accept=".csv,text/csv" onChange={(e) => onFile(e.target.files?.[0] ?? null)} className="text-sm" />
          {busy ? <p className="flex items-center gap-2 text-sm text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" /> Comparing…</p> : null}
          {res ? (
            <div className="space-y-3 text-sm">
              <p>{res.rows_read} tracker rows · {res.matched} hotels matched · {res.differences.length} differences</p>
              {res.differences.length ? (
                <DataTable
                  rows={res.differences}
                  rowKey={(_d, i) => String(i)}
                  columns={[
                    { key: "hotel", header: "Hotel", render: (d) => <span className="font-medium">{d.client}</span> },
                    { key: "field", header: "Field", render: (d) => <span className="capitalize">{d.field}</span> },
                    { key: "tracker", header: "BD tracker", render: (d) => d.tracker },
                    { key: "ns", header: "North Star", render: (d) => d.north_star },
                  ]}
                />
              ) : <p className="text-success">No differences on the matched hotels.</p>}
              {res.not_in_north_star.length ? <p><span className="font-medium">In the tracker but not in North Star:</span> {res.not_in_north_star.join(", ")}</p> : null}
              {res.not_in_tracker.length ? <p className="text-muted-foreground"><span className="font-medium">In North Star but not in the tracker:</span> {res.not_in_tracker.join(", ")}</p> : null}
            </div>
          ) : null}
        </DialogContent>
      </Dialog>
    </>
  );
}
