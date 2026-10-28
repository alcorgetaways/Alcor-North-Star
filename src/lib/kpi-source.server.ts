import { backoffDelay } from "@/lib/kpi-sync-plan";
import { countNetworkPosts, metricoolFormatValues } from "@/lib/metricool-main";
import { followerDelta, metricoolTimelineUrl, timelinePoints, timelineSum } from "@/lib/metricool-timelines";
type Json = Record<string, unknown>;
export type SourceCredentials = { metricoolToken: string; metricoolUser: string; localoToken: string; localoOrg: string };
export type SourceProfile = { id: string; name: string };
const record = (v: unknown): Json => v && typeof v === "object" && !Array.isArray(v) ? v as Json : {};
function redact(text: string, credentials: SourceCredentials) {
  return Object.values(credentials).filter(Boolean).reduce((s, value) => s.replaceAll(value, "[redacted]"), text).slice(0, 1500);
}
async function checked(response: Response, credentials: SourceCredentials): Promise<unknown> {
  const text = await response['text']();
  if (!response.ok) throw new Error(`Source HTTP ${response.status}: ${redact(text, credentials)}`);
  try { return JSON.parse(text); } catch { throw new Error("Source returned an invalid response"); }
}
export async function localoSession(c: SourceCredentials) {
  if (!c.localoToken || !c.localoOrg) throw new Error("Localo credentials are missing");
  const headers = new Headers({ Authorization: `Bearer ${c.localoOrg.trim()}:${c.localoToken.trim()}`, Accept: "application/json, text/event-stream", "Content-Type": "application/json" });
  let sequence = 0;
  const rpc = async (method: string, params: Json) => {
    const id = ++sequence;
    // Localo rate-limits (429): retry with exponential backoff + jitter, honouring Retry-After.
    let response = await fetch("https://api.localo.com/api/mcp", { method: "POST", headers, body: JSON.stringify({ jsonrpc: "2.0", id, method, params }) });
    for (let attempt = 0; response.status === 429 && attempt < 4; attempt++) {
      const after = Number(response.headers.get("Retry-After"));
      await new Promise((r) => setTimeout(r, Number.isFinite(after) && after > 0 ? Math.min(after * 1000, 30_000) : backoffDelay(attempt)));
      response = await fetch("https://api.localo.com/api/mcp", { method: "POST", headers, body: JSON.stringify({ jsonrpc: "2.0", id, method, params }) });
    }
    const session = response.headers.get("Mcp-Session-Id"); if (session) headers.set("Mcp-Session-Id", session);
    const text = await response['text']();
    if (!response.ok) throw new Error(`Localo HTTP ${response.status}: ${redact(text, c)}`);
    let payload: Json;
    try { payload = record(JSON.parse(text)); } catch {
      const line = text.split("\n").filter((l) => l.startsWith("data:")).map((l) => record(JSON.parse(l.slice(5)))).find((v) => v['id'] === id);
      payload = line ?? {};
    }
    if (payload['error']) throw new Error(redact(JSON.stringify(payload['error']), c));
    return record(payload['result']);
  };
  const initialized = await rpc("initialize", { protocolVersion: "2024-11-05", capabilities: {}, clientInfo: { name: "NorthStar", version: "1" } });
  headers.set("MCP-Protocol-Version", String(initialized['protocolVersion'] ?? "2024-11-05"));
  await fetch("https://api.localo.com/api/mcp", { method: "POST", headers, body: JSON.stringify({ jsonrpc: "2.0", method: "notifications/initialized" }) });
  const catalog = await rpc("tools/list", {});
  const tools = Array.isArray(catalog['tools']) ? catalog['tools'].map(record) : [];
  if (!tools.some((t) => t['name'] === "query" && record(t['annotations'])['readOnlyHint'] === true)) throw new Error("Localo read-only query tool is unavailable");
  return async (query: string, variables: Json = {}) => {
    if (!/^\s*query\b/.test(query) || /\bmutation\b/.test(query)) throw new Error("Only read-only Localo queries are allowed");
    const result = await rpc("tools/call", { name: "query", arguments: { query, variables } });
    const content = Array.isArray(result['content']) ? result['content'].map(record) : [];
    const payload = record(JSON.parse(content.map((v) => v['text'] ?? "").join("")));
    if (result['isError'] || payload['errors']) throw new Error(redact(JSON.stringify(payload['errors'] ?? payload), c));
    return record(payload['data']);
  };
}
export async function listSourceProfiles(source: string, c: SourceCredentials): Promise<SourceProfile[]> {
  if (source === "metricool") {
    if (!c.metricoolToken || !c.metricoolUser) throw new Error("Metricool credentials are missing");
    const url = new URL("https://app.metricool.com/api/admin/simpleProfiles"); url.searchParams.set("userId", c.metricoolUser);
    const value = await checked(await fetch(url, { headers: { "X-Mc-Auth": c.metricoolToken } }), c);
    const rows = Array.isArray(value) ? value : record(value)['data'];
    return (Array.isArray(rows) ? rows : []).map(record).map((v) => ({ id: String(v['id']), name: String(v['label'] ?? v['title'] ?? "Unnamed profile") }));
  }
  const query = await localoSession(c); const profiles: SourceProfile[] = [];
  for (let page = 1; page <= 100; page++) {
    const data = await query("query PlaceList($input: PlaceListFiltersInput!) { placesList(input: $input) { places { id title address } totalCount } }", { input: { pageNo: page, pageSize: 20, active: true } });
    const result = record(data['placesList']); const rows = Array.isArray(result['places']) ? result['places'].map(record) : [];
    profiles.push(...rows.map((v) => ({ id: String(v['id']), name: String(v['title']) })));
    if (!rows.length || profiles.length >= Number(result['totalCount'])) break;
  }
  return profiles;
}
export async function fetchSourceMonth(source: string, external: string, month: string, c: SourceCredentials) {
  const end = new Date(Date.UTC(Number(month.slice(0, 4)), Number(month.slice(5, 7)), 0)).toISOString().slice(0, 10);
  const values: Record<string, number | null> = {};
  if (source === "metricool") {
    const url = new URL("https://app.metricool.com/api/v2/analytics/brand-summary/posts");
    for (const [k,v] of Object.entries({ userId: c.metricoolUser, blogId: external, from: `${month}T00:00:00`, to: `${end}T23:59:59`, timezone: "Asia/Kolkata" })) url.searchParams.set(k,v);
    const raw = record(await checked(await fetch(url, { headers: { "X-Mc-Auth": c.metricoolToken } }), c));
    if (!Array.isArray(raw['data'])) throw new Error("Metricool monthly posts were not returned");
    if (record(raw['page'])['next'] || record(raw['page'])['nextCursor']) throw new Error("Metricool returned a partial page; monthly total withheld");
    // Batch 6 audit: Pinterest was dropped from counts; all networks are deduped by id and
    // restricted to rows published inside the month (duplicate/out-of-period videos excluded).
    for (const platform of ["instagram", "facebook", "youtube", "linkedin", "pinterest"]) {
      const posts = countNetworkPosts(raw['data'].map(record), platform, month, end);
      if (!posts.length) continue;
      values[`${platform}.posts`] = posts.length;
      const views = posts.map((p) => { const metrics=record(p['metrics']);return metrics['VIEWS'] ?? metrics['views'] ?? metrics['IMPRESSIONS']; }).filter((v): v is number => typeof v === "number");
      if (views.length === posts.length) values[`${platform}.content_views`] = views.reduce((a,b) => a+b,0);
    }
    const formats = await fetchMetricoolMainMonth(external, month, c);
    return { values: { ...values, ...formats.values }, raw: { posts: raw['data'].map(record).map((p) => ({ network: p['network'], date: p['publicationDate'], metrics: p['metrics'] })), main_formats: formats.raw, coverage: "Official offset-aware timelines and publication lists; unavailable metrics remain blank" } };
  }
  const query = await localoSession(c);
  const metrics: Array<[string, string[]]> = [["views", ["BUSINESS_IMPRESSIONS_DESKTOP_MAPS", "BUSINESS_IMPRESSIONS_MOBILE_MAPS", "BUSINESS_IMPRESSIONS_DESKTOP_SEARCH", "BUSINESS_IMPRESSIONS_MOBILE_SEARCH"]], ["calls", ["CALL_CLICKS"]], ["website_clicks", ["WEBSITE_CLICKS"]], ["direction_requests", ["BUSINESS_DIRECTION_REQUESTS"]], ["chat_clicks", ["BUSINESS_CONVERSATIONS"]], ["booking_clicks", ["BUSINESS_BOOKINGS"]]];
  const raw: Json = {};
  for (const [key, keys] of metrics) {
    const data = await query("query MetricSeries($args: GoogleMetricSeriesArgs!) { googleMetricSeries(args: $args) { value date } }", { args: { placeId: external, metrics: keys, dateStart: month, dateEnd: end } });
    const points = Array.isArray(data['googleMetricSeries']) ? data['googleMetricSeries'].map(record) : [];
    const numbers = points.map((v) => v['value']).filter((v): v is number => typeof v === "number");
    values[key] = numbers.length ? numbers.reduce((a,b) => a+b,0) : null; raw[key] = points;
  }
  const detail = await query("query Place($placeId: GUID!) { place(id: $placeId) { latestPlaceSnapshot { rating reviewsCount } } }", { placeId: external });
  raw['profile_snapshot'] = record(record(detail['place'])['latestPlaceSnapshot']);
  const reviews = await query("query ReviewsChart($placeId: GUID) { reviewsChart(placeId: $placeId) { month stats { total reviewsOneStars reviewsTwoStars reviewsThreeStars reviewsFourStars reviewsFiveStars } } }", { placeId: external });
  raw['review_series'] = reviews['reviewsChart'];
  const reviewSeries = Array.isArray(reviews['reviewsChart']) ? reviews['reviewsChart'].map(record) : [];
  const reviewMonth = reviewSeries.find((v)=>String(v['month']).slice(0,7)===month.slice(0,7));
  const reviewTotal=record(reviewMonth?.['stats'])['total'];
  values['reviews_received'] = typeof reviewTotal==='number'?reviewTotal:null;
  const fiveStar=record(reviewMonth?.['stats'])['reviewsFiveStars'];
  values['five_star_reviews']=typeof fiveStar==='number'?fiveStar:null;
  const keywords = await query("query PlaceKeywords($placeId: GUID!) { place(id: $placeId) { activePlaceKeywords { id keyword } } }", { placeId: external });
  const keywordList = record(keywords['place'])['activePlaceKeywords'];
  raw['rankings'] = [];
  for (const keyword of Array.isArray(keywordList) ? keywordList.map(record) : []) {
    const grids: Json[] = []; let after: unknown = undefined;
    for (let page=0;page<100;page++) {
      const data = await query("query PositionTrend($placeKeywordId: GUID!, $from: DateTime!, $to: DateTime!, $after: GUID) { placeKeyword(id: $placeKeywordId) { positionTrend(from: $from, to: $to, after: $after) { grids { id insertedAt orderedPlacePosition competitorsCount } nextCursor } } }", { placeKeywordId: keyword['id'], from: `${month}T00:00:00Z`, to: new Date(Date.UTC(Number(month.slice(0,4)),Number(month.slice(5,7)),1)).toISOString(), ...(after ? {after} : {}) });
      const trend=record(record(data['placeKeyword'])['positionTrend']);
      grids.push(...(Array.isArray(trend['grids']) ? trend['grids'].map(record) : [])); after=trend['nextCursor']; if(!after)break;
    }
    (raw['rankings'] as Json[]).push({keyword:keyword['keyword'],grids});
    const positions=grids.map((g)=>g['orderedPlacePosition']).filter((v):v is number=>typeof v==="number");
    values[`keyword_rank.${String(keyword['keyword'])}`]=positions.length?positions.reduce((a,b)=>a+b,0)/positions.length:null;
  }
  // Snapshot ratings are retained with provenance, never mislabeled as historic monthly values.
  return { values, raw };
}

export async function fetchMetricoolMainMonth(external: string, month: string, c: SourceCredentials) {
  const end = new Date(Date.UTC(Number(month.slice(0, 4)), Number(month.slice(5, 7)), 0)).toISOString().slice(0, 10);
  const lists: Record<string, Json[] | null> = {};
  const unavailable: Record<string, string> = {};
  const paths = ["posts/instagram", "reels/instagram", "stories/instagram", "posts/facebook", "reels/facebook", "stories/facebook", "posts/linkedin", "newsletters/linkedin", "posts/pinterest"];
  for (const path of paths) {
    const url = new URL(`https://app.metricool.com/api/v2/analytics/${path}`);
    for (const [key, value] of Object.entries({ userId: c.metricoolUser, blogId: external, from: `${month}T00:00:00`, to: `${end}T23:59:59`, timezone: "Asia/Kolkata" })) url.searchParams.set(key, value);
    const response = await fetch(url, { headers: { "X-Mc-Auth": c.metricoolToken } });
    if (!response.ok) { unavailable[path] = `HTTP ${response.status}`; lists[path] = null; continue; }
    const payload = record(await checked(response, c));
    if (!Array.isArray(payload['data']) || record(payload['page'])['nextCursor'] || record(payload['page'])['next']) { unavailable[path] = "Incomplete or unsupported response"; lists[path] = null; continue; }
    lists[path] = payload['data'].map(record);
  }
  const timelines = await fetchMetricoolTimelines(external, month, c);
  return { values: { ...metricoolFormatValues(lists), ...timelines.values }, raw: { lists, unavailable, timelines: timelines.raw, semantics: "Publication views relate to content published in range, not account-wide daily views. Empty unsupported timelines remain missing." } };
}

export async function fetchMetricoolTimelines(external: string, month: string, c: SourceCredentials) {
  const end = new Date(Date.UTC(Number(month.slice(0, 4)), Number(month.slice(5, 7)), 0)).toISOString().slice(0, 10);
  const previousEnd = new Date(Date.parse(`${month}T00:00:00Z`) - 86400000).toISOString().slice(0, 10);
  const raw: Json = {}; const values: Record<string, number | null> = {};
  const read = async (network: string, subject: string, metric: string, start = month) => {
    const url = metricoolTimelineUrl(c.metricoolUser, external, network, subject, metric, start, end);
    let response = await fetch(url, { headers: { "X-Mc-Auth": c.metricoolToken } });
    for (let i = 0; response.status === 429 && i < 4; i++) {
      await new Promise((r) => setTimeout(r, backoffDelay(i)));
      response = await fetch(url, { headers: { "X-Mc-Auth": c.metricoolToken } });
    }
    if (response.status === 403 || response.status === 500) { raw[`${network}:${subject}:${metric}`] = { unavailable: `HTTP ${response.status} — channel metric unavailable` }; return []; }
    if (!response.ok) throw new Error(`Metricool timeline HTTP ${response.status}`);
    const payload = await checked(response, c);
    raw[`${network}:${subject}:${metric}`] = payload;
    return timelinePoints(payload, metric, start, end);
  };
  for (const network of ["instagram", "facebook", "linkedin", "youtube"]) {
    if (network === "instagram" || network === "facebook") {
      const points = await read(network, "account", network === "instagram" ? "followers" : "pageFollows", previousEnd);
      values[`${network}.new_subscribers`] = followerDelta(points, previousEnd, end);
      values[`${network}.interactions`] = timelineSum(await read(network, "account", "postsInteractions"));
      const feed = timelineSum(await read(network, "posts", "impressions"));
      const reels = timelineSum(await read(network, "reels", network === "instagram" ? "videoviews" : "blue_reels_play_count"));
      // Instagram deprecated impressions/videoViews can be empty: verified REST replacement is views.
      const feedViews = feed ?? (network === "instagram" ? timelineSum(await read(network, "posts", "views")) : null);
      const reelViews = reels ?? (network === "instagram" ? timelineSum(await read(network, "reels", "views")) : null);
      if (feedViews != null && reelViews != null) values[`${network}.publication_views`] = feedViews + reelViews;
      if (network === "instagram") values['instagram.account_views'] = timelineSum(await read(network, "account", "views"));
    } else if (network === "linkedin") {
      values['linkedin.new_subscribers'] = timelineSum(await read(network, "account", "deltaFollowers"));
      values['linkedin.publication_views'] = timelineSum(await read(network, "posts", "impressions"));
      values['linkedin.interactions'] = timelineSum(await read(network, "posts", "interactions"));
    } else {
      const gained = timelineSum(await read(network, "account", "ytsubscribersGained"));
      const lost = timelineSum(await read(network, "account", "ytsubscribersLost"));
      values['youtube.new_subscribers'] = gained == null || lost == null ? null : gained - lost;
      values['youtube.publication_views'] = timelineSum(await read(network, "videos", "views"));
      values['youtube.interactions'] = timelineSum(await read(network, "videos", "interactions"));
    }
    if (values[`${network}.publication_views`] != null) values[`${network}.content_views`] = values[`${network}.publication_views`] ?? null;
  }
  return { values: Object.fromEntries(Object.entries(values).filter(([,v]) => v != null)), raw };
}