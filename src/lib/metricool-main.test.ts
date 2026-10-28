import { expect, it } from "vitest";
import { countNetworkPosts, metricoolFormatValues } from "./metricool-main";
it("Metricool publications include every verified format and sum publication views per channel", () => {
  const v = metricoolFormatValues({ "posts/instagram": [{ views: 100, interactions: 10 }], "reels/instagram": [{ views: 200, interactions: 20 }], "stories/instagram": [{ views: 50, interactions: 5 }] });
  expect(v['instagram.publications_total']).toBe(3);
  expect(v['instagram.publication_views']).toBe(350);
});
it("Unsupported stories and absent numeric views are not invented zeroes", () => {
  const v = metricoolFormatValues({ "posts/instagram": [{ views: 100 }], "reels/instagram": [], "stories/instagram": null });
  expect(v['instagram.publications_total']).toBeUndefined();
  expect(v['instagram.publication_views']).toBeUndefined();
  expect(v['instagram.posts_reels']).toBe(0);
  expect(v['instagram.posts_reels_views']).toBeNull();
});
it("Batch 6: Pinterest pins count toward publications with impressions and interactions", () => {
  const v = metricoolFormatValues({
    "posts/pinterest": [
      { impressions: 4, saves: 1, pinClicks: 2, outboundClicks: 0 },
      { impressions: 10, saves: 0, pinClicks: 1, outboundClicks: 3 },
      { impressions: 6, saves: 2, pinClicks: 0, outboundClicks: 1 },
    ],
  });
  expect(v['pinterest.posts']).toBe(3);
  expect(v['pinterest.posts_views']).toBe(20);
  expect(v['pinterest.posts_interactions']).toBe(10);
  expect(v['pinterest.publications_total']).toBe(3);
  expect(v['pinterest.publication_views']).toBe(20);
});

it("Batch 6: missing Pinterest list stays missing, never zero", () => {
  const v = metricoolFormatValues({ "posts/pinterest": null });
  expect(v['pinterest.posts']).toBeUndefined();
  expect(v['pinterest.publications_total']).toBeUndefined();
});

it("Batch 6: brand-summary counts dedupe by id and drop out-of-period rows", () => {
  const rows = [
    { id: "a", network: "youtube", publicationDate: { dateTime: "2026-08-07T17:55:04" } },
    { id: "a", network: "youtube", publicationDate: { dateTime: "2026-08-07T17:55:04" } },
    { id: "b", network: "youtube", publicationDate: { dateTime: "2026-08-31T20:25:55" } },
    { id: "c", network: "youtube", publicationDate: { dateTime: "2026-07-31T23:30:00" } },
    { id: "d", network: "pinterest", publicationDate: { dateTime: "2026-08-07T17:54:42" } },
  ];
  expect(countNetworkPosts(rows, "youtube", "2026-08-01", "2026-08-31").map((p) => p['id'])).toEqual(["a", "b"]);
  expect(countNetworkPosts(rows, "pinterest", "2026-08-01", "2026-08-31")).toHaveLength(1);
  expect(countNetworkPosts(rows, "instagram", "2026-08-01", "2026-08-31")).toHaveLength(0);
});
