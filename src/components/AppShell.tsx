import { showDualTrackerBanner } from "@/lib/tracker";
import { todayIST } from "@/lib/launch";
import { useState, type ReactNode } from "react";
import { Link, useNavigate, useRouterState } from "@tanstack/react-router";
import {
  RefreshCw,
  Receipt,
  LayoutDashboard,
  BookOpen,
  Building2,
  ListChecks,
  Gauge,
  LineChart,
  ClipboardList,
  Rocket,
  Users,
  Compass,
  Bell,
  CalendarCheck,
  ListTodo,
  MessageCircleQuestion,
  LogOut,
  MapPin,
  Menu,
  Search,
  Share2,
  Rocket as LaunchIcon,
  X, BedDouble, BarChart3, Home, Layers, Lock, Inbox, ShieldCheck, IndianRupee, UserRound } from "lucide-react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { NorthStarMark } from "@/components/NorthStarMark";
import { APP_NAME, APP_TAGLINE, ROLE_LABELS } from "@/lib/constants";
import { cn } from "@/lib/utils";
import { canAccess, isStaffRoles } from "@/lib/access";
import { accessQuery } from "@/lib/access-data";
import { Button } from "@/components/ui/button";

function useOverdueCount(userId: string | undefined) {
  return useQuery({
    queryKey: ["my-tasks-overdue", userId],
    enabled: !!userId,
    queryFn: async () => {
      const today = new Date();
      const iso = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, "0")}-${String(today.getDate()).padStart(2, "0")}`;
      const { count, error } = await supabase
        .from("client_tasks")
        .select("id, client_launches!inner(status)", { count: "exact", head: true })
        .or(`assignee_id.eq.${userId},backup_id.eq.${userId}`)
        .in("client_launches.status", ["active", "live", "offboarding"])
        .lt("due_date", iso)
        .in("status", ["not_started", "in_progress", "waiting_client", "blocked"]);
      if (error) return 0;
      return count ?? 0;
    },
  });
}

function NotificationsBell() {
  const qc = useQueryClient();
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const { data: items = [] } = useQuery({
    queryKey: ["notifications-bell"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("notifications")
        .select("id, title, body, link, read_at, created_at")
        .order("created_at", { ascending: false })
        .limit(15);
      if (error) throw error;
      return data;
    },
  });
  const unread = items.filter((n) => !n.read_at).length;

  async function openItem(n: { id: string; link: string | null; read_at: string | null }) {
    setOpen(false);
    if (!n.read_at) {
      await supabase.from("notifications").update({ read_at: new Date().toISOString() }).eq("id", n.id);
      qc.invalidateQueries({ queryKey: ["notifications-bell"] });
      qc.invalidateQueries({ queryKey: ["notifications"] });
    }
    if (n.link) navigate({ to: n.link });
  }

  async function markAll() {
    const { error } = await supabase.from("notifications").update({ read_at: new Date().toISOString() }).is("read_at", null);
    if (error) { toast.error(error.message); return; }
    qc.invalidateQueries({ queryKey: ["notifications-bell"] });
    qc.invalidateQueries({ queryKey: ["notifications"] });
  }

  return (
    <div className="relative">
      <button
        aria-label="Notifications"
        onClick={() => setOpen((v) => !v)}
        className="relative rounded-lg border border-border/70 bg-card p-2 text-foreground/80 transition-colors hover:bg-muted"
      >
        <Bell className="h-4 w-4" strokeWidth={1.75} />
        {unread > 0 ? (
          <span className="absolute -right-1 -top-1 rounded-full bg-destructive px-1.5 text-label font-semibold leading-4 text-destructive-foreground">
            {unread}
          </span>
        ) : null}
      </button>
      {open ? (
        <>
          <button className="fixed inset-0 z-40 cursor-default" aria-label="Close notifications" onClick={() => setOpen(false)} />
          <div className="absolute right-0 z-50 mt-2 w-80 card-surface overflow-hidden shadow-lg">
            <div className="flex items-center justify-between border-b border-border/70 px-4 py-2.5">
              <p className="text-card-title font-medium">Notifications</p>
              {unread > 0 ? (
                <button className="text-label text-muted-foreground hover:text-foreground" onClick={markAll}>Mark all read</button>
              ) : null}
            </div>
            <div className="max-h-96 overflow-y-auto">
              {items.length === 0 ? (
                <p className="px-4 py-6 text-center text-small text-muted-foreground">You're all caught up.</p>
              ) : (
                items.map((n) => (
                  <button
                    key={n.id}
                    onClick={() => openItem(n)}
                    className={cn(
                      "block w-full border-b border-border/50 px-4 py-3 text-left text-small last:border-0 hover:bg-muted/40",
                      !n.read_at && "bg-gold/5",
                    )}
                  >
                    <p className={cn("font-medium", !n.read_at && "text-foreground")}>{n.title}</p>
                    {n.body ? <p className="mt-0.5 text-label text-muted-foreground">{n.body}</p> : null}
                    <p className="mt-1 text-label text-muted-foreground">
                      {new Date(n.created_at).toLocaleDateString("en-IN", { day: "2-digit", month: "short" })}
                    </p>
                  </button>
                ))
              )}
            </div>
          </div>
        </>
      ) : null}
    </div>
  );
}

/** Top-bar client search (staff only): matches hotel names, jumps to the client page. */
function GlobalSearch() {
  const [q, setQ] = useState("");
  const [open, setOpen] = useState(false);
  const navigate = useNavigate();
  const { data: results = [] } = useQuery({
    queryKey: ["global-search", q],
    enabled: q.trim().length >= 2,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("clients")
        .select("id, hotel_name, client_code, city")
        .ilike("hotel_name", `%${q.trim()}%`)
        .order("hotel_name")
        .limit(6);
      if (error) return [];
      return data;
    },
  });

  return (
    <div className="relative min-w-0 w-24 sm:w-64">
      <Search className="pointer-events-none absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" strokeWidth={1.75} />
      <input
        value={q}
        onChange={(e) => {
          setQ(e.target.value);
          setOpen(true);
        }}
        onFocus={() => setOpen(true)}
        onKeyDown={(e) => {
          if (e.key === "Enter" && results[0]) {
            setOpen(false);
            setQ("");
            navigate({ to: "/clients/$clientId", params: { clientId: results[0].id } });
          }
          if (e.key === "Escape") setOpen(false);
        }}
        placeholder="Search hotels…"
        aria-label="Search hotels"
        className="h-9 w-full rounded-md border border-input bg-card pl-8 pr-3 text-small outline-none placeholder:text-muted-foreground focus:ring-2 focus:ring-ring"
      />
      {open && q.trim().length >= 2 ? (
        <>
          <button className="fixed inset-0 z-40 cursor-default" aria-label="Close search" onClick={() => setOpen(false)} />
          <div className="absolute left-0 right-0 z-50 mt-1 card-surface overflow-hidden shadow-lg">
            {results.length === 0 ? (
              <p className="px-4 py-3 text-small text-muted-foreground">No hotels match.</p>
            ) : (
              results.map((c) => (
                <button
                  key={c.id}
                  onClick={() => {
                    setOpen(false);
                    setQ("");
                    navigate({ to: "/clients/$clientId", params: { clientId: c.id } });
                  }}
                  className="block w-full px-4 py-2.5 text-left text-small hover:bg-muted/40"
                >
                  <span className="font-medium">{c.hotel_name}</span>
                  <span className="ml-2 text-label text-muted-foreground">
                    {[c.client_code, c.city].filter(Boolean).join(" · ")}
                  </span>
                </button>
              ))
            )}
          </div>
        </>
      ) : null}
    </div>
  );
}

type NavItem = { to: string; label: string; icon: typeof LayoutDashboard; badge?: number; search?: Record<string, string> };
type NavGroup = { label: string; items: NavItem[] };

const FORM_PIPELINES: Array<{ code: string; label: string }> = [
  { code: "business_development", label: "Business Development KPIs" },
  { code: "influencer", label: "Influencer KPIs" },
  { code: "whatsapp", label: "WhatsApp KPIs" },
  { code: "email_marketing", label: "Email Marketing KPIs" },
  { code: "corporate_comms", label: "Corporate Comms KPIs" },
  { code: "reservations_desk", label: "Reservations Desk KPIs" },
  { code: "website_seo", label: "Website SEO KPIs" },
  { code: "marketing_funnel", label: "Marketing Funnel KPIs" },
];

type MyPipeline = { code: string; name: string; active: boolean; pending: boolean };

/** Owner-only sidebar section: the nine client-facing pipelines. */
function OwnerPipelinesNav({ onNavigate }: { onNavigate: () => void }) {
  const qc = useQueryClient();
  const { data: pipes = [] } = useQuery({
    queryKey: ["my-pipeline-status"],
    queryFn: async () => {
      const { data, error } = await supabase.rpc("my_pipeline_status");
      if (error) throw error;
      return data as unknown as MyPipeline[];
    },
  });
  const request = useMutation({
    mutationFn: async (code: string) => {
      const { data, error } = await supabase.rpc("request_pipeline_activation", { _pipeline_code: code });
      if (error) throw error;
      return data as string;
    },
    onSuccess: (result) => {
      qc.invalidateQueries({ queryKey: ["my-pipeline-status"] });
      if (result === "ok") {
        toast.success("Your request has been sent to our marketing team. We'll contact you shortly.");
      }
    },
    onError: (e: Error) => toast.error(e.message),
  });
  if (!pipes.length) return null;
  return (
    <div className="space-y-0.5">
      <p className="px-3 pb-1 pt-4 text-label font-medium text-sidebar-foreground/50">Pipelines</p>
      {pipes.map((p) =>
        p.active ? (
          <Link
            key={p.code}
            to="/my-growth"
            onClick={onNavigate}
            className="flex items-center gap-3 rounded-lg px-3 py-2 text-small text-sidebar-foreground/75 transition-colors hover:bg-sidebar-accent/60 hover:text-sidebar-accent-foreground"
          >
            <BarChart3 className="h-5 w-5" strokeWidth={1.75} />
            {p.name}
          </Link>
        ) : (
          <button
            key={p.code}
            type="button"
            disabled={p.pending || request.isPending}
            onClick={() => request.mutate(p.code)}
            className="flex w-full items-center gap-3 rounded-lg px-3 py-2 text-left text-small text-sidebar-foreground/50 transition-colors hover:bg-sidebar-accent/60 disabled:opacity-60"
          >
            <Lock className="h-5 w-5" strokeWidth={1.75} />
            {p.name}
            <span className="ml-auto text-label">{p.pending ? "Requested" : "Unlock"}</span>
          </button>
        ),
      )}
    </div>
  );
}

/** Derive breadcrumb labels for the slim top bar from the current path. */
function topBarCrumbs(pathname: string, groups: NavGroup[]): string[] {
  const flat = groups.flatMap((g) => g.items);
  const segments = pathname.split("/").filter(Boolean);
  const first = `/${segments[0] ?? ""}`;
  const match = flat.find((i) => i.to === first);
  const crumbs = [match?.label ?? titleCase(segments[0] ?? "")];
  if (segments.length > 1) crumbs.push(segments[1] === "new" ? "New" : "Details");
  return crumbs.filter(Boolean);
}

function titleCase(s: string) {
  return s.replace(/[-_]/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

export function AppShell({ children }: { children: ReactNode }) {
  const { profile, roles, isStaff, user } = useAuth();
  const { data: overdueCount } = useOverdueCount(isStaff ? user?.id : undefined);
  const { data: access } = useQuery({ ...accessQuery(user?.id ?? ""), enabled: !!user?.id });
  const navigate = useNavigate();
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const search = useRouterState({ select: (s) => s.location.search as Record<string, unknown> });
  const myRoles = access?.roles ?? roles;
  const staffView = isStaffRoles(myRoles);

  const groups: Array<NavGroup & { ownerOnly?: boolean }> = [
    {
      label: "Workspace",
      items: [
        { to: "/home", label: "Home", icon: Home },
        { to: "/my-launch", label: "My Launch", icon: LaunchIcon },
        { to: "/my-growth", label: "MY GROWTH", icon: BarChart3 },
      ],
      ownerOnly: true,
    },
    {
      label: "Workspace",
      items: [
        { to: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
        { to: "/clients", label: "Clients", icon: Building2 },
        { to: "/launch-overview", label: "Launches", icon: CalendarCheck },
        { to: "/my-tasks", label: "My Tasks", icon: ListTodo, badge: overdueCount ?? 0 },
        { to: "/onboarding", label: "BD Onboarding", icon: Rocket },
        { to: "/actions", label: "Action Tracker", icon: ClipboardList },
        { to: "/questions", label: "Client Questions", icon: MessageCircleQuestion },
        { to: "/onboarding-sop", label: "Onboarding SOP", icon: BookOpen },
      ],
    },
    {
      label: "Pipelines",
      items: [
        { to: "/weekly", label: "Weekly Performance", icon: LineChart },
        { to: "/gbp", label: "GBP Performance", icon: BarChart3, search: { tab: "performance" } },
        { to: "/gbp", label: "Google Business Profile", icon: MapPin, search: { tab: "entry" } },
        { to: "/social", label: "Social Performance", icon: BarChart3, search: { tab: "performance" } },
        { to: "/social", label: "Social Media KPIs", icon: Share2, search: { tab: "entry" } },
        { to: "/ota", label: "OTA Management KPIs", icon: BedDouble },
        ...FORM_PIPELINES.map((p) => ({
          to: "/pipeline-kpis",
          label: p.label,
          icon: BarChart3,
          search: { code: p.code },
        })),
        { to: "/reports", label: "Monthly KPIs", icon: Gauge },
        { to: "/kpi-progress", label: "KPI back-entry", icon: ListChecks },
      ],
    },
    {
      label: "Revenue",
      items: [
        { to: "/finance", label: "Finance", icon: IndianRupee },
        { to: "/sales", label: "Sales & Bookings", icon: Receipt },
        { to: "/reservation-desk", label: "Reservation Desk", icon: Users },
        { to: "/my-performance", label: "My Performance", icon: Gauge },
        { to: "/targets", label: "KPI Targets", icon: ListChecks },
      ],
    },
    {
      label: "People",
      items: [
        { to: "/team", label: "Team", icon: Users },
        { to: "/scorecard", label: "Team Scorecard", icon: Users },
        { to: "/hr", label: "HR", icon: UserRound },
        { to: "/access", label: "Access", icon: ShieldCheck },
      ],
    },
    {
      label: "Settings",
      items: [
        { to: "/activity-settings", label: "Activity & Holidays", icon: ListChecks },
        { to: "/data-sync", label: "Data sync", icon: RefreshCw },
        { to: "/plans", label: "Plans", icon: Layers },
        { to: "/kpis", label: "KPI Library", icon: ListChecks },
        { to: "/activation-requests", label: "Activation Requests", icon: Inbox },
        { to: "/review", label: "North Star Review", icon: Compass },
        { to: "/notifications", label: "Notifications", icon: Bell },
      ],
    },
  ];

  // Built from the same access map the route guard uses.
  const visibleGroups = groups
    .filter((g) => !(g.ownerOnly && staffView) && !(staffView && g.items.every((i) => ["/home", "/my-launch", "/my-growth"].includes(i.to))))
    .map((g) => ({
      ...g,
      items: g.items.filter((i) => canAccess(i.to, i.search, myRoles, access?.managedCodes ?? [])),
    }))
    .filter((g) => g.items.length > 0);

  async function signOut() {
    await qc.cancelQueries();
    qc.clear();
    await supabase.auth.signOut();
    navigate({ to: "/auth", replace: true });
  }

  const nav = (
    <nav className="flex flex-1 flex-col px-3">
      {visibleGroups.map((group) => (
        <div key={group.label} className="space-y-0.5">
          <p className="px-3 pb-1 pt-4 text-label font-medium text-sidebar-foreground/50">{group.label}</p>
          {group.items.map((item) => {
            const tabOf = (v: unknown) => (v === "entry" ? "entry" : "performance");
            const active =
              (pathname === item.to || pathname.startsWith(`${item.to}/`)) &&
              (!item.search ||
                (item.search["tab"]
                  ? pathname !== item.to
                    ? item.search["tab"] === "performance"
                    : tabOf(search?.["tab"]) === item.search["tab"]
                  : search?.["code"] === item.search["code"]));
            return (
              <Link
                key={`${item.to}-${item.search?.["code"] ?? item.search?.["tab"] ?? ""}`}
                to={item.to}
                search={item.search as never}
                onClick={() => setOpen(false)}
                className={cn(
                  "flex items-center gap-3 rounded-lg px-3 py-2 text-small transition-colors",
                  active
                    ? "bg-sidebar-accent text-sidebar-accent-foreground shadow-[inset_2px_0_0_0_var(--color-sidebar-primary)]"
                    : "text-sidebar-foreground/75 hover:bg-sidebar-accent/60 hover:text-sidebar-accent-foreground",
                )}
              >
                <item.icon className={cn("h-5 w-5 shrink-0", active && "text-sidebar-primary")} strokeWidth={1.75} />
                {item.label}
                {item.badge ? (
                  <span className="ml-auto rounded-full bg-destructive px-2 py-0.5 text-label font-semibold text-destructive-foreground">
                    {item.badge}
                  </span>
                ) : null}
              </Link>
            );
          })}
        </div>
      ))}
      {!staffView ? <OwnerPipelinesNav onNavigate={() => setOpen(false)} /> : null}
    </nav>
  );

  const sidebarInner = (
    <div className="flex h-full flex-col bg-sidebar text-sidebar-foreground">
      <div className="starfield border-b border-sidebar-border px-5 py-6">
        <div className="flex items-center gap-2.5">
          <NorthStarMark className="h-6 w-6 text-sidebar-primary" />
          <div>
            <p className="font-display text-base leading-tight">{APP_NAME}</p>
            <p className="text-label text-sidebar-foreground/55">{APP_TAGLINE}</p>
          </div>
        </div>
      </div>
      <div className="flex-1 overflow-y-auto pb-4">{nav}</div>
      <div className="border-t border-sidebar-border p-4">
        <p className="truncate text-small font-medium">{profile?.full_name || profile?.email}</p>
        <p className="mt-1">
          <span className="inline-flex rounded-full border border-sidebar-border px-2 py-0.5 text-label text-sidebar-foreground/60">
            {roles.map((r) => ROLE_LABELS[r]).join(" · ") || "No role"}
          </span>
        </p>
        <Button
          variant="ghost"
          size="sm"
          onClick={signOut}
          className="mt-3 w-full justify-start px-2 text-sidebar-foreground/75 hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"
        >
          <LogOut className="mr-2 h-4 w-4" strokeWidth={1.75} /> Sign out
        </Button>
      </div>
    </div>
  );

  const crumbs = topBarCrumbs(pathname, visibleGroups);

  return (
    <div className="min-h-screen bg-background">
      <aside className="fixed inset-y-0 left-0 hidden w-64 lg:block">{sidebarInner}</aside>

      {open ? (
        <div className="fixed inset-0 z-50 lg:hidden">
          <button
            className="absolute inset-0 bg-foreground/40"
            onClick={() => setOpen(false)}
            aria-label="Close menu"
          />
          <div className="absolute inset-y-0 left-0 w-72">{sidebarInner}</div>
        </div>
      ) : null}

      <div className="lg:pl-64">
        {/* Slim top bar: breadcrumbs, global search, notifications. */}
        <header className="sticky top-0 z-30 flex h-14 items-center gap-3 border-b border-border/70 bg-background/85 px-4 backdrop-blur lg:px-8">
          <Button variant="ghost" size="icon" className="lg:hidden" onClick={() => setOpen((v) => !v)} aria-label="Open menu">
            {open ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
          </Button>
          <div className="flex shrink-0 items-center gap-2 lg:hidden">
            <NorthStarMark className="h-5 w-5 text-gold" />
            <span className="font-display text-sm whitespace-nowrap">{APP_NAME}</span>
          </div>
          <nav aria-label="Breadcrumb" className="hidden items-center gap-1.5 text-small text-muted-foreground lg:flex">
            {crumbs.map((c, i) => (
              <span key={`${c}-${i}`} className="flex items-center gap-1.5">
                {i > 0 ? <span className="text-border">/</span> : null}
                <span className={i === crumbs.length - 1 ? "font-medium text-foreground" : undefined}>{c}</span>
              </span>
            ))}
          </nav>
          <div className="ml-auto flex min-w-0 items-center gap-2">
            {staffView ? <GlobalSearch /> : null}
            <NotificationsBell />
          </div>
        </header>
        <main className="mx-auto min-w-0 w-full max-w-7xl px-4 py-6 lg:px-8 lg:py-8">
          {myRoles.includes("bd_manager") && showDualTrackerBanner(todayIST()) ? (
            <div className="mb-5 rounded-lg border border-gold/50 bg-gold/10 px-4 py-2.5 text-small font-medium">
              Until 30 Nov update both North Star and the BD tracker. New hotels are added only in North Star.
            </div>
          ) : null}
          {children}
        </main>
      </div>
    </div>
  );
}
