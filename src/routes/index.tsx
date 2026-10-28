import { useEffect } from "react";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useAuth } from "@/hooks/useAuth";
import { NorthStarMark } from "@/components/NorthStarMark";
import { homeFor } from "@/lib/access";
import { accessQuery } from "@/lib/access-data";
import { useQueryClient } from "@tanstack/react-query";

export const Route = createFileRoute("/")({
  ssr: false,
  head: () => ({
    meta: [
      { title: "Alcor North Star — Hotel Growth Operating System" },
      {
        name: "description",
        content:
          "Sales and marketing management platform for Alcor Getaways: client onboarding, pipeline allocation, KPI tracking and monthly growth reviews.",
      },
      { property: "og:title", content: "Alcor North Star" },
      {
        property: "og:description",
        content: "Client onboarding, pipelines, KPIs and monthly growth reviews in one system.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: Index,
});

function Index() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { loading, user, roles } = useAuth();

  useEffect(() => {
    if (loading) return;
    if (user) {
      void queryClient
        .fetchQuery(accessQuery(user.id))
        .then((a) => navigate({ to: homeFor(a.roles, a.managedCodes), replace: true }))
        .catch(() => navigate({ to: homeFor(roles), replace: true }));
    } else {
      navigate({ to: "/auth", replace: true });
    }
  }, [loading, user, roles, navigate, queryClient]);

  return (
    <div className="flex min-h-screen items-center justify-center bg-background">
      <NorthStarMark className="h-8 w-8 animate-pulse text-gold" />
    </div>
  );
}
