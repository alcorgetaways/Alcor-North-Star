import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { whoPaysRows, type WhoPaysResolution } from '@/lib/who-pays';
import { DataTable } from '@/components/DataTable';
import { Checkbox } from '@/components/ui/checkbox';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
export function WhoPays({ versionId, customId, clientId, launchId }: { versionId?: string; customId?: string; clientId?: string; launchId?: string }) {
  const {data,error}=useQuery({queryKey:['who-pays',versionId,customId,clientId,launchId],queryFn:async()=>{const {data,error}=await supabase.rpc('who_pays',{_version:versionId??null as unknown as string,_custom:customId??null as unknown as string,_client:clientId??null as unknown as string,_launch:launchId??null as unknown as string});if(error)throw error;return data as unknown as WhoPaysResolution|null;}});
  if(error)return <p className="text-destructive">{error.message}</p>;
  if(!data)return <p className="text-small text-muted-foreground">Who pays — no plan selected</p>;
  return <section className="space-y-3"><h2 className="text-section-title font-semibold">Who pays · {data.name}</h2><DataTable rows={whoPaysRows(data.tools_included,data.influencer_included)} rowKey={r=>String(r.id)} columns={[{key:'item',header:'Cost',render:r=>r.item},{key:'payer',header:'Who pays',render:r=>r.payer}]}/></section>;
}
export function PlanToolsCheckbox({id,custom=false,included}:{id:string;custom?:boolean;included:boolean}) {
 const {roles}=useAuth();const qc=useQueryClient();const [saving,setSaving]=useState(false);
 return <div className="flex items-center gap-2 py-3"><Checkbox id={`tools-${id}`} checked={included} disabled={!roles.includes('admin')||saving} onCheckedChange={async checked=>{setSaving(true);const {error}=await supabase.rpc('set_plan_tools',{_id:id,_custom:custom,_included:checked===true});setSaving(false);if(error)toast.error(error.message);else{toast.success('Tools inclusion saved');qc.invalidateQueries({queryKey:['plan-versions']});qc.invalidateQueries({queryKey:['custom-plans']});qc.invalidateQueries({queryKey:['who-pays']});}}}/><Label htmlFor={`tools-${id}`}>Includes reservations &amp; sales tools</Label></div>;
}
export function InvoiceWhoPays({clientId,launchId}:{clientId:string;launchId:string|null}) {const [open,setOpen]=useState(false);return <><Button size="sm" variant="outline" onClick={()=>setOpen(true)}>Who pays</Button><Dialog open={open} onOpenChange={setOpen}><DialogContent className="max-w-3xl max-h-[85vh] overflow-y-auto"><DialogHeader><DialogTitle>Who pays</DialogTitle></DialogHeader><WhoPays {...(launchId?{launchId}:{clientId})}/></DialogContent></Dialog></>;}