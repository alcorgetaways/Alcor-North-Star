import { loadDemoClientIds } from "@/lib/demo";
import { createFileRoute, Outlet, redirect } from "@tanstack/react-router";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { AppShell } from "@/components/AppShell";
import { canAccess, homeFor } from "@/lib/access";
import { accessQuery } from "@/lib/access-data";

export const Route = createFileRoute("/_authenticated")({
  ssr: false,
  beforeLoad: async ({ context, location, preload }) => {
    const { data, error } = await supabase.auth.getUser();
    if (error || !data.user) throw redirect({ to: "/auth" });
    const { data: pwFlag, error: pwError } = await supabase
      .from("profiles")
      .select("must_change_password")
      .eq("id", data.user.id)
      .maybeSingle();
    // QA-30: fail closed — if the flag can't be read, treat it as "must change".
    if (pwError || pwFlag?.must_change_password) throw redirect({ to: "/change-password", replace: true });
    await loadDemoClientIds();
    const access = await context.queryClient.fetchQuery(accessQuery(data.user.id));
    const search = (location.search ?? {}) as Record<string, unknown>;
    if (!canAccess(location.pathname, search, access.roles, access.managedCodes)) {
      const home = homeFor(access.roles, access.managedCodes);
      if (!preload && home !== "/no-access") toast.error("You don't have access to that page");
      throw redirect({ to: home, replace: true });
    }
    return { user: data.user, access };
  },
  component: () => (
    <AppShell>
      <Outlet />
    </AppShell>
  ),
});
