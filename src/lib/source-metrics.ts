export type SourceMetric = { key: string; label: string; target?: string };
const CHANNELS = ["instagram", "facebook", "youtube", "linkedin", "tiktok", "twitter", "threads", "pinterest"];
const channelLabel = (channel: string) => channel === "youtube" ? "YouTube" : channel === "linkedin" ? "LinkedIn" : channel.charAt(0).toUpperCase() + channel.slice(1);

/** Display the verified adapter's keys; retain legacy metrics when that is all a profile supplies. */
export function socialSourceMetrics(keys: string[]): SourceMetric[] {
  const channels = CHANNELS.filter((channel) => keys.some((key) => key.startsWith(`${channel}.`)));
  const preferred = (channel: string, current: string, legacy: string) => keys.includes(`${channel}.${current}`) ? `${channel}.${current}` : `${channel}.${legacy}`;
  return [
    { key: "posts_total", label: "Total posts" },
    ...keys.filter((key) => /\.(posts_feed|posts_reels|posts_stories|posts_newsletter|posts)$/.test(key) && !key.endsWith(".posts_total")).sort().map((key) => {
      const channel = key.split(".")[0] ?? "";
      const format = key.split(".")[1] ?? "";
      const label = format === "posts" ? (channel === "pinterest" ? "pins" : channel === "youtube" ? "videos" : "posts") : format.replace("posts_", "");
      return { key, label: `${channelLabel(channel)} ${label}` };
    }),
    ...channels.map((channel) => ({ key: `${channel}.content_views`, label: `${channelLabel(channel)} views on publications` })),
    ...channels.map((channel) => ({ key: preferred(channel, "new_subscribers", "new_followers"), label: `${channelLabel(channel)} new subscribers` })),
    ...channels.map((channel) => ({ key: preferred(channel, "interactions", "engagement"), label: `${channelLabel(channel)} interactions` })),
  ];
}

/** GBP's six official Main metrics; the full source list remains visible separately. */
export function mainSourceMetrics(source: "localo" | "metricool", metrics: SourceMetric[]): SourceMetric[] {
  if (source === "metricool") return metrics;
  const order = ["views", "calls", "chat_clicks", "booking_clicks", "direction_requests", "website_clicks"];
  return order.flatMap((key) => metrics.filter((metric) => metric.key === key));
}