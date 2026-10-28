import { describe, expect, it } from "vitest";
import { marketingSearch, parsePropertyIds, selectedProperties } from "./property-filter";
import { profilesOver } from "./source-analytics";

const a = "11111111-1111-4111-8111-111111111111";
const b = "22222222-2222-4222-8222-222222222222";
const c = "33333333-3333-4333-8333-333333333333";
const rows = [a, b, c].map((id, i) => ({ client_id: id, clients: { is_internal: i === 2 }, rows: [{ month: "2026-09-01", values: { views: (i + 1) * 100, calls: i + 1, website_clicks: (i + 1) * 2, direction_requests: (i + 1) * 3, interactions: (i + 1) * 6 }, ranks: {}, approved: true }] }));

describe("Property filter", () => {
  it("round-trips multi-property URL state without losing the performance tab", () => {
    const query = new URLSearchParams({ tab: "performance", props: `${a},${b}`, internal: "true" });
    const parsed = marketingSearch(Object.fromEntries(query));
    expect(parsed.tab).toBe("performance");
    expect(parsePropertyIds(parsed.props)).toEqual([a, b]);
    expect(parsed.internal).toBe(true);
    expect(parsePropertyIds([a, a, "gbp"])).toEqual([a]);
  });
  it("funnel totals equal the sum of the selected properties", () => {
    const series = selectedProperties(rows, [a, b], false).map((r) => r.rows);
    expect(profilesOver(series, ["2026-09-01"], "views")).toBe(300);
    expect(profilesOver(series, ["2026-09-01"], "interactions")).toBe(18);
    expect(profilesOver(series, ["2026-09-01"], "calls")).toBe(3);
    expect(profilesOver(series, ["2026-09-01"], "website_clicks")).toBe(6);
    expect(profilesOver(series, ["2026-09-01"], "direction_requests")).toBe(9);
  });
  it("includes internal profiles only when selected and never falls back for inaccessible IDs", () => {
    expect(selectedProperties(rows, [], false).length).toBe(2);
    expect(selectedProperties(rows, [c], false)).toEqual([]);
    expect(selectedProperties(rows, [c], true).length).toBe(1);
    expect(selectedProperties(rows, ["44444444-4444-4444-8444-444444444444"], true)).toEqual([]);
  });
});