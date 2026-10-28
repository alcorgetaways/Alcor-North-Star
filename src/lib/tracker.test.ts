import { describe, expect, it } from "vitest";
import { showDualTrackerBanner } from "./tracker";
import { compareTrackerRows } from "./tracker-compare";

describe("BD tracker banner", () => {
  it("shows until 30 Nov 2026 inclusive", () => {
    expect(showDualTrackerBanner("2026-10-23")).toBe(true);
    expect(showDualTrackerBanner("2026-11-30")).toBe(true);
  });
  it("is gone from 1 Dec 2026", () => {
    expect(showDualTrackerBanner("2026-12-01")).toBe(false);
  });
});

describe("Compare with BD tracker", () => {
  const ns = [{
    name: "Hardys Retreat", status: "active", plan_code: "diamond_scale", retainer: 40000,
    contact: "Mr Hardy", phone: "9800000000", state: "Himachal Pradesh", destination: "Kasauli",
  }];
  it("lists each differing field and changes nothing", () => {
    const csv = "Hotel Name,Status,Plan,Retainer,Contact Person,Contact Number,State,Destination\n" +
      "Hardy's Retreat,Active,Growing,35000,Mr Hardy,+91 98000 00000,Himachal Pradesh,Shimla\n";
    const r = compareTrackerRows(csv, ns);
    expect(r.differences.map((d) => d.field).sort()).toEqual(["destination", "plan", "retainer"]);
    expect(ns[0]!.retainer).toBe(40000);
  });
  it("reports tracker rows that are not in North Star", () => {
    const csv = "Hotel Name,Status\nNew Place,Active\n";
    expect(compareTrackerRows(csv, ns).not_in_north_star).toEqual(["New Place"]);
  });
});
