import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { fetchAll } from "@/lib/fetch-all";
import { monthKey } from "@/lib/kpi";

export type TargetsMissing = { clientId: string; hotel: string; count: number };

/**
 * Active client pipelines whose KPIs have no target in effect for the current
 * month. A target carries forward from the month it was set, so any target
 * row with month <= this month counts. Management only.
 */
export function useTargetsMissing(enabled = true) {
  return useQuery({
    queryKey: ["targets-missing", monthKey()],
    enabled,
    queryFn: async (): Promise<TargetsMissing[]> => {
      const month = monthKey();
      const [defsRes, cps, targets] = await Promise.all([
        supabase
          .from("kpi_definitions")
          .select("id, pipeline_id, kpi_type")
          .eq("active", true)
          .eq("controllable", true)
          .neq("kpi_type", "text"),
        fetchAll<{ id: string; client_id: string; pipeline_id: string; clients: { hotel_name: string } | null }>((f, t) =>
          supabase
            .from("client_pipelines")
            .select("id, client_id, pipeline_id, clients!inner(hotel_name)")
            .eq("status", "active")
            // Same rule as monthly reports: real (not test/demo), active clients only.
            .eq("clients.status", "active")
            .eq("clients.is_test", false)
            .eq("clients.is_demo", false)
            .range(f, t) as never,
        ),
        fetchAll<{ client_pipeline_id: string; kpi_definition_id: string }>((f, t) =>
          supabase
            .from("client_kpi_targets")
            .select("client_pipeline_id, kpi_definition_id")
            .lte("month", month)
            .range(f, t) as never,
        ),
      ]);
      if (defsRes.error) throw defsRes.error;

      const defsByPipeline = new Map<string, string[]>();
      for (const d of defsRes.data ?? []) {
        const list = defsByPipeline.get(d.pipeline_id) ?? [];
        list.push(d.id);
        defsByPipeline.set(d.pipeline_id, list);
      }
      const targeted = new Set(targets.map((t) => `${t.client_pipeline_id}|${t.kpi_definition_id}`));

      const byClient = new Map<string, TargetsMissing>();
      for (const cp of cps) {
        const gap = (defsByPipeline.get(cp.pipeline_id) ?? []).filter((d) => !targeted.has(`${cp.id}|${d}`)).length;
        if (!gap) continue;
        const cur = byClient.get(cp.client_id) ?? { clientId: cp.client_id, hotel: cp.clients?.hotel_name ?? "Hotel", count: 0 };
        cur.count += gap;
        byClient.set(cp.client_id, cur);
      }
      return Array.from(byClient.values());
    },
  });
}
