import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

/** The signed-in hotel owner's hotel (RLS limits clients to their own row). */
export function useMyHotel(clientId: string | null | undefined) {
  return useQuery({
    queryKey: ["my-hotel", clientId],
    enabled: !!clientId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("clients")
        .select("id, hotel_name")
        .eq("id", clientId!)
        .maybeSingle();
      if (error) throw error;
      return data;
    },
  });
}
