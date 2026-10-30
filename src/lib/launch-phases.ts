import { queryOptions } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

// Every consumer caches the same ordered rows. Screen-specific transformations
// belong in select so they cannot change the shared cache's data shape.
export function launchPhasesQuery() {
  return queryOptions({
    // Keep the ordered rows separate from the names-only observer below. The
    // dashboard and task board can be visited in either order, and each needs
    // a different data shape.
    queryKey: ["launch-phases", "rows"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("launch_phases")
        .select("code, name, sort_order")
        .order("sort_order");
      if (error) throw error;
      return data ?? [];
    },
  });
}

export function launchPhaseNamesQuery() {
  return queryOptions({
    ...launchPhasesQuery(),
    queryKey: ["launch-phases", "names"],
    select: (phases) => new Map(phases.map((p) => [p.code, `${p.code} · ${p.name}`])),
  });
}
