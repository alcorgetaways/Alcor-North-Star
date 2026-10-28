import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useQueryClient } from "@tanstack/react-query";
import { LogOut } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { NorthStarMark } from "@/components/NorthStarMark";
import { Button } from "@/components/ui/button";

export const Route = createFileRoute("/no-access")({
  ssr: false,
  head: () => ({
    meta: [
      { title: "No access yet — Alcor North Star" },
      { name: "description", content: "Your North Star account has no access yet." },
      { property: "og:title", content: "No access yet — Alcor North Star" },
      { property: "og:description", content: "Your North Star account has no access yet." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: NoAccess,
});

function NoAccess() {
  const navigate = useNavigate();
  const qc = useQueryClient();
  async function signOut() {
    await qc.cancelQueries();
    qc.clear();
    await supabase.auth.signOut();
    navigate({ to: "/auth", replace: true });
  }
  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-6">
      <div className="max-w-sm text-center">
        <NorthStarMark className="mx-auto h-8 w-8 text-gold" />
        <h1 className="font-display mt-4 text-2xl">Your account has no access yet</h1>
        <p className="mt-2 text-sm text-muted-foreground">Ask your Alcor administrator.</p>
        <Button className="mt-6" variant="outline" onClick={signOut}>
          <LogOut className="mr-2 h-4 w-4" /> Sign out
        </Button>
      </div>
    </div>
  );
}
