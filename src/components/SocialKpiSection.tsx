import { ArrowDownRight, ArrowUpRight, Minus } from "lucide-react";
import {
  SOCIAL_METRICS,
  SOCIAL_PLATFORMS,
  changePct,
  num,
  platformLabel,
  type SocialEntry,
} from "@/lib/social";
import { monthLabel } from "@/lib/kpi";
import { DataTable } from "@/components/DataTable";
import { EmptyState } from "@/components/EmptyState";
import { StatusBadge } from "@/components/StatusBadge";

function Delta({ current, previous }: { current: number; previous: number | null }) {
  const change = changePct(current, previous);
  if (change === null) return <span className="text-xs text-muted-foreground">—</span>;
  const up = change > 0.05;
  const down = change < -0.05;
  const Icon = up ? ArrowUpRight : down ? ArrowDownRight : Minus;
  const tone = up ? "text-success" : down ? "text-destructive" : "text-muted-foreground";
  return (
    <span className={`inline-flex items-center gap-0.5 text-xs ${tone}`}>
      <Icon className="h-3 w-3" />
      {Math.abs(change).toFixed(1)}%
    </span>
  );
}

/** Aggregate multiple hotels' rows into one series per month + platform. */
export function aggregateSocial(rows: SocialEntry[]): SocialEntry[] {
  const map = new Map<string, SocialEntry>();
  for (const r of rows) {
    const key = `${r.month}|${r.platform}`;
    const cur = map.get(key) ?? {
      id: key,
      month: r.month,
      platform: r.platform,
      posts: 0,
      followers: 0,
      content_views: 0,
      profile_views: 0,
      engagement: 0,
      new_followers: 0,
    };
    cur.posts += Number(r.posts || 0);
    cur.followers += Number(r.followers || 0);
    cur.content_views += Number(r.content_views || 0);
    cur.profile_views += Number(r.profile_views || 0);
    cur.engagement += Number(r.engagement || 0);
    cur.new_followers += Number(r.new_followers || 0);
    map.set(key, cur);
  }
  return Array.from(map.values());
}

const STATUS_TEXT: Record<string, string> = {
  draft: "Draft",
  submitted: "Awaiting approval",
  approved: "Approved",
};

type Props = {
  title?: string;
  description?: string;
  entries: SocialEntry[];
  /** number of months to show per platform */
  limit?: number;
  /** show the approval status column (staff views) */
  showStatus?: boolean;
};

/**
 * Monthly social media KPIs per channel with month-on-month % change.
 */
export function SocialKpiSection({
  title = "Social media performance",
  description = "Monthly posts, followers, content views and profile views with month-on-month change.",
  entries,
  limit = 12,
  showStatus = false,
}: Props) {
  const platforms = SOCIAL_PLATFORMS.filter((p) => entries.some((e) => e.platform === p.value));

  return (
    <section className="card-surface">
      <div className="border-b border-border/70 px-5 py-4">
        <h2 className="text-section-title font-semibold">{title}</h2>
        <p className="text-xs text-muted-foreground">{description}</p>
      </div>

      {platforms.length === 0 ? (
        <EmptyState title="No social media numbers logged yet." />
      ) : (
        platforms.map((p) => {
          const rows = entries
            .filter((e) => e.platform === p.value)
            .sort((a, b) => b.month.localeCompare(a.month))
            .slice(0, limit);
          const latest = rows[0]!;
          const prev = rows[1] ?? null;
          return (
            <div key={p.value} className="border-b border-border/70 last:border-0">
              <div className="flex flex-wrap items-center justify-between gap-2 bg-muted/30 px-5 py-3">
                <h3 className="text-card-title font-semibold">{platformLabel(p.value)}</h3>
                <p className="text-xs text-muted-foreground">
                  Latest month: {monthLabel(latest.month)}
                </p>
              </div>
              <div className="grid gap-4 px-5 py-4 sm:grid-cols-4">
                {SOCIAL_METRICS.map((m) => (
                  <div key={m.key}>
                    <p className="text-label-muted">{m.label}</p>
                    <p className="text-card-title font-semibold">{num(latest[m.key])}</p>
                    <Delta current={latest[m.key]} previous={prev ? prev[m.key] : null} />
                  </div>
                ))}
              </div>
              <DataTable<SocialEntry>
                className="rounded-none border-0 bg-transparent shadow-none"
                rows={rows}
                rowKey={(r) => r.id ?? `${r.month}|${r.platform}`}
                columns={[
                  { key: "month", header: "Month", render: (r) => (
                    <span>
                      {monthLabel(r.month)}
                      {r.status && r.status !== "approved" ? <span className="block text-xs text-warning">Not yet approved</span> : null}
                    </span>
                  ) },
                  ...SOCIAL_METRICS.map((m) => ({
                    key: m.key,
                    header: m.label,
                    align: "right" as const,
                    render: (r: SocialEntry) => {
                      const i = rows.indexOf(r);
                      const before = rows[i + 1] ?? null;
                      return (
                        <span className="inline-flex items-center justify-end gap-2">
                          <span className="tabular-nums">{num(r[m.key])}</span>
                          <Delta current={r[m.key]} previous={before ? before[m.key] : null} />
                        </span>
                      );
                    },
                  })),
                  ...(showStatus
                    ? [
                        {
                          key: "status",
                          header: "Status",
                          align: "right" as const,
                          render: (r: SocialEntry) =>
                            r.status ? (
                              <StatusBadge
                                status={r.status === "submitted" ? "pending" : r.status}
                                label={STATUS_TEXT[r.status] ?? r.status}
                              />
                            ) : (
                              <span className="text-muted-foreground">—</span>
                            ),
                        },
                      ]
                    : []),
                ]}
              />
            </div>
          );
        })
      )}
    </section>
  );
}
