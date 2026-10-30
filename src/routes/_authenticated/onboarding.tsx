import { demoIn } from "@/lib/demo";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { PageHeader } from "@/components/PageHeader";
import { Button } from "@/components/ui/button";
import { LAUNCH_STATUS_LABEL } from "@/lib/launch";
import { DataTable } from "@/components/DataTable";
import { StatusBadge } from "@/components/StatusBadge";

export const Route = createFileRoute("/_authenticated/onboarding")({
  head: () => ({
    meta: [
      { title: "BD Onboarding — Alcor North Star" },
      {
        name: "description",
        content: "Launch drafts and ready-to-activate hotels, with the step each one stopped at.",
      },
      { property: "og:title", content: "BD Onboarding — Alcor North Star" },
      {
        property: "og:description",
        content: "Launch drafts and ready-to-activate hotels for the Alcor Getaways BD team.",
      },
    ],
  }),
  component: OnboardingDashboard,
});

type DraftRow = {
  id: string;
  client_id: string;
  status: string;
  day0_date: string | null;
  updated_at: string;
  plans: { name: string } | null;
  clients: { hotel_name: string; city: string | null } | null;
};

function stepFor(d: DraftRow): { step: number; name: string } {
  if (d.status === "draft") return { step: d.day0_date ? 3 : 2, name: d.day0_date ? "Team" : "Day 0" };
  if (d.status === "awaiting_day0") return { step: 3, name: "Team" };
  return { step: 1, name: "Plan" };
}

function OnboardingDashboard() {
  const { data: drafts = [], isLoading } = useQuery({
    queryKey: ["launch-drafts"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("client_launches")
        .select("id, client_id, status, day0_date, updated_at, plans(name), clients(hotel_name, city)").not("client_id", "in", demoIn())
        .in("status", ["draft", "awaiting_day0"])
        .order("updated_at", { ascending: false });
      if (error) throw error;
      // Hotels saved at Basics only — no launch row yet.
      const { data: noPlan } = await supabase
        .from("clients")
        .select("id, hotel_name, city, client_launches(id)")
        .eq("onboarding_status", "in_progress")
        .order("created_at", { ascending: false });
      const basicsOnly = (noPlan ?? [])
        .filter((c) => !(c.client_launches as unknown[] | null)?.length)
        .map(
          (c): DraftRow => ({
            id: `c-${c.id}`,
            client_id: c.id,
            status: "basics",
            day0_date: null,
            updated_at: "",
            plans: null,
            clients: { hotel_name: c.hotel_name, city: c.city },
          }),
        );
      return [...basicsOnly, ...(data as unknown as DraftRow[])];
    },
  });

  return (
    <div className="space-y-6">
      <PageHeader
        title="BD Onboarding"
        description="Hotels still being set up: pick up a draft or confirm Day 0 and activate the team."
      />

      <section className="space-y-4">
        <h2 className="text-section-title font-semibold">Launches being set up</h2>
        <DataTable<DraftRow>
          rows={drafts}
          rowKey={(d) => d.id}
          loading={isLoading}
          emptyMessage="No launches are being set up right now."
          emptyHint="There are no onboarding drafts to continue right now."
          columns={[
            {
              key: "hotel",
              header: "Hotel",
              render: (d) => (
                <>
                  <p className="font-medium">{d.clients?.hotel_name}</p>
                  <p className="text-label text-muted-foreground">{d.clients?.city ?? "—"}</p>
                </>
              ),
            },
            { key: "plan", header: "Plan", render: (d) => d.plans?.name ?? "No plan yet" },
            { key: "step", header: "Stopped at", render: (d) => stepFor(d).name },
            {
              key: "status",
              header: "Status",
              render: (d) => (
                <StatusBadge
                  status={d.status}
                  label={d.status === "basics" ? "Basics" : LAUNCH_STATUS_LABEL[d.status] ?? d.status}
                />
              ),
            },
            {
              key: "action",
              header: "",
              align: "right",
              render: (d) => (
                <Button asChild size="sm">
                  <Link to="/clients/new" search={{ clientId: d.client_id, step: stepFor(d).step }}>
                    Continue
                  </Link>
                </Button>
              ),
            },
          ]}
        />
      </section>
    </div>
  );
}
