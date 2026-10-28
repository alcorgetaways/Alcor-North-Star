import { supabase } from "@/integrations/supabase/client";

export type StaffOption = { id: string; full_name: string; launch_roles: string[] };

/**
 * Active internal staff only — excludes hotel clients, users with no role
 * and deactivated (status = 'inactive') members. Use for every owner /
 * assignee / manager picker in the app.
 */
export async function fetchActiveStaff(): Promise<StaffOption[]> {
  const [{ data: profiles, error }, { data: roles }] = await Promise.all([
    supabase
      .from("profiles")
      .select("id, full_name, launch_roles, status")
      .eq("status", "active")
      .is("client_id", null)
      .order("full_name"),
    supabase.from("user_roles").select("user_id, role"),
  ]);
  if (error) throw error;
  const staffIds = new Set((roles ?? []).map((r) => r.user_id));
  return ((profiles ?? []) as Array<{ id: string; full_name: string; launch_roles: string[] | null }>)
    .filter((p) => staffIds.has(p.id))
    .map((p) => ({ id: p.id, full_name: p.full_name, launch_roles: (p.launch_roles as string[] | null) ?? [] }));
}
