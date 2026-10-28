import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import type { Session } from "@supabase/supabase-js";
import { supabase } from "@/integrations/supabase/client";
import type { AppRole } from "@/lib/constants";

export type Profile = {
  id: string;
  full_name: string;
  email: string | null;
  mobile: string | null;
  department: string | null;
  photo_url: string | null;
  status: string;
  client_id: string | null;
};

type AuthState = {
  session: Session | null;
  user: Session["user"] | null;
  profile: Profile | null;
  roles: AppRole[];
  loading: boolean;
  isStaff: boolean;
  isManager: boolean;
  isAdmin: boolean;
  isBD: boolean;
  isClient: boolean;
  refresh: () => Promise<void>;
};

const AuthContext = createContext<AuthState | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [roles, setRoles] = useState<AppRole[]>([]);
  const [loading, setLoading] = useState(true);

  async function load(userId: string | undefined) {
    if (!userId) {
      setProfile(null);
      setRoles([]);
      setLoading(false);
      return;
    }
    const [{ data: p }, { data: r }] = await Promise.all([
      supabase
        .from("profiles")
        .select("id, full_name, email, mobile, department, photo_url, status, client_id")
        .eq("id", userId)
        .maybeSingle(),
      supabase.from("user_roles").select("role").eq("user_id", userId),
    ]);
    setProfile((p as Profile) ?? null);
    setRoles(((r ?? []) as Array<{ role: AppRole }>).map((x) => x.role));
    setLoading(false);
  }

  useEffect(() => {
    let active = true;
    supabase.auth.getSession().then(({ data }) => {
      if (!active) return;
      setSession(data.session);
      void load(data.session?.user.id);
    });
    const { data: sub } = supabase.auth.onAuthStateChange((event, next) => {
      if (event !== "SIGNED_IN" && event !== "SIGNED_OUT" && event !== "USER_UPDATED") return;
      setSession(next);
      setLoading(true);
      void load(next?.user.id);
    });
    return () => {
      active = false;
      sub.subscription.unsubscribe();
    };
  }, []);

  const value = useMemo<AuthState>(() => {
    const isAdmin = roles.includes("admin");
    const isManager = isAdmin || roles.includes("management");
    const isClient = roles.includes("client");
    return {
      session,
      user: session?.user ?? null,
      profile,
      roles,
      loading,
      isAdmin,
      isManager,
      isBD: isManager || roles.includes("bd_manager"),
      isClient,
      isStaff: roles.some((r) => r !== "client") && roles.length > 0,
      refresh: () => load(session?.user.id),
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [session, profile, roles, loading]);

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthState {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used inside AuthProvider");
  return ctx;
}
