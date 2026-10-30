import { AllKpis, MainKpiCards, MainKpis } from "@/components/MainKpis";
import { PropertyFilter, usePropertySelection } from "@/components/PropertyFilter";
import { selectedProperties } from "@/lib/property-filter";
import type { ReactNode } from "react";
import { Fragment, useMemo, useState } from "react";
import { Link, useNavigate } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { ArrowDown, ArrowUp, ChevronDown, Info } from "lucide-react";
import { Bar, CartesianGrid, Cell, ComposedChart, Legend, Line, LineChart, ReferenceArea, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { supabase } from "@/integrations/supabase/client";
import { fetchAll } from "@/lib/fetch-all";
import { demoIn } from "@/lib/demo";
import { cn } from "@/lib/utils";
import { EmptyState } from "@/components/EmptyState";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { SegmentedPill } from "@/components/SegmentedPill";
import { Tooltip as Tip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { valuesOf, type FetchedRow } from "@/components/FetchedSourcePanel";
import {
  addMonths,
  alcorImpact,
  bucketMonths,
  clipPeriod,
  compareLike,
  lastCompleteMonth,
  pctChange,
  periodLabel,
  periodOptions,
  profilesOver,
  rankBuckets,
  rankGrowth,
  trackedOnly,
  type Compare,
  type Granularity,
  type MonthValues,
} from "@/lib/source-analytics";
import { monthLabel } from "@/lib/kpi";
import { MetricCard as SharedMetricCard } from "@/components/MetricCard";
import { ProgressRing } from "@/components/ProgressRing";
import { signedPct } from "@/lib/format";
import { mainSourceMetrics, socialSourceMetrics } from "@/lib/source-metrics";

export type SourceKind = "localo" | "metricool";
type Metric = { key: string; label: string; target?: string };

const GBP_KPIS: Metric[] = [
  { key: "views", label: "Profile views", target: "gbp.views" },
  { key: "calls", label: "Calls", target: "gbp.calls" },
  { key: "chat_clicks", label: "Chat clicks", target: "gbp.chat_clicks" },
  { key: "booking_clicks", label: "Booking clicks", target: "gbp.booking_clicks" },
  { key: "website_clicks", label: "Website clicks", target: "gbp.website_clicks" },
  { key: "direction_requests", label: "Direction requests", target: "gbp.direction_requests" },
  { key: "interactions", label: "Total interactions" },
  { key: "new_reviews", label: "New reviews" },
  { key: "new_five_star", label: "5-star reviews added", target: "gbp.five_star_reviews" },
];
const MANUAL_GBP: Metric[] = [
  { key: "posts", label: "Posts done" },
  { key: "photos", label: "Pictures uploaded" },
  { key: "chat_clicks", label: "Chat clicks" },
  { key: "booking_clicks", label: "Booking clicks" },
];
const PLATFORMS = ["instagram", "facebook", "youtube", "linkedin", "tiktok", "twitter", "threads", "pinterest"];
const cap = (s: string) => (s === "youtube" ? "YouTube" : s === "linkedin" ? "LinkedIn" : s.charAt(0).toUpperCase() + s.slice(1));

// P6 — KPI dictionary (shown as tooltips and in "How these numbers work").
type Def = { meaning: string; source: string; formula: string; agg: string; limits: string };
const PCT_RULE = "% change = (current − previous) ÷ previous × 100; N/A when previous is 0 or not tracked. Only profiles tracked in both periods are compared.";
export const GBP_DICTIONARY: Record<string, Def> = {
  views: { meaning: "Google impressions of the profile across Search and Maps, mobile and desktop.", source: "Localo → Google BUSINESS_IMPRESSIONS_DESKTOP_MAPS / MOBILE_MAPS / DESKTOP_SEARCH / MOBILE_SEARCH", formula: "Sum of the four impression series", agg: "Summed over the months in the period", limits: "Google may count one person on two surfaces." },
  calls: { meaning: "Taps on the Call button.", source: "Localo → CALL_CLICKS", formula: "Daily values summed", agg: "Summed", limits: "A tap is not a confirmed call or enquiry." },
  chat_clicks: { meaning: "Profile chat actions.", source: "Localo → BUSINESS_CONVERSATIONS", formula: "Daily values summed", agg: "Summed", limits: "Not a confirmed enquiry." },
  booking_clicks: { meaning: "Profile booking actions.", source: "Localo → BUSINESS_BOOKINGS", formula: "Daily values summed", agg: "Summed", limits: "Not confirmed booking revenue." },
  website_clicks: { meaning: "Clicks to the hotel website from the profile.", source: "Localo → WEBSITE_CLICKS", formula: "Daily values summed", agg: "Summed", limits: "Not a booking." },
  direction_requests: { meaning: "Requests for directions to the hotel.", source: "Localo → BUSINESS_DIRECTION_REQUESTS", formula: "Daily values summed", agg: "Summed", limits: "Not a visit." },
  interactions: { meaning: "Total profile actions.", source: "Calculated", formula: "Calls + website clicks + direction requests", agg: "Summed", limits: "Chats and bookings are not included in Localo's feed." },
  new_reviews: { meaning: "Reviews gained in the period.", source: "Localo review history (cumulative total)", formula: "Total at end of period − total at end of the month before, per profile, then summed", agg: "Change across the period", limits: "Profile skipped when either end-point is missing. Review history from Localo starts Nov 2025 for most profiles." },
  new_five_star: { meaning: "5-star reviews gained in the period.", source: "Localo review history (cumulative 5-star total)", formula: "Same per-profile change as New reviews", agg: "Change across the period", limits: "Always ≤ New reviews; skipped when an end-point is missing." },
};
const tipFor = (key: string) => GBP_DICTIONARY[key];

function config(source: SourceKind, keys: string[]) {
  if (source === "localo") return { kpis: GBP_KPIS, primary: "interactions", code: "gbp", name: "Localo", noun: "GBP", minBase: 100 };
  return {
    kpis: socialSourceMetrics(keys),
    primary: "posts_total",
    code: "social_media",
    name: "Metricool",
    noun: "Social",
    minBase: 5,
  };
}

type CpRow = { id: string; client_id: string; start_date: string | null; clients: { hotel_name: string; city: string | null; is_internal: boolean } | null };
export type Profile = { id: string; cp: string; name: string; rows: MonthValues[]; untracked: string[]; first: string | null; last: string | null; fetchedAt: string | null; months: number };

function usePipelineClients(code: string) {
  return useQuery({
    queryKey: ["perf-cps", code],
    staleTime: 5 * 60_000,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("client_pipelines")
        .select("id, client_id, start_date, status, clients!inner(hotel_name, city, is_internal, is_test), pipelines!inner(code)")
        .eq("pipelines.code", code)
        .eq("clients.is_test", false)
        .neq("status", "ended")
        .not("client_id", "in", demoIn());
      if (error) throw error;
      return (data as unknown as CpRow[]).sort((a, b) => (a.clients?.hotel_name ?? "").localeCompare(b.clients?.hotel_name ?? ""));
    },
  });
}

const STALE = 5 * 60_000;

/** Range: Jan two years back → last complete IST month. */
export function aggRange(today = new Date()) {
  const y = today.getUTCFullYear();
  return { from: `${y - 2}-01-01`, to: lastCompleteMonth(today) };
}

/**
 * Per-profile (per mapping) monthly values, read through a security-invoker RPC so the same
 * row-level rules as raw reads apply. Applies the "Not tracked" and running-month rules.
 */
function useProfiles(source: SourceKind) {
  return useQuery({
    queryKey: ["perf-profiles", source],
    staleTime: STALE,
    queryFn: async () => {
      const { from, to } = aggRange();
      const last = lastCompleteMonth();
      const [{ data, error }, names] = await Promise.all([
        supabase.rpc("source_profile_monthly", { _source: source, _from: from, _to: to }),
        supabase.rpc("source_profile_names", { _source: source }),
      ]);
      if (error) throw error;
      const nameOf = new Map((names.data ?? []).map((n) => [n.mapping_id, n.external_name]));
      const grouped = new Map<string, { cp: string; rows: MonthValues[]; fetchedAt: string | null }>();
      for (const r of data ?? []) {
        const id = r.mapping_id ?? r.client_pipeline_id;
        const g = grouped.get(id) ?? { cp: r.client_pipeline_id, rows: [], fetchedAt: null };
        const values = Object.fromEntries(Object.entries((r.vals ?? {}) as Record<string, number>).map(([k, v]) => [k, Number(v)]));
        const posts = Object.entries(values).filter(([k]) => k.endsWith(".posts"));
        if (posts.length) values["posts_total"] = posts.reduce((s, [, v]) => s + v, 0);
        g.rows.push({ month: r.month, values, ranks: {}, approved: r.approved });
        if (r.fetched_at && (!g.fetchedAt || r.fetched_at > g.fetchedAt)) g.fetchedAt = r.fetched_at;
        grouped.set(id, g);
      }
      const by: Record<string, Profile[]> = {};
      for (const [id, g] of grouped) {
        const t = trackedOnly(g.rows, last, source === "localo");
        const list = (by[g.cp] ??= []);
        list.push({ id, cp: g.cp, name: nameOf.get(id) ?? `Profile ${list.length + 1}`, rows: t.rows, untracked: t.untracked, first: t.rows[0]?.month ?? null, last: t.rows.at(-1)?.month ?? null, fetchedAt: g.fetchedAt, months: g.rows.length });
      }
      return by;
    },
  });
}

/** Keyword ranks for one hotel (raw rows, best position across its profiles). */
function useRanks(source: SourceKind, cp: string) {
  return useQuery({
    queryKey: ["perf-ranks", source, cp],
    staleTime: STALE,
    enabled: source === "localo",
    queryFn: async () => {
      const rows = (await fetchAll((from, to) =>
        supabase.from("kpi_fetched_values").select("id, month, status, fetched_values, corrected_values, mapping_id").eq("source", source).eq("client_pipeline_id", cp).eq("is_partial", false).order("month").range(from, to),
      )) as unknown as FetchedRow[];
      const last = lastCompleteMonth();
      const map = new Map<string, MonthValues>();
      for (const r of rows) {
        if (r.month > last) continue;
        const cur = map.get(r.month) ?? { month: r.month, values: {}, ranks: {}, approved: true };
        for (const [k, v] of Object.entries(valuesOf(r))) if (v != null && k.startsWith("keyword_rank.")) cur.ranks[k.slice(13)] = Math.min(cur.ranks[k.slice(13)] ?? Infinity, Number(v));
        map.set(r.month, cur);
      }
      return [...map.values()].sort((a, b) => a.month.localeCompare(b.month));
    },
  });
}

function useMappingStatus(source: SourceKind) {
  return useQuery({
    queryKey: ["perf-mapping", source],
    staleTime: STALE,
    queryFn: async () => {
      const { data, error } = await supabase.rpc("source_mapping_status", { _source: source });
      if (error) throw error;
      return Object.fromEntries((data ?? []).map((r) => [r.client_pipeline_id, r.listings])) as Record<string, number>;
    },
  });
}

function emptyReason(source: SourceKind, listings: number | undefined) {
  const name = source === "localo" ? "Localo" : "Metricool";
  if (!listings) return source === "localo" ? "No GBP profile in Localo" : "No Metricool brand mapped";
  return `${name} profile not verified — no data returned yet`;
}

// ───────────── shared bits ─────────────
const fmt = (v: number | null | undefined, digits = 0) =>
  v == null || Number.isNaN(v) ? "—" : Number(v).toLocaleString("en-IN", { maximumFractionDigits: digits });
const istDateTime = (iso: string | null) =>
  iso ? new Date(iso).toLocaleString("en-IN", { timeZone: "Asia/Kolkata", day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" }) + " IST" : "—";

function Delta({ pct, lowerIsBetter = false }: { pct: number | null; lowerIsBetter?: boolean }) {
  if (pct == null) return <span className="text-label text-muted-foreground">N/A</span>;
  const good = lowerIsBetter ? pct < 0 : pct > 0;
  const Icon = pct >= 0 ? ArrowUp : ArrowDown;
  return (
    <span className={cn("inline-flex items-center gap-0.5 text-label font-medium tabular-nums", pct === 0 ? "text-muted-foreground" : good ? "text-success" : "text-destructive")}>
      <Icon className="h-3 w-3" />
      {Math.abs(pct).toFixed(1)}%
    </span>
  );
}

function InfoTip({ k }: { k: string }) {
  const d = tipFor(k);
  if (!d) return null;
  return (
    <Tip>
      <TooltipTrigger asChild>
        <span role="button" tabIndex={0} aria-label="What this number means" className="inline-flex text-muted-foreground hover:text-foreground" onClick={(e) => e.stopPropagation()}>
          <Info className="h-3.5 w-3.5" />
        </span>
      </TooltipTrigger>
      <TooltipContent className="max-w-xs space-y-1 text-xs">
        <p>{d.meaning}</p>
        <p><span className="font-semibold">Source:</span> {d.source}</p>
        <p><span className="font-semibold">Formula:</span> {d.formula}</p>
        <p><span className="font-semibold">Over a period:</span> {d.agg}</p>
        <p><span className="font-semibold">Limits:</span> {d.limits}</p>
        <p className="text-muted-foreground">{PCT_RULE}</p>
        <p className="text-muted-foreground">Not available from Localo: average rating as monthly history, posts published, photos published and review responses. These are not shown as cards; posts and pictures come from the team's monthly entries.</p>
      </TooltipContent>
    </Tip>
  );
}

function Spark({ data, inverted = false }: { data: Array<number | null>; inverted?: boolean }) {
  const pts = data.map((v, i) => ({ i, v }));
  if (data.every((v) => v == null)) return <div className="h-8 w-24" />;
  return (
    <div className="h-8 w-24">
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={pts}>
          <YAxis hide reversed={inverted} domain={["dataMin", "dataMax"]} />
          <Line type="monotone" dataKey="v" stroke="var(--gold)" strokeWidth={1.75} dot={false} connectNulls isAnimationActive={false} />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}

export function usePeriod(allMonths: string[]) {
  const [gran, setGran] = useState<Granularity>("month");
  const [compare, setCompare] = useState<Compare>("previous");
  const [anchorSel, setAnchor] = useState<string>("");
  const last = lastCompleteMonth();
  const complete = allMonths.filter((m) => m <= last);
  const opts = periodOptions(gran, complete);
  const anchor = opts.includes(anchorSel) ? anchorSel : (opts[0] ?? last);
  const c = clipPeriod(gran, anchor, compare, last);
  const months = c.months.length ? c.months : [last];
  return { gran, setGran, compare, setCompare, anchor, setAnchor, opts, last, months, cmp: c.cmp, label: c.label, cmpLabel: c.cmpLabel, partial: c.partial };
}
type Period = ReturnType<typeof usePeriod>;

export function PeriodBar({ p, children }: { p: Period; children?: ReactNode }) {
  return (
    <div className="card-surface flex flex-wrap items-center gap-3 px-4 py-3">
      <ToggleGroup type="single" value={p.gran} onValueChange={(v) => v && p.setGran(v as Granularity)} className="rounded-md border border-border p-0.5">
        {(["month", "quarter", "year", "ytd"] as const).map((g) => (
          <ToggleGroupItem key={g} value={g} size="sm" className="px-3 text-small data-[state=on]:bg-primary data-[state=on]:text-primary-foreground">
            {g === "ytd" ? "Year-to-date" : g.charAt(0).toUpperCase() + g.slice(1)}
          </ToggleGroupItem>
        ))}
      </ToggleGroup>
      <Select value={p.anchor} onValueChange={p.setAnchor}>
        <SelectTrigger className="h-9 w-56"><SelectValue /></SelectTrigger>
        <SelectContent>
          {p.opts.map((o) => <SelectItem key={o} value={o}>{clipPeriod(p.gran, o, p.compare, p.last).label}</SelectItem>)}
        </SelectContent>
      </Select>
      {children}
      <div className="ml-auto flex flex-wrap items-center gap-2 text-small text-muted-foreground">
        Compare to
        <Select value={p.compare} onValueChange={(v) => p.setCompare(v as Compare)}>
          <SelectTrigger className="h-9 w-48"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="previous">Previous period</SelectItem>
            <SelectItem value="last_year">Same period last year</SelectItem>
          </SelectContent>
        </Select>
        <span className="hidden text-label lg:inline">{p.cmpLabel}</span>
      </div>
      <p className="w-full text-label text-muted-foreground">
        Complete months only — {monthLabel(addMonths(p.last, 1))} is still running (India time) and is never counted.{p.partial ? " Partial period: compared with the same months of the comparison period." : ""}
      </p>
    </div>
  );
}

function last12(anchor: string) {
  return Array.from({ length: 12 }, (_, i) => addMonths(anchor, i - 11));
}

function MetricCard({ k, label, cur, like, spark, pending }: { k: string; label: string; cur: number | null; like: ReturnType<typeof compareLike>; spark: Array<number | null>; pending?: boolean }) {
  return (
    <SharedMetricCard
      label={label}
      value={cur}
      format={(n) => fmt(n)}
      missing="not_tracked"
      info={<InfoTip k={k} />}
      delta={{ pct: like.pct, vs: "like-for-like" }}
      sparkline={spark}
      footer={<>Compared: {like.compared} of {like.total} profiles{pending ? " · Not yet approved" : ""}</>}
    />
  );
}

// P6 — "How these numbers work"
export function HowNumbersWork() {
  const [open, setOpen] = useState(false);
  return (
    <Collapsible open={open} onOpenChange={setOpen} className="card-surface">
      <CollapsibleTrigger className="flex w-full items-center justify-between px-5 py-3 text-left">
        <span className="text-section-title font-semibold">How these numbers work</span>
        <ChevronDown className={cn("h-4 w-4 transition-transform", open && "rotate-180")} />
      </CollapsibleTrigger>
      <CollapsibleContent className="space-y-3 border-t border-border/70 px-5 py-4 text-small">
        <p className="font-medium">These are Google profile interactions, not confirmed enquiries, bookings or revenue.</p>
        <ul className="space-y-2">
          {GBP_KPIS.map((k) => {
            const d = GBP_DICTIONARY[k.key];
            if (!d) return null;
            return (
              <li key={k.key}>
                <span className="font-semibold">{k.label}</span> — {d.meaning} <span className="text-muted-foreground">Source: {d.source}. Formula: {d.formula}. Over a period: {d.agg}. Limits: {d.limits}</span>
              </li>
            );
          })}
        </ul>
        <p className="text-muted-foreground">{PCT_RULE}</p>
        <p className="text-muted-foreground">Not available from Localo: average rating as monthly history, posts published, photos published and review responses. These are not shown as cards; posts and pictures come from the team's monthly entries.</p>
        <p className="text-muted-foreground">Not tracked yet: months before Localo started tracking a profile (Localo returns 0 for every metric) are left out, never counted as zero. The running month is never counted; incomplete quarters and years compare the same months.</p>
      </CollapsibleContent>
    </Collapsible>
  );
}

// P5 — data freshness & completeness
function FreshnessPanel({ source, profiles, cps, mapping, compact = false }: { source: SourceKind; profiles: Profile[]; cps: CpRow[]; mapping: Record<string, number>; compact?: boolean }) {
  const [open, setOpen] = useState(false);
  const withData = profiles.filter((p) => p.first);
  const first = withData.map((p) => p.first!).sort()[0];
  const last = withData.map((p) => p.last!).sort().at(-1);
  const sync = profiles.map((p) => p.fetchedAt).filter((x): x is string => !!x).sort().at(-1) ?? null;
  const empty = cps.filter((c) => !profiles.some((p) => p.cp === c.id && p.rows.length));
  const nameOf = (cp: string) => cps.find((c) => c.id === cp)?.clients?.hotel_name ?? "";
  const reviewsNull = source === "localo" && withData.some((p) => p.rows.some((r) => r.values['reviews_received'] == null));
  const missing = (p: Profile) => {
    if (!p.first || !p.last) return 0;
    let n = 0;
    for (let m = p.first; m <= p.last; m = addMonths(m, 1)) if (!p.rows.some((r) => r.month === m)) n++;
    return n;
  };
  return (
    <section className="card-surface p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-section-title font-semibold">Data freshness</h2>
          <p className="text-small">Data range: <span className="font-medium">{first ? `${monthLabel(first)} → ${monthLabel(last!)}` : "—"}</span> · Last successful sync: <span className="font-medium">{istDateTime(sync)}</span></p>
          {reviewsNull ? <p className="text-label text-muted-foreground">Review history from Localo starts Nov 2025 for most profiles; earlier review counts are blank.</p> : null}
          {empty.map((c) => <p key={c.id} className="text-label text-warning">{c.clients?.hotel_name}: {emptyReason(source, mapping[c.id])}</p>)}
        </div>
        {!compact || profiles.length > 1 ? (
          <button className="text-small font-medium text-primary hover:underline" onClick={() => setOpen((o) => !o)}>{open ? "Hide" : "Show"} per profile</button>
        ) : null}
      </div>
      {open || (compact && profiles.length === 1) ? (
        <div className="mt-3 overflow-x-auto">
          <table className="w-full text-small">
            <thead className="text-left text-label text-muted-foreground">
              <tr><th className="py-1 pr-3">Profile</th><th className="py-1 pr-3">Range</th><th className="py-1 pr-3 text-right">Tracked</th><th className="py-1 pr-3 text-right">Not tracked</th><th className="py-1 pr-3 text-right">Missing</th><th className="py-1">Last sync</th></tr>
            </thead>
            <tbody>
              {profiles.map((p) => (
                <tr key={p.id} className="border-t border-border/60">
                  <td className="py-1 pr-3">{compact ? p.name : `${nameOf(p.cp)} · ${p.name}`}</td>
                  <td className="py-1 pr-3 whitespace-nowrap">{p.first ? `${monthLabel(p.first)} → ${monthLabel(p.last!)}` : "—"}</td>
                  <td className="py-1 pr-3 text-right tabular-nums">{p.rows.length}</td>
                  <td className="py-1 pr-3 text-right tabular-nums">{p.untracked.length}</td>
                  <td className="py-1 pr-3 text-right tabular-nums">{missing(p)}</td>
                  <td className="py-1 whitespace-nowrap">{istDateTime(p.fetchedAt)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : null}
    </section>
  );
}

// ───────────── PORTFOLIO ─────────────
type SortKey = "name" | string;

/** Presentational funnel from values already summed by profilesOver(). Bookings are not tracked from GBP. */
function GbpFunnel({ series, months }: { series: Parameters<typeof profilesOver>[0]; months: string[] }) {
  const v = (k: string) => profilesOver(series, months, k);
  const views = v("views"), interactions = v("interactions");
  const conversion = views != null && views > 0 && interactions != null ? interactions / views * 100 : null;
  return (
    <section className="p-5 border-y border-border" aria-label="Profile views to bookings funnel">
      <h2 className="text-section-title font-semibold">From profile views to bookings</h2>
      <div className="mt-4 grid gap-5 md:grid-cols-3">
        <div><p className="text-label-muted">Profile views</p><p className="mt-2 text-[1.75rem] font-semibold tabular-nums">{fmt(views)}</p></div>
        <div><p className="text-label-muted">Interactions</p><p className="mt-2 text-[1.75rem] font-semibold tabular-nums">{fmt(interactions)}</p><p className="mt-1 text-sm text-muted-foreground">{conversion == null ? "Conversion not available" : `${fmt(conversion, 1)}% of views → interactions`}</p>
          <dl className="mt-3 space-y-1 border-l-2 border-gold pl-3" aria-label="Interaction breakdown">{[["Calls", "calls"], ["Website clicks", "website_clicks"], ["Directions", "direction_requests"]].map(([label, key]) => <div key={key} className="flex justify-between gap-3 text-sm"><dt>{label}</dt><dd className="font-semibold tabular-nums">{fmt(v(key ?? ""))}</dd></div>)}</dl>
        </div>
        <div><p className="text-label-muted">Bookings</p><p className="mt-2 text-sm text-muted-foreground">Not tracked yet</p></div>
      </div>
    </section>
  );
}

function SelectedPropertyTrend({ source, cp, profiles, p }: { source: SourceKind; cp: CpRow; profiles: Profile[]; p: Period }) {
  const { data: ranks = [] } = useRanks(source, cp.id);
  const metric = source === "localo" ? "interactions" : "posts_total";
  const data = last12(p.months.at(-1) ?? p.last).map((month) => ({ label: monthLabel(month), value: profilesOver(profiles.map((x) => x.rows), [month], metric) }));
  return <section className="space-y-4 border-y border-border py-5">
    <div className="flex flex-wrap items-center justify-between gap-3"><h2 className="text-section-title font-semibold">{cp.clients?.hotel_name} · trend</h2><Link className="text-sm font-medium text-primary hover:underline" to={source === "localo" ? "/gbp/performance/$clientPipelineId" : "/social/performance/$clientPipelineId"} params={{ clientPipelineId: cp.id }}>Open full dashboard →</Link></div>
    <div className="h-64"><ResponsiveContainer width="100%" height="100%"><LineChart data={data}><CartesianGrid vertical={false} stroke="var(--border)" /><XAxis dataKey="label" tick={{fontSize:11}} /><YAxis width={48} tick={{fontSize:11}} /><Tooltip /><Line dataKey="value" name={source === "localo" ? "Interactions" : "Posts"} stroke="var(--gold)" dot={false} isAnimationActive={false} /></LineChart></ResponsiveContainer></div>
    {source === "localo" ? <KeywordPanel rows={ranks} p={p} /> : null}
  </section>;
}

export function SourcePortfolio({ source }: { source: SourceKind }) {
  const navigate = useNavigate();
  const code = source === "localo" ? "gbp" : "social_media";
  const { data: visibleCps = [], isLoading } = usePipelineClients(code);
  const selection = usePropertySelection();
  const cps = useMemo(() => selectedProperties(visibleCps, selection.ids, selection.includeInternal), [visibleCps, selection.ids, selection.includeInternal]);
  const { data: agg, isLoading: loadingData } = useProfiles(source);
  const { data: mapping = {} } = useMappingStatus(source);
  const byCp = useMemo(() => Object.fromEntries(cps.map((c) => [c.id, agg?.[c.id] ?? []])) as Record<string, Profile[]>, [agg, cps]);
  const allProfiles = useMemo(() => Object.values(byCp).flat(), [byCp]);
  const series = useMemo(() => allProfiles.map((p) => p.rows), [allProfiles]);
  const allMonths = useMemo(() => Array.from(new Set(series.flatMap((r) => r.map((x) => x.month)))).sort(), [series]);
  const allKeys = useMemo(() => Array.from(new Set(series.flatMap((r) => r.flatMap((x) => Object.keys(x.values))))), [series]);
  const cfg = config(source, allKeys);
  const p = usePeriod(allMonths);
  const [sort, setSort] = useState<{ key: SortKey; dir: 1 | -1 }>({ key: "growth", dir: -1 });

  const pendingInPeriod = series.some((rows) => rows.some((r) => p.months.includes(r.month) && !r.approved));
  const spark12 = last12(p.months.at(-1)!);

  const tableRows = cps.map((cp) => {
    const profs = byCp[cp.id] ?? [];
    const rows = profs.map((x) => x.rows);
    const like = compareLike(rows, p.months, p.cmp, cfg.primary);
    return {
      id: cp.id,
      cp,
      profs,
      rows,
      vals: Object.fromEntries(cfg.kpis.map((k) => [k.key, profilesOver(rows, p.months, k.key)])),
      cur: like.cur,
      prev: like.prev,
      growth: like.pct,
      notTracked: profs.some((x) => x.untracked.some((m) => p.months.includes(m))),
      pending: rows.some((r) => r.some((x) => p.months.includes(x.month) && !x.approved)),
    };
  });
  const ranked = rankGrowth(tableRows, cfg.minBase);
  const top = new Set(ranked.slice(0, 3).map((r) => r.id));
  const bottom = new Set(ranked.slice(-3).filter((r) => !top.has(r.id)).map((r) => r.id));
  const sorted = [...tableRows].sort((a, b) => {
    const val = (r: (typeof tableRows)[number]) => (sort.key === "name" ? (r.cp.clients?.hotel_name ?? "") : sort.key === "growth" ? r.growth : r.vals[sort.key]);
    const av = val(a), bv = val(b);
    if (av == null && bv == null) return 0;
    if (av == null) return 1;
    if (bv == null) return -1;
    return (typeof av === "string" ? av.localeCompare(bv as string) : (av as number) - (bv as number)) * sort.dir;
  });
  const th = (key: SortKey, label: string, right = true) => (
    <th className={cn("cursor-pointer select-none whitespace-nowrap px-3 py-2 hover:text-foreground", right && "text-right")} onClick={() => setSort((s) => ({ key, dir: s.key === key ? ((-s.dir) as 1 | -1) : -1 }))}>
      <span className="inline-flex items-center gap-1">{label}{sort.key === key ? (sort.dir === 1 ? " ▲" : " ▼") : ""}{source === "localo" ? <InfoTip k={key} /> : null}</span>
    </th>
  );

  if (isLoading || loadingData) return <p className="text-small text-muted-foreground">Loading {cfg.noun} performance…</p>;
  if (!visibleCps.length) return <EmptyState title={`No ${cfg.noun} hotels you can see yet`} description="Hotels appear here once they're assigned to you." />;

  return (
    <TooltipProvider delayDuration={150}>
      <div className="space-y-5">
        <PeriodBar p={p}><PropertyFilter options={visibleCps.map((c) => ({ id: c.client_id, name: c.clients?.hotel_name ?? "Property", internal: !!c.clients?.is_internal }))} /></PeriodBar>
        <h2 className="text-section-title font-semibold">Main KPIs</h2>
        {!cps.length ? <p role="status" className="text-sm text-muted-foreground">No visible properties match this selection.</p> : null}
        {source === "localo" ? <GbpFunnel series={series} months={p.months} /> : null}
        {pendingInPeriod ? (
          <p className="flex items-center gap-1.5 text-label text-muted-foreground"><Info className="h-3.5 w-3.5" /> Some months in this period are not yet approved. Staff see all fetched months; hotels see approved months only.</p>
        ) : null}
        <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
          {mainSourceMetrics(source, cfg.kpis).map((k) => (
            <MetricCard key={k.key} k={k.key} label={k.label} cur={profilesOver(series, p.months, k.key)} like={compareLike(series, p.months, p.cmp, k.key)} spark={spark12.map((m) => profilesOver(series, [m], k.key))} />
          ))}
        </div>

        <h2 className="text-section-title font-semibold">All KPIs</h2>
        <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
          {cfg.kpis.map((k) => <MetricCard key={k.key} k={k.key} label={k.label} cur={profilesOver(series, p.months, k.key)} like={compareLike(series, p.months, p.cmp, k.key)} spark={spark12.map((m) => profilesOver(series, [m], k.key))} />)}
        </div>
        <FreshnessPanel source={source} profiles={allProfiles} cps={cps} mapping={mapping} />
        {cps.map((cp) => <details key={cp.id} className="border-b border-border py-3"><summary className="cursor-pointer text-sm font-medium">{cp.clients?.hotel_name} · All KPIs</summary><AllKpis clientPipelineId={cp.id} month={p.months.at(-1) ?? p.last} /></details>)}
        {cps.length === 1 && cps[0] && selection.ids.length === 1 ? <SelectedPropertyTrend source={source} cp={cps[0]} profiles={allProfiles} p={p} /> : null}
        {source === "localo" ? <HowNumbersWork /> : null}

        <section className="card-surface overflow-hidden">
          <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border/70 px-5 py-3">
            <div>
              <h2 className="text-section-title font-semibold">Every {cfg.noun} profile — {p.label}</h2>
              <p className="text-label text-muted-foreground">Click a row to open its dashboard. Growth = like-for-like change in {cfg.kpis.find((k) => k.key === cfg.primary)?.label.toLowerCase()} vs {p.cmpLabel}. Top/Bottom 3 only rank profiles with at least {cfg.minBase} in the comparison period.</p>
            </div>
            <div className="flex gap-3 text-label">
              <span className="flex items-center gap-1"><span className="h-2 w-2 rounded-full bg-success" /> Top 3</span>
              <span className="flex items-center gap-1"><span className="h-2 w-2 rounded-full bg-destructive" /> Bottom 3</span>
            </div>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-small">
              <thead className="bg-muted/30 text-left text-label text-muted-foreground">
                <tr>
                  {th("name", "Hotel", false)}
                  {cfg.kpis.map((k) => <Fragment key={k.key}>{th(k.key, k.label)}</Fragment>)}
                  {th("growth", "Growth")}
                  <th className="px-3 py-2">12 months</th>
                </tr>
              </thead>
              <tbody>
                {sorted.map((r) => (
                  <tr
                    key={r.cp.id}
                    className={cn("cursor-pointer border-t border-border/60 hover:bg-muted/30", top.has(r.id) && "bg-success/5", bottom.has(r.id) && "bg-destructive/5")}
                    onClick={() => navigate({ to: source === "localo" ? "/gbp/performance/$clientPipelineId" : "/social/performance/$clientPipelineId", params: { clientPipelineId: r.cp.id } })}
                  >
                    <td className="px-3 py-2">
                      <div className="flex items-center gap-2 font-medium">
                        {top.has(r.id) ? <span className="h-2 w-2 shrink-0 rounded-full bg-success" /> : bottom.has(r.id) ? <span className="h-2 w-2 shrink-0 rounded-full bg-destructive" /> : null}
                        {r.cp.clients?.hotel_name}
                        {r.profs.length > 1 ? <Badge variant="outline" className="h-5 px-1.5 text-[10px]">{r.profs.length} profiles</Badge> : null}
                        {r.cp.clients?.is_internal ? <Badge variant="secondary" className="h-5 px-1.5 text-[10px]">Internal</Badge> : null}
                        {r.pending ? <Badge variant="outline" className="h-5 whitespace-nowrap border-warning/40 px-1.5 text-[10px] text-warning">Not yet approved</Badge> : null}
                      </div>
                      {!r.profs.length ? <p className="text-label text-muted-foreground">{emptyReason(source, mapping[r.cp.id])}</p> : r.cp.clients?.city ? <p className="text-label text-muted-foreground">{r.cp.clients.city}</p> : null}
                    </td>
                    {cfg.kpis.map((k) => (
                      <td key={k.key} className="px-3 py-2 text-right tabular-nums">
                        {r.vals[k.key] == null && r.notTracked ? <span className="text-label text-muted-foreground">Not tracked yet</span> : fmt(r.vals[k.key])}
                      </td>
                    ))}
                    <td className="px-3 py-2 text-right">
                      <Delta pct={r.growth} />
                      {r.prev != null && r.growth != null ? <p className="text-label text-muted-foreground">from {fmt(r.prev)}</p> : null}
                    </td>
                    <td className="px-3 py-1"><Spark data={spark12.map((m) => profilesOver(r.rows, [m], cfg.primary))} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      </div>
    </TooltipProvider>
  );
}

/** Sum flow values per month across profiles (for impact averages and the visibility chart). */
function combineFlows(profiles: MonthValues[][]): MonthValues[] {
  const map = new Map<string, MonthValues>();
  for (const rows of profiles)
    for (const r of rows) {
      const c = map.get(r.month) ?? { month: r.month, values: {}, ranks: {}, approved: true };
      for (const [k, v] of Object.entries(r.values)) if (k !== "reviews_received" && k !== "five_star_reviews") c.values[k] = (c.values[k] ?? 0) + v;
      if (!r.approved) c.approved = false;
      map.set(r.month, c);
    }
  return [...map.values()].sort((a, b) => a.month.localeCompare(b.month));
}

// ───────────── CLIENT DASHBOARD ─────────────
export function SourceClientDashboard({ source, clientPipelineId, embedded = false }: { source: SourceKind; clientPipelineId: string; embedded?: boolean }) {
  const code = source === "localo" ? "gbp" : "social_media";
  const { data: cps = [] } = usePipelineClients(code);
  const cp = cps.find((c) => c.id === clientPipelineId);
  const { data: agg, isLoading } = useProfiles(source);
  const { data: rankRows = [] } = useRanks(source, clientPipelineId);
  const { data: mapping = {} } = useMappingStatus(source);
  const allProfs = agg?.[clientPipelineId] ?? [];
  const [profileSel, setProfileSel] = useState<string>("all");
  const profs = profileSel === "all" ? allProfs : allProfs.filter((x) => x.id === profileSel);
  const series = profs.map((x) => x.rows);
  const untracked = new Set(profs.flatMap((x) => x.untracked));
  const combined = combineFlows(series);
  const allMonths = Array.from(new Set(series.flatMap((r) => r.map((x) => x.month)))).sort();
  const cfg = config(source, Array.from(new Set(series.flatMap((r) => r.flatMap((x) => Object.keys(x.values))))));
  const p = usePeriod(allMonths);
  const [kpi, setKpi] = useState<string>("");
  const selected = cfg.kpis.find((k) => k.key === kpi) ?? cfg.kpis[0]!;
  const internal = !!cp?.clients?.is_internal;
  const start = internal ? null : cp?.start_date ?? null;

  const { data: targets = [] } = useQuery({
    queryKey: ["perf-targets", clientPipelineId],
    enabled: source === "localo",
    queryFn: async () => {
      const { data, error } = await supabase
        .from("client_kpi_targets")
        .select("month, target, status, kpi_definitions!inner(source_key)")
        .eq("client_pipeline_id", clientPipelineId)
        .eq("status", "approved");
      if (error) throw error;
      return data as unknown as Array<{ month: string; target: number; kpi_definitions: { source_key: string | null } }>;
    },
  });
  const { data: entries = [] } = useQuery({
    queryKey: ["perf-entries", clientPipelineId],
    enabled: source === "localo",
    queryFn: async () => {
      const { data, error } = await supabase
        .from("gbp_kpi_entries")
        .select("month, posts, photos, chat_clicks, booking_clicks, status")
        .eq("client_pipeline_id", clientPipelineId);
      if (error) throw error;
      return data as unknown as Array<Record<string, number | string | null> & { month: string }>;
    },
  });

  const periodEnd = p.months.at(-1)!;
  const chartMonths = Array.from({ length: 18 }, (_, i) => addMonths(periodEnd, i - 17)).filter((m) => m >= (allMonths[0] ?? m) || untracked.has(m));
  const buckets = bucketMonths(chartMonths, p.gran);
  const targetFor = (months: string[]) => {
    if (!selected.target) return null;
    const ts = months.map((m) => targets.find((t) => t.month === m && t.kpi_definitions.source_key === selected.target)?.target).filter((v): v is number => v != null);
    return ts.length ? ts.reduce((a, b) => a + Number(b), 0) : null;
  };
  const chartData = buckets.map((b) => ({
    label: b.label,
    value: profilesOver(series, b.months, selected.key),
    target: targetFor(b.months),
    notTracked: b.months.every((m) => untracked.has(m)),
    before: start ? b.months.every((m) => m.slice(0, 7) < start.slice(0, 7)) : false,
    pending: b.months.some((m) => combined.find((r) => r.month === m && !r.approved)),
  }));
  const beforeBuckets = chartData.filter((d) => d.before);
  const startBucket = start ? chartData.find((d) => !d.before)?.label : undefined;
  const impact = alcorImpact(combined, start, cfg.primary);
  const tableMonths = Array.from({ length: 18 }, (_, i) => addMonths(p.last, -i)).filter((m) => combined.some((r) => r.month === m) || untracked.has(m));
  const vis = chartMonths.map((m) => {
    const r = combined.find((x) => x.month === m);
    return { label: monthLabel(m), search: r?.values['views_search'] ?? null, maps: r?.values['views_maps'] ?? null };
  });
  const hasVis = vis.some((v) => v.search != null || v.maps != null);
  const ranksUpTo = rankRows.filter((r) => Object.keys(r.ranks).length);

  if (isLoading) return <p className="text-small text-muted-foreground">Loading…</p>;
  if (!allProfs.length)
    return <EmptyState title={emptyReason(source, mapping[clientPipelineId])} description={`${cp?.clients?.hotel_name ?? "This profile"} has no ${cfg.name} months stored, so there is nothing to chart yet.`} />;

  return (
    <TooltipProvider delayDuration={150}>
      <div className="space-y-5">
        {!embedded ? null : <p className="text-label text-muted-foreground">Staff see every fetched month; months marked "Not yet approved" are hidden from the hotel until Management approves them.</p>}
        {allProfs.length > 1 ? (
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-small text-muted-foreground">Profile</span>
            <Select value={profileSel} onValueChange={setProfileSel}>
              <SelectTrigger className="h-9 w-72"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All profiles ({allProfs.length})</SelectItem>
                {allProfs.map((x) => <SelectItem key={x.id} value={x.id}>{x.name}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
        ) : null}
        <PeriodBar p={p} />
        <MainKpis clientPipelineId={clientPipelineId} month={p.months.at(-1) ?? p.last} />
        <h2 className="text-section-title font-semibold">All KPIs</h2>
        <AllKpis clientPipelineId={clientPipelineId} month={p.months.at(-1) ?? p.last} />
        {source === "localo" ? <GbpFunnel series={series} months={p.months} /> : null}

        <section className="card-surface overflow-hidden">
          <div className="flex overflow-x-auto border-b border-border/70">
            {cfg.kpis.map((k) => {
              const cur = profilesOver(series, p.months, k.key);
              const like = compareLike(series, p.months, p.cmp, k.key);
              const active = k.key === selected.key;
              return (
                <button key={k.key} onClick={() => setKpi(k.key)} className={cn("min-w-[9.5rem] flex-1 border-b-2 px-4 py-3 text-left transition-colors", active ? "border-gold bg-gold/5" : "border-transparent hover:bg-muted/40")}>
                  <p className="flex items-center gap-1 text-label text-muted-foreground">{k.label} <InfoTip k={k.key} /></p>
                  <p className="mt-1 text-xl font-semibold tabular-nums">{cur == null ? <span className="text-small font-normal text-muted-foreground">Not tracked yet</span> : fmt(cur)}</p>
                  <Delta pct={like.pct} />
                </button>
              );
            })}
          </div>
          <div className="p-5">
            {(() => {
              const goal = targetFor(p.months);
              if (goal == null || goal <= 0) return null;
              return (
                <div className="mb-4 flex items-center gap-3">
                  <ProgressRing value={profilesOver(series, p.months, selected.key)} goal={goal} size="medium" label={`${selected.label} vs approved target`} />
                  <div>
                    <p className="text-[0.9375rem] font-medium">{selected.label} vs approved target</p>
                    <p className="text-label text-muted-foreground">{fmt(profilesOver(series, p.months, selected.key) ?? 0)} of {fmt(goal)} · {p.label}</p>
                  </div>
                </div>
              );
            })()}
            <div className="mb-2 flex flex-wrap items-center gap-4 text-label text-muted-foreground">
              <span className="flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-sm bg-primary" /> {selected.label}</span>
              {selected.target ? <span className="flex items-center gap-1.5"><span className="w-4 border-t-2 border-dashed border-gold" /> Target</span> : null}
              {beforeBuckets.length ? <span className="flex items-center gap-1.5"><span className="h-2.5 w-4 bg-muted" /> Before Alcor</span> : null}
              {chartData.some((d) => d.notTracked) ? <span>Empty bars = not tracked yet</span> : null}
              {chartData.some((d) => d.pending) ? <span className="flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-sm bg-primary/40" /> Not yet approved</span> : null}
            </div>
            <div className="h-72">
              <ResponsiveContainer width="100%" height="100%">
                <ComposedChart data={chartData} margin={{ top: 16, right: 8, left: 0, bottom: 0 }}>
                  <CartesianGrid vertical={false} stroke="var(--border)" />
                  {beforeBuckets.length ? <ReferenceArea x1={beforeBuckets[0]!.label} x2={beforeBuckets.at(-1)!.label} fill="var(--muted)" fillOpacity={0.8} ifOverflow="extendDomain" /> : null}
                  <XAxis dataKey="label" tick={{ fontSize: 11, fill: "var(--muted-foreground)" }} tickLine={false} axisLine={false} />
                  <YAxis tick={{ fontSize: 11, fill: "var(--muted-foreground)" }} tickLine={false} axisLine={false} width={48} />
                  <Tooltip
                    contentStyle={{ background: "var(--popover)", border: "1px solid var(--border)", borderRadius: 8, fontSize: 12 }}
                    formatter={(v, n) => [v == null ? "Not tracked yet" : fmt(Number(v)), n === "value" ? selected.label : "Target"]}
                  />
                  <Bar dataKey="value" radius={[4, 4, 0, 0]} fill="var(--primary)" isAnimationActive={false}>
                    {chartData.map((d) => <Cell key={d.label} fill="var(--primary)" fillOpacity={d.pending ? 0.4 : 1} />)}
                  </Bar>
                  {selected.target ? <Line dataKey="target" stroke="var(--gold)" strokeDasharray="5 4" strokeWidth={2} dot={false} connectNulls isAnimationActive={false} /> : null}
                  {startBucket ? <ReferenceLine x={startBucket} stroke="var(--gold)" strokeWidth={2} label={{ value: `Alcor started ${monthLabel(start)}`, position: "insideTopLeft", fontSize: 11, fill: "var(--foreground)" }} /> : null}
                </ComposedChart>
              </ResponsiveContainer>
            </div>
            {p.gran !== "month" && p.gran !== "ytd" ? <p className="mt-1 text-label text-muted-foreground">Flow metrics are summed per {p.gran}; review counts show the change across the {p.gran}, per profile.</p> : null}
          </div>
        </section>

        <div className="grid gap-5 lg:grid-cols-3">
          <section className="card-surface p-5">
            <h2 className="text-section-title font-semibold">Alcor impact</h2>
            {impact && impact.beforeMonths && impact.sinceMonths ? (
              <>
                <p className="text-label text-muted-foreground">Average monthly {cfg.kpis.find((k) => k.key === cfg.primary)?.label.toLowerCase()} (tracked, complete months only)</p>
                <div className="mt-4 grid grid-cols-2 gap-3">
                  <div><p className="text-label-muted">Before Alcor</p><p className="text-xl font-semibold tabular-nums">{fmt(impact.before)}</p><p className="text-label text-muted-foreground">{impact.beforeMonths} months</p></div>
                  <div><p className="text-label-muted">Since Alcor</p><p className="text-xl font-semibold tabular-nums text-gold">{fmt(impact.since)}</p><p className="text-label text-muted-foreground">{impact.sinceMonths} months</p></div>
                </div>
                <SharedMetricCard
                  className="mt-4 border-0 bg-transparent p-0 shadow-none"
                  hero
                  label="Uplift since Alcor"
                  value={impact.uplift}
                  format={(n) => signedPct(n)}
                  tone={impact.uplift == null || impact.uplift === 0 ? "default" : impact.uplift > 0 ? "success" : "danger"}
                />
              </>
            ) : (
              <p className="mt-2 text-small text-muted-foreground">{internal ? "Internal profile — no Before/Since Alcor split." : !start ? "No Alcor start date recorded for this pipeline." : "Needs at least one tracked month before and one since Alcor started."}</p>
            )}
          </section>
          {source === "localo" ? (
            <section className="card-surface p-5 lg:col-span-2">
              <h2 className="text-section-title font-semibold">Entered monthly (no automatic source)</h2>
              <div className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-4">
                {MANUAL_GBP.map((m) => {
                  const vals = entries.filter((e) => p.months.includes(e.month)).map((e) => e[m.key]).filter((v): v is number => typeof v === "number");
                  return (
                    <div key={m.key}>
                      <p className="text-label-muted">{m.label}</p>
                      {vals.length ? <p className="text-xl font-semibold tabular-nums">{fmt(vals.reduce((a, b) => a + b, 0))}</p> : <p className="mt-1 text-label text-muted-foreground">Enter monthly in KPI entry</p>}
                    </div>
                  );
                })}
              </div>
              <p className="mt-3 text-label text-muted-foreground">Localo's Google feed has no posts, photos or review-response counts, so these stay manual.</p>
            </section>
          ) : null}
        </div>

        {source === "localo" && hasVis ? (
          <section className="card-surface p-5">
            <h2 className="text-section-title font-semibold">Visibility: Search vs Maps</h2>
            <p className="text-label text-muted-foreground">Profile views split by where Google showed the profile (all profiles selected above).</p>
            <div className="mt-3 h-60">
              <ResponsiveContainer width="100%" height="100%">
                <ComposedChart data={vis} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
                  <CartesianGrid vertical={false} stroke="var(--border)" />
                  <XAxis dataKey="label" tick={{ fontSize: 11, fill: "var(--muted-foreground)" }} tickLine={false} axisLine={false} />
                  <YAxis tick={{ fontSize: 11, fill: "var(--muted-foreground)" }} tickLine={false} axisLine={false} width={48} />
                  <Tooltip contentStyle={{ background: "var(--popover)", border: "1px solid var(--border)", borderRadius: 8, fontSize: 12 }} formatter={(v, n) => [fmt(v == null ? null : Number(v)), n === "search" ? "Google Search" : "Google Maps"]} />
                  <Legend formatter={(n: string) => (n === "search" ? "Google Search" : "Google Maps")} wrapperStyle={{ fontSize: 12 }} />
                  <Bar dataKey="search" stackId="v" fill="var(--primary)" isAnimationActive={false} />
                  <Bar dataKey="maps" stackId="v" fill="var(--gold)" radius={[4, 4, 0, 0]} isAnimationActive={false} />
                </ComposedChart>
              </ResponsiveContainer>
            </div>
          </section>
        ) : null}

        {source === "localo" ? <KeywordPanel rows={ranksUpTo} p={p} /> : null}

        <section className="card-surface overflow-hidden">
          <h2 className="border-b border-border/70 px-5 py-3 text-section-title font-semibold">Month by month</h2>
          <div className="overflow-x-auto">
            <table className="w-full text-small">
              <thead className="bg-muted/30 text-left text-label text-muted-foreground">
                <tr>
                  <th className="px-3 py-2">Month</th>
                  {cfg.kpis.map((k) => <th key={k.key} className="px-3 py-2 text-right"><span className="inline-flex items-center gap-1">{k.label}<InfoTip k={k.key} /></span></th>)}
                  <th className="px-3 py-2">Status</th>
                </tr>
              </thead>
              <tbody>
                {tableMonths.map((m) => {
                  const before = start ? m.slice(0, 7) < start.slice(0, 7) : false;
                  const r = combined.find((x) => x.month === m);
                  const nt = !r && untracked.has(m);
                  return (
                    <tr key={m} className={cn("border-t border-border/60", before && "bg-muted/40")}>
                      <td className="whitespace-nowrap px-3 py-2 font-medium">{monthLabel(m)}{before ? <span className="ml-2 text-label font-medium text-warning">Before Alcor</span> : null}</td>
                      {nt ? (
                        <td colSpan={cfg.kpis.length} className="px-3 py-2 text-center text-label text-muted-foreground">Not tracked yet</td>
                      ) : (
                        cfg.kpis.map((k) => <td key={k.key} className="px-3 py-2 text-right tabular-nums">{fmt(profilesOver(series, [m], k.key))}</td>)
                      )}
                      <td className="px-3 py-2">{nt ? null : r?.approved ? <Badge variant="outline" className="border-success/40 text-success">Approved</Badge> : <Badge variant="outline" className="whitespace-nowrap border-warning/40 text-warning">Not yet approved</Badge>}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </section>

        <FreshnessPanel source={source} profiles={allProfs} cps={cp ? [cp] : []} mapping={mapping} compact />
        {source === "localo" && !embedded ? <HowNumbersWork /> : null}

        {!embedded && cp ? (
          <p className="text-label text-muted-foreground">
            Review and approve months on the <Link to={source === "localo" ? "/gbp" : "/social"} search={{ tab: "entry" }} className="text-primary underline">KPI entry tab</Link>.
          </p>
        ) : null}
      </div>
    </TooltipProvider>
  );
}

function KeywordPanel({ rows, p }: { rows: MonthValues[]; p: Period }) {
  // Point-in-time: latest COMPLETE ranked month ≤ the end of each period; never a later month.
  const upTo = (months: string[]) => rows.filter((r) => r.month <= months.at(-1)! && r.month <= p.last).at(-1);
  const cur = upTo(p.months);
  const prev = upTo(p.cmp);
  if (!cur) return <section className="card-surface p-5"><h2 className="text-section-title font-semibold">Keyword rankings</h2><p className="mt-2 text-small text-muted-foreground">Localo returned no keyword positions up to {monthLabel(p.months.at(-1)!)}.</p></section>;
  const b = rankBuckets(cur.ranks);
  const pb = prev ? rankBuckets(prev.ranks) : null;
  const trendMonths = last12(cur.month);
  const kws = Object.keys(cur.ranks).sort((a, b2) => cur.ranks[a]! - cur.ranks[b2]!);
  const bucketTile = (label: string, v: number, pv: number | undefined) => (
    <div className="rounded-md border border-border p-3">
      <p className="text-label-muted">{label}</p>
      <p className="text-xl font-semibold tabular-nums">{v}</p>
      {pv != null ? <p className={cn("text-label", v - pv > 0 ? "text-success" : v - pv < 0 ? "text-destructive" : "text-muted-foreground")}>{v - pv >= 0 ? "+" : ""}{v - pv} vs {monthLabel(prev!.month)}</p> : null}
    </div>
  );
  return (
    <section className="card-surface overflow-hidden">
      <div className="border-b border-border/70 px-5 py-3">
        <h2 className="text-section-title font-semibold">Keyword rankings</h2>
        <p className="text-label text-muted-foreground">Google position as of {monthLabel(cur.month)} (lower is better; green = improving).</p>
      </div>
      <div className="grid grid-cols-2 gap-3 p-5 sm:grid-cols-4">
        {bucketTile("Top 3", b.top3, pb?.top3)}
        {bucketTile("Top 4–10", b.top10, pb?.top10)}
        {bucketTile("Top 11–20", b.top20, pb?.top20)}
        {bucketTile("Beyond 20", b.beyond, pb?.beyond)}
      </div>
      <table className="w-full text-small">
        <thead className="bg-muted/30 text-left text-label text-muted-foreground">
          <tr><th className="px-3 py-2">Keyword</th><th className="px-3 py-2 text-right">Position</th><th className="px-3 py-2 text-right">Best</th><th className="px-3 py-2 text-right">Change</th><th className="px-3 py-2">12-month trend</th></tr>
        </thead>
        <tbody>
          {kws.map((kw) => {
            const pos = cur.ranks[kw]!;
            const before = prev?.ranks[kw];
            const best = Math.min(...rows.filter((r) => r.month <= cur.month).map((r) => r.ranks[kw]).filter((v): v is number => v != null));
            const change = before != null ? before - pos : null;
            return (
              <tr key={kw} className="border-t border-border/60">
                <td className="px-3 py-2">{kw}</td>
                <td className="px-3 py-2 text-right font-medium tabular-nums">{fmt(pos, 1)}</td>
                <td className="px-3 py-2 text-right tabular-nums text-muted-foreground">{fmt(best, 1)}</td>
                <td className={cn("px-3 py-2 text-right tabular-nums", change == null || Math.abs(change) < 0.05 ? "text-muted-foreground" : change > 0 ? "text-success" : "text-destructive")}>
                  {change == null ? "—" : Math.abs(change) < 0.05 ? "0" : `${change > 0 ? "▲" : "▼"} ${fmt(Math.abs(change), 1)}`}
                </td>
                <td className="px-3 py-1"><Spark data={trendMonths.map((m) => rows.find((r) => r.month === m)?.ranks[kw] ?? null)} inverted /></td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </section>
  );
}

// ───────────── MANAGEMENT / BD DASHBOARD BLOCK ─────────────
function MarketingBlock({ source, gran, selectedClientId, includeInternal, included }: { source: SourceKind; gran: Granularity; selectedClientId: string; includeInternal: boolean; included: boolean }) {
  const code = source === "localo" ? "gbp" : "social_media";
  const { data: visibleCps = [], isLoading } = usePipelineClients(code);
  const cps = selectedProperties(visibleCps, [selectedClientId], includeInternal);
  const { data: agg, isLoading: l2 } = useProfiles(source);
  const { data: mapping = {} } = useMappingStatus(source);
  const byCp = useMemo(() => Object.fromEntries(cps.map((c) => [c.id, agg?.[c.id] ?? []])) as Record<string, Profile[]>, [agg, cps]);
  const allProfiles = Object.values(byCp).flat();
  const series = allProfiles.map((x) => x.rows);
  const cfg = config(source, Array.from(new Set(series.flatMap((r) => r.flatMap((x) => Object.keys(x.values))))));
  const last = lastCompleteMonth();
  const anchor = periodOptions(gran, [last])[0] ?? last;
  const c = clipPeriod(gran, anchor, "previous", last);
  const kpis = source === "localo" ? cfg.kpis.filter((k) => k.key !== "new_five_star") : cfg.kpis;
  const ranked = rankGrowth(
    cps.map((cp) => {
      const l = compareLike((byCp[cp.id] ?? []).map((x) => x.rows), c.months, c.cmp, cfg.primary);
      return { cp, cur: l.cur, prev: l.prev };
    }),
    cfg.minBase,
  );
  const pending = series.some((r) => r.some((x) => c.months.includes(x.month) && !x.approved));
  const to = source === "localo" ? "/gbp/performance/$clientPipelineId" : "/social/performance/$clientPipelineId";
  const list = (rows: typeof ranked, tone: string) => (
    <ul className="space-y-1">
      {rows.map((r) => (
        <li key={r.cp.id} className="flex items-center justify-between gap-2 text-small">
          <Link to={to} params={{ clientPipelineId: r.cp.id }} className="truncate hover:underline">{r.cp.clients?.hotel_name}</Link>
          <span className={cn("whitespace-nowrap tabular-nums text-label font-medium", tone)}>{r.growth >= 0 ? "+" : ""}{r.growth.toFixed(0)}% <span className="font-normal text-muted-foreground">from {fmt(r.prev)}</span></span>
        </li>
      ))}
    </ul>
  );
  const sync = allProfiles.map((x) => x.fetchedAt).filter((x): x is string => !!x).sort().at(-1) ?? null;
  const noData = cps.filter((cp) => !(byCp[cp.id] ?? []).length);
  if (!included) return null;
  return (
    <section className="card-surface p-5">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h3 className="text-section-title font-semibold">{source === "localo" ? "Google Business Profile" : "Social media"} · Main KPIs</h3>
          <p className="text-label text-muted-foreground">{c.label} vs {c.cmpLabel} · {allProfiles.length} profiles · from {cfg.name} · last sync {istDateTime(sync)}</p>
        </div>
        <div className="flex items-center gap-2">
          {pending ? <Badge variant="outline" className="h-5 whitespace-nowrap border-warning/40 px-1.5 text-[10px] text-warning">Not yet approved</Badge> : null}
          <Link to={source === "localo" ? "/gbp" : "/social"} search={{ tab: "performance", props: selectedClientId, internal: includeInternal || undefined }} className="text-small font-medium text-primary hover:underline">
            {source === "localo" ? "GBP Performance" : "Social Performance"} →
          </Link>
        </div>
      </div>
      {isLoading || l2 ? (
        <p className="mt-4 text-small text-muted-foreground">Loading…</p>
      ) : (
        <TooltipProvider delayDuration={150}>
          <div className="mt-4 grid grid-cols-2 gap-2.5 md:grid-cols-3 2xl:grid-cols-4">
            {kpis.map((k) => {
              const cur = profilesOver(series, c.months, k.key);
              const like = compareLike(series, c.months, c.cmp, k.key);
              return (
                <div key={k.key} className="min-w-0 rounded-md border border-border bg-background/70 p-2.5">
                  <p className="flex min-h-8 items-start gap-1 text-xs leading-snug text-muted-foreground">{k.label} <InfoTip k={k.key} /></p>
                  <p className="mt-1 text-[clamp(1.125rem,1.4vw,1.5rem)] leading-tight font-semibold tracking-tight tabular-nums">{fmt(cur)}</p>
                  <Delta pct={like.pct} />
                  <p className="mt-0.5 text-xs leading-snug text-muted-foreground">Compared {like.compared}/{like.total} profiles</p>
                </div>
              );
            })}
          </div>
          {!allProfiles.length && cps[0] ? (
            <div className="mt-5 border-t border-border/70 pt-4">
              <MainKpis clientPipelineId={cps[0].id} month={c.months.at(-1) ?? c.last} title={`${source === "localo" ? "Google Business Profile" : "Social media"} pipeline KPIs`} />
            </div>
          ) : null}
          {!allProfiles.length ? <p className="mt-3 text-xs text-muted-foreground">This pipeline is included in the client’s plan. KPIs will remain here and populate when profile data is linked or updated.</p> : <>
            <div className="mt-4 grid grid-cols-2 gap-4">
              <div><p className="mb-1 text-label-muted">Top 3 · {source === "localo" ? "interactions" : "posts"} growth</p>{list(ranked.slice(0, 3), "text-success")}</div>
              <div><p className="mb-1 text-label-muted">Bottom 3</p>{list(ranked.slice(-3).reverse().filter((r) => !ranked.slice(0, 3).includes(r)), "text-destructive")}</div>
            </div>
            <p className="mt-3 text-label text-muted-foreground">Ranked only when at least {cfg.minBase} in the comparison period and tracked in both periods.{noData.length ? ` No data: ${noData.map((x) => `${x.clients?.hotel_name} (${emptyReason(source, mapping[x.id])})`).join("; ")}.` : ""}</p>
          </>}
        </TooltipProvider>
      )}
    </section>
  );
}

function IncludedPlanKpis({ clientId, includedCodes }: { clientId: string; includedCodes: string[] }) {
  const pipelinesQuery = useQuery({
    queryKey: ["dashboard-included-pipelines", clientId, includedCodes],
    enabled: Boolean(clientId && includedCodes.length),
    queryFn: async () => {
      const [cpResult, pipelineResult] = await Promise.all([
        supabase.from("client_pipelines").select("id, status, pipelines!inner(code)").eq("client_id", clientId).neq("status", "ended"),
        supabase.from("pipelines").select("id, code, name, sort_order").eq("active", true).eq("client_facing", true).in("code", includedCodes).order("sort_order", { ascending: true }),
      ]);
      if (cpResult.error) throw cpResult.error;
      if (pipelineResult.error) throw pipelineResult.error;
      return {
        clientPipelines: (cpResult.data ?? []) as unknown as Array<{ id: string; status: string; pipelines: { code: string } }>,
        pipelines: pipelineResult.data ?? [],
      };
    },
  });
  const pipelineIds = (pipelinesQuery.data?.pipelines ?? []).map((pipeline) => pipeline.id);
  const definitionsQuery = useQuery({
    queryKey: ["dashboard-included-pipeline-kpi-definitions", pipelineIds],
    enabled: pipelineIds.length > 0,
    queryFn: async () => {
      const { data, error } = await supabase.from("kpi_definitions")
        .select("id, pipeline_id, name, kpi_type, direction, main_position")
        .in("pipeline_id", pipelineIds).eq("active", true).eq("is_main", true)
        .order("main_position", { ascending: true });
      if (error) throw error;
      return data ?? [];
    },
  });
  if (pipelinesQuery.isLoading) return <p className="text-sm text-muted-foreground">Loading included pipeline KPIs…</p>;
  if (pipelinesQuery.error || definitionsQuery.error) return <p role="alert" className="text-sm text-destructive">Could not load the included pipeline KPI cards.</p>;

  const pipelines = (pipelinesQuery.data?.pipelines ?? []).filter((pipeline) => !["gbp", "social_media"].includes(pipeline.code));
  const clientPipelines = pipelinesQuery.data?.clientPipelines ?? [];
  const definitions = definitionsQuery.data ?? [];
  if (!pipelines.length) return null;

  return (
    <section className="space-y-5">
      <h3 className="font-display text-lg font-semibold">Other included pipeline KPIs</h3>
      {pipelines.map((pipeline) => {
        const clientPipeline = clientPipelines.find((item) => item.pipelines.code === pipeline.code);
        const items = definitions.filter((item) => item.pipeline_id === pipeline.id).map((item) => ({
          definition_id: item.id,
          name: item.name,
          value: null,
          kpi_type: item.kpi_type,
          direction: item.direction,
        }));
        return (
          <section key={pipeline.id} className="card-surface space-y-3 p-5">
            {clientPipeline ? (
              <MainKpis clientPipelineId={clientPipeline.id} month={lastCompleteMonth()} title={`${pipeline.name} · Main KPIs`} />
            ) : (
              <>
                <h4 className="text-section-title font-semibold">{pipeline.name} · Main KPIs</h4>
                {items.length ? <MainKpiCards items={items} /> : <p className="rounded-md border border-dashed p-4 text-sm text-muted-foreground">Included in this plan; KPI definitions are not configured yet.</p>}
              </>
            )}
          </section>
        );
      })}
    </section>
  );
}

export function MarketingPerformance({ only, granularity }: { only?: SourceKind; granularity?: "month" | "quarter" | "year" } = {}) {
  const { data: gbpCps = [] } = usePipelineClients("gbp");
  const { data: socialCps = [] } = usePipelineClients("social_media");
  const options = [...new Map((only === "localo" ? gbpCps : only === "metricool" ? socialCps : [...gbpCps, ...socialCps]).map((c) => [c.client_id, { id: c.client_id, name: c.clients?.hotel_name ?? "Property", internal: !!c.clients?.is_internal }])).values()].sort((a,b) => a.name.localeCompare(b.name));
  const selection = usePropertySelection();
  const [selectedClientId, setSelectedClientId] = useState(selection.ids[0] ?? "");
  const { data: includedCodes = [], isLoading: planLoading, error: planError } = useQuery({
    queryKey: ["dashboard-client-plan-pipelines", selectedClientId],
    enabled: Boolean(selectedClientId),
    queryFn: async () => {
      const { data: launch, error: launchError } = await supabase.from("client_launches")
        .select("plan_version_id, custom_plan_id")
        .eq("client_id", selectedClientId)
        .in("status", ["active", "live"])
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      if (launchError) throw launchError;
      if (!launch) return [] as string[];
      if (launch.custom_plan_id) {
        const { data, error } = await supabase.from("custom_plan_services").select("pipeline_code")
          .eq("custom_plan_id", launch.custom_plan_id).eq("included", true);
        if (error) throw error;
        return (data ?? []).map((service) => service.pipeline_code).filter((code): code is string => Boolean(code));
      }
      if (!launch.plan_version_id) return [] as string[];
      const { data, error } = await supabase.from("plan_services").select("pipeline_code")
        .eq("plan_version_id", launch.plan_version_id).eq("included", true);
      if (error) throw error;
      return (data ?? []).map((service) => service.pipeline_code).filter((code): code is string => Boolean(code));
    },
  });
  const [localGran, setGran] = useState<Granularity>("month");
  const gran = granularity ?? localGran;
  const selectClient = (clientId: string) => {
    setSelectedClientId(clientId);
    const url = new URL(window.location.href);
    url.searchParams.set("props", clientId);
    window.history.replaceState(window.history.state, "", `${url.pathname}${url.search}${url.hash}`);
  };
  return (
    <section className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="font-display text-xl font-semibold">Marketing performance</h2>
          <p className="text-label text-muted-foreground">Automatic {only === "localo" ? "Localo" : only === "metricool" ? "Metricool" : "Localo and Metricool"} data, complete months only. Staff see every fetched month; hotels see approved months only.</p>
        </div>
        <PropertyFilter options={options} singleSelect selectedId={selectedClientId} onSelect={selectClient} />
        {granularity === undefined ? (
          <SegmentedPill ariaLabel="Marketing period" value={gran} onChange={(v) => setGran(v as Granularity)} items={(["month", "quarter", "year"] as const).map((g) => ({ value: g, label: g.charAt(0).toUpperCase() + g.slice(1) }))} />
        ) : null}
      </div>
      {planError ? <p role="alert" className="rounded-lg border border-destructive/30 p-4 text-sm text-destructive">Could not read this client’s plan pipeline access.</p> : planLoading ? (
        <p className="rounded-lg border border-dashed p-6 text-sm text-muted-foreground">Loading the client’s included pipelines…</p>
      ) : !selectedClientId ? (
        <p className="rounded-lg border border-dashed p-6 text-sm text-muted-foreground">Select one client to view that client’s marketing performance.</p>
      ) : !includedCodes.some((code) => (only !== "metricool" && code === "gbp") || (only !== "localo" && code === "social_media")) ? (
        <p className="rounded-lg border border-dashed p-6 text-sm text-muted-foreground">This client’s current plan does not include these marketing pipelines.</p>
      ) : (
        <div className={cn("grid gap-5", !only && "xl:grid-cols-2")}>
          {only !== "metricool" ? <MarketingBlock source="localo" gran={gran} selectedClientId={selectedClientId} includeInternal={selection.includeInternal} included={includedCodes.includes("gbp")} /> : null}
          {only !== "localo" ? <MarketingBlock source="metricool" gran={gran} selectedClientId={selectedClientId} includeInternal={selection.includeInternal} included={includedCodes.includes("social_media")} /> : null}
        </div>
      )}
      {selectedClientId && !planLoading && !planError ? <IncludedPlanKpis clientId={selectedClientId} includedCodes={includedCodes} /> : null}
    </section>
  );
}
