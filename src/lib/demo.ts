import { supabase } from "@/integrations/supabase/client";

/**
 * Non-real hotels — test (clients.is_test, e.g. Yash Residency) and demo (is_demo, which always implies test,
 * e.g. The Palm Spring Resort) — are hidden from every real dashboard, count and list. Same rule as the
 * database's is_real_client(). Their own pages still show them. Loaded once per session by the signed-in guard;
 * a failed load is not cached and is reported, so lists never silently include test hotels.
 */
let ids: string[] = [];
let loaded: Promise<void> | null = null;

export function isRealClient(c: { is_test?: boolean | null; is_demo?: boolean | null }) {
  return !c.is_test && !c.is_demo;
}

export function loadDemoClientIds() {
  loaded ??= (async () => {
    const { data, error } = await supabase.from("clients").select("id").or("is_test.eq.true,is_demo.eq.true");
    if (error) throw error;
    ids = (data ?? []).map((r) => r.id);
  })().catch((e: unknown) => {
    loaded = null;
    throw e;
  });
  return loaded;
}

const NIL = "00000000-0000-0000-0000-000000000000";
/** PostgREST list for `.not("client_id", "in", demoIn())`. */
export function demoIn() {
  return `(${(ids.length ? ids : [NIL]).join(",")})`;
}
export function isDemoClient(id: string | null | undefined) {
  return !!id && ids.includes(id);
}
