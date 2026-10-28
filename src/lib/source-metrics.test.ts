import { expect, it } from "vitest";
import { mainSourceMetrics, socialSourceMetrics } from "./source-metrics";

it("Social cards read verified subscriber and interaction keys without requiring a legacy posts key", () => {
  const values = { "instagram.new_subscribers": 3, "instagram.interactions": 130, "youtube.new_subscribers": -2, "youtube.interactions": 0 };
  const metrics = socialSourceMetrics(Object.keys(values));
  expect(metrics.filter((metric) => metric.label.endsWith("new subscribers") || metric.label.endsWith("interactions")).map((metric) => values[metric.key as keyof typeof values])).toEqual([3, -2, 130, 0]);
});
it("Verified Social keys take precedence while legacy-only histories remain readable", () => {
  expect(socialSourceMetrics(["facebook.posts", "facebook.new_followers", "facebook.new_subscribers", "facebook.engagement", "facebook.interactions"]).map((metric) => metric.key)).toContain("facebook.new_subscribers");
  expect(socialSourceMetrics(["facebook.posts", "facebook.new_followers", "facebook.engagement"]).map((metric) => metric.key)).toEqual(["posts_total", "facebook.posts", "facebook.content_views", "facebook.new_followers", "facebook.engagement"]);
});
it("GBP Main uses exactly six official metrics without removing the All list", () => {
  const all = ["views", "calls", "chat_clicks", "booking_clicks", "website_clicks", "direction_requests", "new_reviews"].map((key) => ({ key, label: key }));
  expect(mainSourceMetrics("localo", all).map((metric) => metric.key)).toEqual(["views", "calls", "chat_clicks", "booking_clicks", "direction_requests", "website_clicks"]);
  expect(all.map((metric) => metric.key)).toContain("new_reviews");
});
it("Batch 6: plain per-channel post counts appear in the breakdown (Pinterest pins, YouTube videos, LinkedIn posts)", () => {
  const metrics = socialSourceMetrics(["pinterest.posts", "youtube.posts", "linkedin.posts", "instagram.posts_feed"]);
  const labels = metrics.map((m) => m.label);
  expect(labels).toContain("Pinterest pins");
  expect(labels).toContain("YouTube videos");
  expect(labels).toContain("LinkedIn posts");
  expect(metrics.find((m) => m.key === "pinterest.posts")).toBeTruthy();
});
