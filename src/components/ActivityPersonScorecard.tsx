import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { DataTable } from '@/components/DataTable';
export function ActivityPersonScorecard({month}:{month:string}){
 const {data=[],error}=useQuery({queryKey:['activity-people',month],queryFn:async()=>{const {data,error}=await supabase.rpc('activity_person_summary',{_month:month});if(error)throw error;return data as unknown as {id:string;full_name:string;due:number;done:number;planned_items:number;completed_items:number;on_time:number|null}[];}});
 return <section className="space-y-4"><h2 className="text-section-title font-semibold">Monthly activity performance</h2>{error?<p className="text-destructive">{error.message}</p>:null}<DataTable rows={data} rowKey={p=>p.id} emptyMessage="No recurring activity yet." columns={[{key:'name',header:'Person',render:p=>p.full_name},{key:'tasks',header:'Tasks done / due',align:'right',render:p=>`${p.done} / ${p.due}`},{key:'items',header:'Published / planned',align:'right',render:p=>`${p.completed_items} / ${p.planned_items}`},{key:'time',header:'On time',align:'right',render:p=>p.on_time==null?'No data yet':`${p.on_time}%`}]}/></section>;
}
