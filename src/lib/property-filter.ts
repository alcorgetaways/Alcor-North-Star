import { isUuid } from "@/lib/form-rules";

/** Property IDs, not pipeline IDs, keep one selection consistent across sources. */
export function parsePropertyIds(value: unknown): string[] {
  const values = Array.isArray(value) ? value : typeof value === "string" ? value.split(",") : [];
  return [...new Set(values.filter(isUuid))];
}

export function marketingSearch(s: Record<string, unknown>): { tab?: string | undefined; props?: string | undefined; internal?: boolean | undefined } {
  return {
    tab: typeof s["tab"] === "string" ? s["tab"] : undefined,
    props: parsePropertyIds(s["props"]).join(",") || undefined,
    internal: s["internal"] === true || s["internal"] === "true" ? true : undefined,
  };
}

export function selectedProperties<T extends { client_id: string; clients: { is_internal: boolean } | null }>(
  rows: T[], ids: string[], includeInternal: boolean,
): T[] {
  // Unknown/inaccessible IDs never expand a selection to all properties.
  return rows.filter((row) => (includeInternal || !row.clients?.is_internal) && (!ids.length || ids.includes(row.client_id)));
}