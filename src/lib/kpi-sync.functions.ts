import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { requirePasswordChanged } from "@/lib/password.functions";
import { z } from "zod";

export const sourceProfiles = createServerFn({ method: "POST" }).middleware([requireSupabaseAuth, requirePasswordChanged])
  .inputValidator((input: unknown) => z.object({ source: z.enum(["metricool", "localo"]) }).parse(input))
  .handler(async ({ data, context }) => {
    const { data: admin } = await context.supabase.rpc("has_role", { _user_id: context.userId, _role: "admin" });
    if (!admin) throw new Error("Admin access required");
    const { listSourceProfiles } = await import("@/lib/kpi-source.server");
    const credentials = { metricoolToken: process.env["METRICOOL_API_TOKEN"] ?? "", metricoolUser: process.env["METRICOOL_USER_ID"] ?? "", localoToken: process.env["LOCALO_MCP_TOKEN"] ?? "", localoOrg: process.env["LOCALO_ORG_ID"] ?? "" };
    try { return { profiles: await listSourceProfiles(data.source, credentials), error: null }; }
    catch (e) {
      const detail = e instanceof Error ? e.message : "Source unavailable";
      const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
      await supabaseAdmin.from("kpi_sync_runs").insert({ source: data.source, status: "error", detail });
      return { profiles: [], error: detail };
    }
  });

export const syncSourceMonth = createServerFn({ method: "POST" }).middleware([requireSupabaseAuth, requirePasswordChanged])
  .inputValidator((input: unknown) => z.object({ mapping: z.string().uuid(), month: z.string().regex(/^\d{4}-\d{2}-01$/) }).parse(input))
  .handler(async ({ data, context }) => {
    const { data: admin } = await context.supabase.rpc("has_role", { _user_id: context.userId, _role: "admin" });
    if (!admin) throw new Error("Admin access required");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: mapping, error } = await supabaseAdmin.from("kpi_source_mappings").select("*").eq("id", data.mapping).eq("active", true).single();
    if (error || !mapping?.confirmed_by) throw new Error("Confirm the source mapping first");
    const { isStorableMonth } = await import("@/lib/kpi-sync-plan");
    if (!isStorableMonth(data.month, new Date())) throw new Error("The running month is fetched after it ends");
    const { fetchSourceMonth } = await import("@/lib/kpi-source.server");
    const credentials = { metricoolToken: process.env["METRICOOL_API_TOKEN"] ?? "", metricoolUser: process.env["METRICOOL_USER_ID"] ?? "", localoToken: process.env["LOCALO_MCP_TOKEN"] ?? "", localoOrg: process.env["LOCALO_ORG_ID"] ?? "" };
    try {
      const result = await fetchSourceMonth(mapping.source, mapping.external_id, data.month, credentials);
      const { data: existing } = await supabaseAdmin.from("kpi_fetched_values").select("id").eq("mapping_id", mapping.id).eq("month", data.month).maybeSingle();
      if (existing) throw new Error("This month already has immutable fetched values");
      const { error: insertError } = await supabaseAdmin.from("kpi_fetched_values").insert({ mapping_id: mapping.id, client_pipeline_id: mapping.client_pipeline_id, month: data.month, source: mapping.source, fetched_values: result.values, raw_data: result.raw as never });
      if (insertError) throw insertError;
      await supabaseAdmin.from("kpi_sync_runs").insert({ mapping_id: mapping.id, source: mapping.source, month: data.month, status: "fetched", detail: "Awaiting head review" });
      return { ok: true, error: null };
    } catch (e) {
      const detail = e instanceof Error ? e.message : "Source unavailable";
      await supabaseAdmin.from("kpi_sync_runs").insert({ mapping_id: mapping.id, source: mapping.source, month: data.month, status: "error", detail });
      return { ok: false, error: detail };
    }
  });

export const syncMappedHistory=createServerFn({method:"POST"}).middleware([requireSupabaseAuth,requirePasswordChanged])
  .inputValidator((input:unknown)=>z.object({mapping:z.string().uuid()}).parse(input))
  .handler(async({data,context})=>{
    const {data:admin}=await context.supabase.rpc("has_role",{_user_id:context.userId,_role:"admin"});if(!admin)throw new Error("Admin access required");
    const {runMappedHistory}=await import("@/lib/kpi-sync-runner.server");
    return runMappedHistory({metricoolToken:process.env["METRICOOL_API_TOKEN"]??"",metricoolUser:process.env["METRICOOL_USER_ID"]??"",localoToken:process.env["LOCALO_MCP_TOKEN"]??"",localoOrg:process.env["LOCALO_ORG_ID"]??""},data.mapping);
  });