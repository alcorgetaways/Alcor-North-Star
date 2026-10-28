import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";

export function ExitTemplateEditor({ planId, customId }: { planId: string; customId?: string | null }) {
  const [open, setOpen] = useState(false);
  const qc = useQueryClient();
  const query = useQuery({ queryKey: ["exit-templates", planId, customId], enabled: open, queryFn: async () => {
    let request = supabase.from("exit_checklist_items").select("*").order("sort_order");
    request = customId ? request.eq("custom_plan_id", customId) : request.eq("plan_id", planId).is("custom_plan_id", null);
    const { data, error } = await request;
    if (error) throw error;
    return data ?? [];
  }});
  const refresh = () => qc.invalidateQueries({ queryKey: ["exit-templates"] });
  return <><Button variant="outline" size="sm" onClick={() => setOpen(true)}>Edit exit checklist</Button><Sheet open={open} onOpenChange={setOpen}><SheetContent className="overflow-y-auto sm:max-w-xl"><SheetHeader><SheetTitle>Plan exit checklist</SheetTitle></SheetHeader>
    {customId && !query.data?.length ? <Button className="mt-4" onClick={async () => { const { error } = await supabase.rpc("custom_exit_copy", { _custom: customId }); if (error) toast.error(error.message); else { await refresh(); toast.success("Base checklist copied"); } }}>Customize base checklist</Button> : null}
    {query.error ? <p className="text-destructive">{query.error.message}</p> : null}
    <div className="mt-4 space-y-5">{query.data?.map(row => <form key={row.id} className="space-y-2 border-b border-border pb-4" onSubmit={async event => {
      event.preventDefault(); const form = new FormData(event.currentTarget);
      const { error } = await supabase.from("exit_checklist_items").update({ item_text: String(form.get("text")), stage: String(form.get("stage")), owner_side: String(form.get("side")), anchor: String(form.get("anchor")), offset_days: Number(form.get("offset")), active: form.get("active") === "on", working_days: form.get("working") === "on", financial: form.get("financial") === "on" }).eq("id", row.id);
      if (error) toast.error(error.message); else { toast.success("Future exit checklist updated"); await refresh(); }
    }}><p className="font-medium">{row.code}</p><Label>Stage</Label><Input name="stage" required maxLength={120} defaultValue={row.stage} /><Label>Item</Label><Textarea name="text" required maxLength={2000} defaultValue={row.item_text} /><div className="grid grid-cols-2 gap-2"><div><Label>Owner side</Label><Select name="side" defaultValue={row.owner_side}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent>{["Alcor", "Hotel", "Both"].map(side => <SelectItem key={side} value={side}>{side}</SelectItem>)}</SelectContent></Select></div><div><Label>Count from</Label><Select name="anchor" defaultValue={row.anchor}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="notice">Notice date</SelectItem><SelectItem value="exit">Exit date</SelectItem></SelectContent></Select></div></div><Label>Day offset</Label><Input name="offset" type="number" min={-365} max={365} required defaultValue={row.offset_days} /><div className="flex flex-wrap gap-4">{([['active','Active',row.active],['working','Working days',row.working_days],['financial','Finance item',row.financial]] as const).map(([name,label,checked]) => <Label key={name} className="flex items-center gap-2"><Checkbox name={name} defaultChecked={checked} />{label}</Label>)}</div><Button type="submit" size="sm">Save</Button></form>)}</div>
  </SheetContent></Sheet></>;
}