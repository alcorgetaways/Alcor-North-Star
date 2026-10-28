import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
export type ActivityItem = { occurrence_key: string; activity_type_id: string | null; name: string; quantity: number; publish_on: string; owner_id: string; backup_id: string };
export type ActivityPipeline = { id: string; client_id: string; hotel: string; pipeline_id: string; code: string; name: string; can_edit: boolean; people: { id: string; name: string; role: string }[] };
export type ActivityPlan = { id: string; cp: string; hotel: string; pipeline: string; month: string; version: number; status: string; comment: string | null; can_edit: boolean; can_approve: boolean; items: ActivityItem[]; planned: number; done: number; on_time: number | null };
export type RecurringTask = { escalation_level?: number; blocker_reason?: string | null; people: {id:string;name:string}[]; id: string; name: string; quantity: number; stage: string; due_date: string; original_due_date: string; status: string; hotel: string; pipeline: string; owner: string; backup: string; owner_id: string; backup_id: string; can_edit: boolean; can_review: boolean; on_hold: boolean; review_reason: string | null };
export type ActivityWorkspace = { pipelines: ActivityPipeline[]; plans: ActivityPlan[]; tasks: RecurringTask[]; types: { id: string; pipeline_id: string; name: string }[] };
export function useActivityWorkspace(month: string, client?: string, code?: string, mine = false) {
 return useQuery({ queryKey: ['activity',month,client,code,mine], queryFn: async () => {
  const {data,error}=await supabase.rpc('activity_workspace',{_month:month,_client:client ?? null as unknown as string,_code:code ?? null as unknown as string,_mine:mine});
  if(error)throw error;return data as unknown as ActivityWorkspace;
 }});
}
export function useActivityMutation() {
 const qc=useQueryClient();
 return useMutation({mutationFn: async (action: () => PromiseLike<{error: {message: string} | null}>) => {const {error}=await action();if(error)throw new Error(error.message);},onSuccess:()=>{void qc.invalidateQueries({queryKey:['activity']});void qc.invalidateQueries({queryKey:['activity-people']});void qc.invalidateQueries({queryKey:['department-scorecards']});void qc.invalidateQueries({queryKey:['team-scorecard']});}});
}
export function activityTargets(items: ActivityItem[], period: 'daily'|'weekly'|'monthly') {
 const groups=new Map<string,number>();
 for(const item of items){let key=item.publish_on;if(period==='monthly')key=key.slice(0,7);if(period==='weekly'){const d=new Date(`${key}T00:00:00Z`);const day=d.getUTCDay();d.setUTCDate(d.getUTCDate()-((day+6)%7));key=d.toISOString().slice(0,10);}groups.set(key,(groups.get(key)??0)+item.quantity);}
 return Array.from(groups,([date,quantity])=>({date,quantity})).sort((a,b)=>a.date.localeCompare(b.date));
}
