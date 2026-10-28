import { describe, expect, it } from "vitest";
import { canAccess, homeFor } from "./access";

describe("page access map", () => {
  it("BD can open staff scorecards", () => {
    expect(canAccess("/scorecard", {}, ["bd_manager"], [])).toBe(true);
  });
  it("only admins maintain holidays and activity types", () => {
    expect(canAccess("/activity-settings", {}, ["admin"], [])).toBe(true);
    for (const role of ["management", "client", "team_member", "pipeline_manager"] as const) {
      expect(canAccess("/activity-settings", {}, [role], [])).toBe(false);
    }
  });
  it("hotel owner cannot open staff pages", () => {
    expect(canAccess("/dashboard", {}, ["client"], [])).toBe(false);
    expect(canAccess("/home", {}, ["client"], [])).toBe(true);
  });
  it("pipeline manager only opens pipelines they manage", () => {
    expect(canAccess("/social", {}, ["pipeline_manager"], ["gbp"])).toBe(false);
    expect(canAccess("/gbp", {}, ["pipeline_manager"], ["gbp"])).toBe(true);
    expect(canAccess("/pipeline-kpis", { code: "ota" }, ["team_member"], ["b2b"])).toBe(false);
  });
  it("BD gets launch overview and plans but not KPI library", () => {
    expect(canAccess("/launch-overview", {}, ["bd_manager"], [])).toBe(true);
    expect(canAccess("/plans", {}, ["bd_manager"], [])).toBe(true);
    expect(canAccess("/kpis", {}, ["bd_manager"], [])).toBe(false);
    expect(canAccess("/plans", {}, ["team_member"], ["gbp"])).toBe(false);
  });
  it("client role is redirected from every admin/staff page", () => {
    const staffPages = [
      "/dashboard", "/my-tasks", "/launch-overview", "/clients", "/clients/new",
      "/launches/abc", "/onboarding", "/onboarding-sop", "/weekly", "/social",
      "/gbp", "/ota", "/pipeline-kpis", "/reports", "/scorecard", "/questions",
      "/actions", "/team", "/plans", "/kpis", "/review",
    ];
    for (const p of staffPages) {
      expect(canAccess(p, {}, ["client"], []), p).toBe(false);
    }
  });
  it("pipeline manager without the code is redirected from pipeline pages", () => {
    expect(canAccess("/weekly", {}, ["pipeline_manager"], ["gbp"])).toBe(false);
    expect(canAccess("/ota", {}, ["team_member"], ["social_media"])).toBe(false);
    expect(canAccess("/pipeline-kpis", { code: "gbp" }, ["pipeline_manager"], ["b2b"])).toBe(false);
  });
  it("sales ledger: finance and Reservation Desk head only", () => {
    expect(canAccess("/sales", {}, ["finance"], [])).toBe(true);
    expect(canAccess("/sales", {}, ["management"], [])).toBe(true);
    expect(canAccess("/sales", {}, ["pipeline_manager"], ["reservations_desk", "head:reservations_desk"])).toBe(true);
    expect(canAccess("/sales", {}, ["team_member"], ["reservations_desk"])).toBe(false);
    expect(canAccess("/sales", {}, ["hr"], [])).toBe(false);
    expect(canAccess("/sales", {}, ["client"], [])).toBe(false);
    expect(canAccess("/sales", {}, ["bd_manager"], [])).toBe(false);
    expect(canAccess("/sales", {}, ["bd_manager"], ["head:reservations_desk"])).toBe(true);
    expect(canAccess("/sales", {}, ["team_member"], ["head:reservations_desk"])).toBe(true);
  });
  it("homes by role", () => {
    expect(homeFor(["client"])).toBe("/home");
    expect(homeFor(["team_member"])).toBe("/dashboard");
    expect(homeFor(["finance"])).toBe("/finance");
    expect(homeFor(["hr"])).toBe("/hr");
    expect(homeFor([])).toBe("/no-access");
  });
  it("finance reads clients and plans but no KPI or pipeline pages", () => {
    expect(canAccess("/clients", {}, ["finance"], [])).toBe(true);
    expect(canAccess("/clients/abc", {}, ["finance"], [])).toBe(true);
    expect(canAccess("/launches/abc", {}, ["finance"], [])).toBe(true);
    expect(canAccess("/plans", {}, ["finance"], [])).toBe(true);
    expect(canAccess("/weekly", {}, ["finance"], ["performance_marketing"])).toBe(false);
    expect(canAccess("/pipeline-kpis", { code: "gbp" }, ["finance"], ["gbp"])).toBe(false);
    expect(canAccess("/kpis", {}, ["finance"], [])).toBe(false);
    expect(canAccess("/dashboard", {}, ["finance"], [])).toBe(false);
  });
  it("hr reads the scorecard but no client or commercial pages", () => {
    expect(canAccess("/scorecard", {}, ["hr"], [])).toBe(true);
    expect(canAccess("/notifications", {}, ["hr"], [])).toBe(true);
    expect(canAccess("/clients", {}, ["hr"], [])).toBe(false);
    expect(canAccess("/plans", {}, ["hr"], [])).toBe(false);
    expect(canAccess("/dashboard", {}, ["hr"], [])).toBe(false);
  });
  it("BD and management see activation requests, others do not", () => {
    expect(canAccess("/activation-requests", {}, ["bd_manager"], [])).toBe(true);
    expect(canAccess("/activation-requests", {}, ["management"], [])).toBe(true);
    expect(canAccess("/activation-requests", {}, ["pipeline_manager"], [])).toBe(false);
    expect(canAccess("/activation-requests", {}, ["client"], [])).toBe(false);
  });
  it("Access page is management-only", () => {
    expect(canAccess("/access", {}, ["admin"], [])).toBe(true);
    expect(canAccess("/access", {}, ["management"], [])).toBe(true);
    expect(canAccess("/access", {}, ["bd_manager"], [])).toBe(false);
    expect(canAccess("/access", {}, ["finance"], [])).toBe(false);
    expect(canAccess("/access", {}, ["hr"], [])).toBe(false);
    expect(canAccess("/access", {}, ["pipeline_manager"], ["social_media"])).toBe(false);
  });
  it("Finance page is finance + management only", () => {
    expect(canAccess("/finance", {}, ["finance"], [])).toBe(true);
    expect(canAccess("/finance", {}, ["admin"], [])).toBe(true);
    expect(canAccess("/finance", {}, ["hr"], [])).toBe(false);
    expect(canAccess("/finance", {}, ["bd_manager"], [])).toBe(false);
    expect(canAccess("/finance", {}, ["team_member"], ["social_media"])).toBe(false);
  });
  it("HR page is hr + management only", () => {
    expect(canAccess("/hr", {}, ["hr"], [])).toBe(true);
    expect(canAccess("/hr", {}, ["management"], [])).toBe(true);
    expect(canAccess("/hr", {}, ["finance"], [])).toBe(false);
    expect(canAccess("/hr", {}, ["bd_manager"], [])).toBe(false);
    expect(canAccess("/hr", {}, ["team_member"], ["performance_marketing"])).toBe(false);
  });
});

describe("marketing landing + BD oversight", () => {
  it("GBP head/team land on GBP Performance, social team on Social Performance", () => {
    expect(homeFor(["pipeline_manager"], ["gbp", "website_seo"])).toBe("/gbp");
    expect(homeFor(["team_member"], ["social_media"])).toBe("/social");
    expect(homeFor(["admin"], ["gbp"])).toBe("/dashboard");
  });
  it("BD manager can open GBP and Social performance without managing them", () => {
    expect(canAccess("/gbp", {}, ["bd_manager"], [])).toBe(true);
    expect(canAccess("/social/performance/x", {}, ["bd_manager"], [])).toBe(true);
    expect(canAccess("/gbp", {}, ["team_member"], ["social_media"])).toBe(false);
  });
});
