/** Last day (IST) on which BD must update both North Star and the BD tracker "Clients" tab. After it, North Star is the only truth. */
export const DUAL_TRACKER_UNTIL = "2026-11-30";

export function showDualTrackerBanner(todayIst: string): boolean {
  return todayIst <= DUAL_TRACKER_UNTIL;
}
