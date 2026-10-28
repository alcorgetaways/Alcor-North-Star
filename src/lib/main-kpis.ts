export type MainKpi = { definition_id: string; name: string; kpi_type: string; unit: string | null; direction: string; main_position: number; main_group: string | null; value: number | null };

export function orderMainKpis<T extends { main_position: number }>(rows: T[]): T[] {
  return [...rows].sort((a, b) => a.main_position - b.main_position);
}

/** Missing values stay missing; net subscriber growth may legitimately be negative. */
export function netSubscribers(gained: number | null, lost: number | null): number | null {
  return gained == null || lost == null ? null : gained - lost;
}
export function formatSum(values: Array<number | null>): number | null {
  return values.length && values.every((v) => v != null) ? values.reduce<number>((a, v) => a + (v ?? 0), 0) : null;
}
export function mergeNewKeys(existing: Record<string, unknown>, incoming: Record<string, unknown>) {
  return { ...incoming, ...existing };
}

/** Sum additive metrics only. Rates, rankings and per-property maxima are not totals. */
export function portfolioMainTotals(rows: Array<MainKpi & { pipeline_code: string; pipeline_name: string }>) {
  const groups = new Map<string, { code: string; name: string; items: MainKpi[] }>();
  for (const row of rows) {
    if (row.kpi_type === "percentage" || row.kpi_type === "rating" || row.unit === "minutes" || row.unit === "rank" || /cost per lead|campaigns live|channels live|active channels/i.test(row.name)) continue;
    let group = groups.get(row.pipeline_code);
    if (!group) { group = { code: row.pipeline_code, name: row.pipeline_name, items: [] }; groups.set(row.pipeline_code, group); }
    const item = group.items.find((k) => k.definition_id === row.definition_id);
    if (!item) group.items.push({ ...row });
    else if (row.value != null) item.value = (item.value ?? 0) + Number(row.value);
  }
  return [...groups.values()].map((g) => ({ ...g, items: orderMainKpis(g.items) }));
}
export function yoyValue(current: number | null, base: number | null): number | null {
  return current == null || base == null || base <= 0 ? null : (current - base) / base * 100;
}

/** Ads cards use only rows already returned by get_my_kpis, with its unchanged owner rule. */
export function ownerAdsMain(rows: Array<{ campaigns_live: number; ad_spend: number; leads: number }>) {
  const spend = rows.reduce((a, r) => a + Number(r.ad_spend ?? 0), 0);
  const leads = rows.reduce((a, r) => a + Number(r.leads ?? 0), 0);
  return [
    { name: "Live ads", value: rows.length ? Math.max(...rows.map((r) => Number(r.campaigns_live ?? 0))) : null, kpi_type: "number" },
    { name: "Ad spend", value: rows.length ? spend : null, kpi_type: "currency" },
    { name: "Leads", value: rows.length ? leads : null, kpi_type: "number" },
    { name: "Cost per lead", value: leads > 0 ? spend / leads : null, kpi_type: "currency" },
  ];
}