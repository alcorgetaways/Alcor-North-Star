import { expect, it } from "vitest";
import { followerDelta, metricoolTimelineUrl, timelinePoints, timelineSum } from "./metricool-timelines";
it("official timeline dates include brand offset and LinkedIn uses metricType", () => {
  const u = metricoolTimelineUrl("u", "5728809", "linkedin", "posts", "impressions", "2026-09-01", "2026-09-30");
  expect(u.searchParams.get("from")).toBe("2026-09-01T00:00:00+05:30");
  expect(u.searchParams.get("metricType")).toBe("posts");
  expect(u.searchParams.has("subject")).toBe(false);
});
it("YouTube published videos and legacy account use distinct official endpoints", () => {
  expect(metricoolTimelineUrl("u", "b", "youtube", "videos", "views", "2026-09-01", "2026-09-30").searchParams.get("postsType")).toBe("publishedInRange");
  const u = metricoolTimelineUrl("u", "b", "youtube", "account", "ytsubscribersGained", "2026-09-01", "2026-09-30");
  expect(u.pathname).toBe("/api/stats/timeline/ytsubscribersGained");
  expect(u.searchParams.get("start")).toBe("20260901");
});
it("live Kutani Instagram interactions fixture retains 130 and excludes October points", () => {
  const p = timelinePoints({ data: [{ metric: "postsInteractions", values: [{dateTime:"2026-09-30T12:00:00+0200",value:130},{dateTime:"2026-10-01T12:00:00+0530",value:9}] }] }, "postsInteractions", "2026-09-01", "2026-09-30");
  expect(timelineSum(p)).toBe(130);
  expect(timelineSum([])).toBeNull();
});
it("follower growth uses previous month-end, supports net loss, and requires both boundaries", () => {
  expect(followerDelta([{date:"2026-08-31",value:100},{date:"2026-09-01",value:110},{date:"2026-09-30",value:98}], "2026-08-31", "2026-09-30")).toBe(-2);
  expect(followerDelta([{date:"2026-09-01",value:110},{date:"2026-09-30",value:120}], "2026-08-31", "2026-09-30")).toBeNull();
});
it("legacy subscriber pairs parse string numbers", () => {
  expect(timelineSum(timelinePoints([[String(Date.parse("2026-09-30T00:00:00Z")),"5.0"]],"ytsubscribersGained","2026-09-01","2026-09-30"))).toBe(5);
});