type Post = Record<string, unknown>;
const object = (v: unknown): Post => v && typeof v === "object" && !Array.isArray(v) ? v as Post : {};

/**
 * Count one network's rows from the brand-summary publication list.
 * Batch 6 audit fix: dedupe by post id and keep only rows whose publication
 * date (Asia/Kolkata wall date) falls inside the requested month — the shared
 * list could otherwise count duplicate or out-of-period videos.
 */
export function countNetworkPosts(rows: Post[], platform: string, month: string, end: string): Post[] {
  const seen = new Set<string>();
  return rows.filter((p) => {
    if (!String(p['network'] ?? p['networkConnection']).startsWith(platform)) return false;
    const id = String(p['id'] ?? "");
    if (id) {
      if (seen.has(id)) return false;
      seen.add(id);
    }
    const dateTime = object(p['publicationDate'])['dateTime'];
    const day = typeof dateTime === "string" ? dateTime.slice(0, 10) : "";
    return day >= month && day <= end;
  });
}

/** Verified format-list REST fields, not the catalogue IDs (which REST aggregation rejects). */
export function metricoolFormatValues(lists: Record<string, Post[] | null>): Record<string, number | null> {
  const values: Record<string, number | null> = {};
  const specs = [
    ["instagram", "posts_feed", "posts/instagram", "views"], ["instagram", "posts_reels", "reels/instagram", "views"], ["instagram", "posts_stories", "stories/instagram", "views"],
    ["facebook", "posts_feed", "posts/facebook", "totalMediaViews"], ["facebook", "posts_reels", "reels/facebook", "views"], ["facebook", "posts_stories", "stories/facebook", "views"],
    ["linkedin", "posts", "posts/linkedin", "impressions"], ["linkedin", "posts_newsletter", "newsletters/linkedin", "impressions"],
  ];
  for (const [platform, format, path, viewKey] of specs) {
    if (!platform || !format || !path || !viewKey) continue;
    const rows = lists[path];
    if (!rows) continue;
    values[`${platform}.${format}`] = rows.length;
    const sum = (key: string) => rows.length && rows.every((r) => typeof r[key] === "number") ? rows.reduce((a, r) => a + Number(r[key]), 0) : null;
    values[`${platform}.${format}_views`] = sum(viewKey);
    values[`${platform}.${format}_interactions`] = sum("interactions");
  }
  // Pinterest pins carry flat fields (impressions/saves/pinClicks/outboundClicks), not a metrics map.
  const pins = lists["posts/pinterest"];
  if (pins) {
    values["pinterest.posts"] = pins.length;
    const pinSum = (key: string) => pins.length && pins.every((r) => typeof r[key] === "number") ? pins.reduce((a, r) => a + Number(r[key]), 0) : null;
    values["pinterest.posts_views"] = pinSum("impressions");
    const parts = ["saves", "pinClicks", "outboundClicks"].map(pinSum);
    values["pinterest.posts_interactions"] = parts.every((v) => typeof v === "number") ? parts.reduce<number>((a, v) => a + Number(v), 0) : null;
  }
  for (const [platform, formats] of Object.entries({ instagram: ["posts_feed", "posts_reels", "posts_stories"], facebook: ["posts_feed", "posts_reels", "posts_stories"], linkedin: ["posts", "posts_newsletter"], pinterest: ["posts"] })) {
    const counts = formats.map((f) => values[`${platform}.${f}`]);
    // Never pretend absent stories are zero or publish an incomplete total.
    if (counts.every((v) => typeof v === "number")) values[`${platform}.publications_total`] = counts.reduce<number>((a, v) => a + Number(v), 0);
    const views = formats.map((f) => values[`${platform}.${f}_views`]);
    if (views.every((v) => typeof v === "number")) {
      values[`${platform}.publication_views`] = views.reduce<number>((a, v) => a + Number(v), 0);
      values[`${platform}.content_views`] = values[`${platform}.publication_views`] ?? null;
    }
  }
  return values;
}
