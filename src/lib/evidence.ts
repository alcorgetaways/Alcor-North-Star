import { supabase } from "@/integrations/supabase/client";

/** Evidence may be an external http(s) link or a client-files storage path (uploaded proof). */
export function isEvidencePath(value: string) {
  return !/^https?:/i.test(value.trim());
}

/** Resolve evidence to an openable URL: external links pass through, storage paths get a short-lived signed URL. */
export async function openEvidenceUrl(value: string): Promise<string | null> {
  const v = value.trim();
  if (!isEvidencePath(v)) return v;
  const { data, error } = await supabase.storage.from("client-files").createSignedUrl(v, 300);
  return error || !data ? null : data.signedUrl;
}
