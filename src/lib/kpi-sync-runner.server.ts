import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { fetchSourceMonth, type SourceCredentials } from "@/lib/kpi-source.server";
import { historyPlan, refetchRawData } from "@/lib/kpi-sync-plan";

export async function runMappedHistory(c: SourceCredentials, only?: string, now = new Date()) {
  let query = supabaseAdmin.from("kpi_source_mappings").select("*").eq("active",true);
  if (only) query=query.eq("id",only);
  const {data:mappings,error}=await query; if(error)throw error;
  let fetched=0, refetched=0, failures=0;
  // Bound each worker invocation; subsequent scheduled runs resume from stored months.
  let attempts=0;
  for(const mapping of mappings??[]) {
    const {data:cp}=await supabaseAdmin.from("client_pipelines").select("start_date").eq("id",mapping.client_pipeline_id).single();
    if(!cp?.start_date) {await supabaseAdmin.from("kpi_sync_runs").insert({mapping_id:mapping.id,source:mapping.source,status:"error",detail:"Missing onboarding date — review required"});failures++;continue;}
    const {data:stored}=await supabaseAdmin.from("kpi_fetched_values").select("id, month, status, is_partial, fetched_values, fetched_at, raw_data").eq("mapping_id",mapping.id);
    const byMonth=new Map((stored??[]).map((r)=>[r.month,r]));
    // historyPlan is the single source of the month list: never past the last complete
    // IST month, Localo capped at 18 months, partial rows re-fetched once complete.
    const months=historyPlan({startDate:cp.start_date,source:mapping.source,now,existing:byMonth as never,cap:12-attempts});
    for(const key of months) {
      const existing=byMonth.get(key);
      attempts++;
      try {
        const result=await fetchSourceMonth(mapping.source,mapping.external_id,key,c);
        if(existing){
          const raw=refetchRawData(existing as never,(result.raw??{}) as Record<string,unknown>,key,now);
          const {error:upError}=await supabaseAdmin.from("kpi_fetched_values").update({fetched_values:result.values,fetched_at:now.toISOString(),raw_data:raw as never,is_partial:false}).eq("id",existing.id).eq("status","fetched");
          if(upError)throw upError;
          await supabaseAdmin.from("kpi_sync_runs").insert({mapping_id:mapping.id,source:mapping.source,month:key,status:"fetched",detail:"Re-fetched after month end — previous values kept"});refetched++;
        } else {
          const {error:saveError}=await supabaseAdmin.from("kpi_fetched_values").insert({mapping_id:mapping.id,client_pipeline_id:mapping.client_pipeline_id,month:key,source:mapping.source,fetched_values:result.values,raw_data:result.raw as never});if(saveError)throw saveError;
          await supabaseAdmin.from("kpi_sync_runs").insert({mapping_id:mapping.id,source:mapping.source,month:key,status:"fetched",detail:"Awaiting pipeline head review"});fetched++;
        }
      }catch(e){await supabaseAdmin.from("kpi_sync_runs").insert({mapping_id:mapping.id,source:mapping.source,month:key,status:"error",detail:e instanceof Error?e.message:"Source read failed"});failures++;break;}
    }
  }
  return {fetched,refetched,failures};
}
