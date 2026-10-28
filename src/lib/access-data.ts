import { queryOptions } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import type { AppRole } from "@/lib/constants";

export type AccessInfo = { roles: AppRole[]; managedCodes: string[] };

/** Roles + pipelines the user manages or backs up. Shared by the route guard and the sidebar. */
export function accessQuery(userId: string) {
  return queryOptions({
    queryKey: ["access", userId],
    staleTime: 60_000,
    queryFn: async (): Promise<AccessInfo> => {
      const [{ data: r }, { data: cp }, { data: pm }] = await Promise.all([
        supabase.from("user_roles").select("role").eq("user_id", userId),
        supabase
          .from("client_pipelines")
          .select("pipelines(code)")
          .or(`manager_id.eq.${userId},backup_manager_id.eq.${userId}`),
        supabase
          .from("pipeline_members")
          .select("role, pipelines(code)")
          .eq("user_id", userId)
          .eq("active", true),
      ]);
      const roles = ((r ?? []) as Array<{ role: AppRole }>).map((x) => x.role);
      const managedCodes = Array.from(
        new Set(
          [...(cp ?? []), ...(pm ?? [])]
            .map((row) => (row as unknown as { pipelines: { code: string } | null }).pipelines?.code)
            .filter(Boolean) as string[],
        ),
      );
      // "head:<code>" marks pipelines the user heads (e.g. the Reservation Desk head's sales pages).
      for (const row of (pm ?? []) as unknown as Array<{ role: string; pipelines: { code: string } | null }>) {
        if (row.role === "head" && row.pipelines?.code) managedCodes.push(`head:${row.pipelines.code}`);
      }
      return { roles, managedCodes };
    },
  });
}
