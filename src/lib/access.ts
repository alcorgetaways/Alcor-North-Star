import type { AppRole } from "@/lib/constants";

/**
 * Central page-access map. The route guard (_authenticated/route.tsx) and the
 * sidebar (AppShell) both read this, so the menu and the guard never disagree.
 * Pages not listed here are open to admin + management only.
 */

const M: AppRole[] = ["admin", "management"];
const BD: AppRole[] = [...M, "bd_manager"];
const STAFF: AppRole[] = [...BD, "pipeline_manager", "team_member"];
const PIPE: AppRole[] = [...M, "pipeline_manager", "team_member"];
const OWNER: AppRole[] = [...M, "client"];
const COMMERCIAL: AppRole[] = [...BD, "finance"];

export type PageRule = {
  /** Path pattern; "$id" matches one dynamic segment. */
  path: string;
  roles: AppRole[];
  /** Pipeline code a pipeline manager / team member must manage or back up. "?code" = from the search param. */
  pipeline?: string;
  /** BD managers may open this pipeline page without managing it (marketing oversight). */
  bdView?: boolean;
};

export const ACCESS_MAP: PageRule[] = [
  { path: "/data-sync", roles: ["admin"] },
  { path: "/kpi-progress", roles: M },
  { path: "/activity-settings", roles: ["admin"] },
  { path: "/home", roles: OWNER },
  { path: "/my-launch", roles: OWNER },
  { path: "/my-growth", roles: OWNER },
  { path: "/notifications", roles: [...STAFF, "finance", "hr", "client"] },
  { path: "/dashboard", roles: STAFF },
  { path: "/my-tasks", roles: STAFF },
  { path: "/launch-overview", roles: BD },
  { path: "/clients", roles: [...STAFF, "finance"] },
  { path: "/clients/new", roles: BD },
  { path: "/clients/$id", roles: [...STAFF, "finance"] },
  { path: "/launches/$id", roles: [...STAFF, "finance"] },
  { path: "/activation-requests", roles: BD },
  { path: "/onboarding", roles: BD },
  { path: "/onboarding-sop", roles: BD },
  { path: "/weekly", roles: PIPE, pipeline: "performance_marketing" },
  { path: "/social", roles: [...PIPE, "bd_manager"], pipeline: "social_media", bdView: true },
  { path: "/gbp", roles: [...PIPE, "bd_manager"], pipeline: "gbp", bdView: true },
  { path: "/gbp/performance/$id", roles: [...PIPE, "bd_manager"], pipeline: "gbp", bdView: true },
  { path: "/social/performance/$id", roles: [...PIPE, "bd_manager"], pipeline: "social_media", bdView: true },
  { path: "/ota", roles: PIPE, pipeline: "ota" },
  { path: "/pipeline-kpis", roles: PIPE, pipeline: "?code" },
  { path: "/reports", roles: STAFF },
  { path: "/reports/$id", roles: STAFF },
  // Pipeline heads propose next month's targets; management approves (the list itself is scoped in the database).
  { path: "/targets", roles: PIPE },
  { path: "/scorecard", roles: [...STAFF, "hr"] },
  { path: "/questions", roles: STAFF },
  { path: "/actions", roles: STAFF },
  { path: "/team", roles: BD },
  { path: "/plans", roles: COMMERCIAL },
  { path: "/access", roles: M },
  { path: "/finance", roles: [...M, "finance"] },
  // Bookings ledger + sales dashboard: finance/admin/management, plus the Reservation Desk head.
  { path: "/sales", roles: [...M, "finance", "bd_manager", "pipeline_manager", "team_member"], pipeline: "head:reservations_desk" },
  { path: "/hr", roles: [...M, "hr"] },
  // Reservation Desk: associates log their own day; the head + management see the whole desk.
  { path: "/my-performance", roles: PIPE, pipeline: "reservations_desk" },
  { path: "/reservation-desk", roles: [...M, "pipeline_manager", "team_member"], pipeline: "head:reservations_desk" },
  { path: "/kpis", roles: M },
  { path: "/review", roles: M },
  { path: "/styleguide", roles: M },
];

export const DEFAULT_PIPELINE_CODE = "performance_marketing";

function matches(pattern: string, pathname: string) {
  const a = pattern.split("/").filter(Boolean);
  const b = pathname.split("/").filter(Boolean);
  if (a.length !== b.length) return false;
  return a.every((seg, i) => seg === "$id" || seg === b[i]);
}

export function findRule(pathname: string): PageRule | undefined {
  // Exact segments win over "$id" (e.g. /clients/new vs /clients/$id).
  const exact = ACCESS_MAP.find((r) => !r.path.includes("$") && matches(r.path, pathname));
  return exact ?? ACCESS_MAP.find((r) => matches(r.path, pathname));
}

export function canAccess(
  pathname: string,
  search: Record<string, unknown> | undefined,
  roles: AppRole[],
  managedCodes: string[],
): boolean {
  const rule = findRule(pathname);
  const allowed = rule?.roles ?? M;
  if (!roles.some((r) => allowed.includes(r))) return false;
  if (!rule?.pipeline) return true;
  if (roles.some((r) => M.includes(r) || r === "finance")) return true;
  if (rule.bdView && roles.includes("bd_manager")) return true;
  const code =
    rule.pipeline === "?code" ? String(search?.["code"] ?? DEFAULT_PIPELINE_CODE) : rule.pipeline;
  return managedCodes.includes(code);
}

export function isStaffRoles(roles: AppRole[]) {
  return roles.some((r) => r !== "client");
}

export function homeFor(
  roles: AppRole[],
  managedCodes: string[] = [],
): "/dashboard" | "/finance" | "/hr" | "/home" | "/no-access" | "/gbp" | "/social" {
  if (roles.some((r) => r === "admin" || r === "management")) return "/dashboard";
  if (roles.includes("finance")) return "/finance";
  if (roles.includes("hr")) return "/hr";
  // GBP / Social pipeline heads and teams land on their performance dashboard.
  if (!roles.includes("bd_manager") && roles.some((r) => r === "pipeline_manager" || r === "team_member")) {
    if (managedCodes.includes("gbp")) return "/gbp";
    if (managedCodes.includes("social_media")) return "/social";
  }
  if (isStaffRoles(roles)) return "/dashboard";
  if (roles.includes("client")) return "/home";
  return "/no-access";
}
