import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

/**
 * Map of client_id -> confirmed Localo GBP listing names.
 * A client can have several GBP listings (e.g. a second restaurant profile
 * under the same hotel), so always render the full list, never just one name.
 */
export function useGbpProfileNames() {
  return useQuery({
    queryKey: ["gbp-profile-names"],
    queryFn: async () => {
      // Security-definer RPC: kpi_source_mappings itself is admin-only,
      // but GBP staff (e.g. Anju) must see their clients' listing names.
      const { data, error } = await supabase.rpc("gbp_profile_names");
      if (error) throw error;
      const map: Record<string, string[]> = {};
      for (const row of data ?? []) {
        if (!row.client_id) continue;
        (map[row.client_id] ??= []).push(row.external_name);
      }
      return map;
    },
  });
}
