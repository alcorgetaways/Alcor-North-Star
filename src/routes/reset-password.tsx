import { useEffect, useState } from "react";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { NorthStarMark } from "@/components/NorthStarMark";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { clearPasswordFlagAfterRecovery } from "@/lib/password.functions";

export const Route = createFileRoute("/reset-password")({
  ssr: false,
  head: () => ({
    meta: [
      { title: "Reset password — Alcor North Star" },
      { name: "description", content: "Choose a new password for your Alcor North Star account." },
      { property: "og:title", content: "Reset password — Alcor North Star" },
      { property: "og:description", content: "Choose a new password for Alcor North Star." },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: ResetPasswordPage,
});

function ResetPasswordPage() {
  const navigate = useNavigate();
  const [ready, setReady] = useState(false);
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    // Only allow a reset when opened from a genuine recovery link.
    const isRecoveryLink = window.location.hash.includes("type=recovery");
    const { data } = supabase.auth.onAuthStateChange((event) => {
      if (event === "PASSWORD_RECOVERY") setReady(true);
    });
    if (isRecoveryLink) {
      supabase.auth.getSession().then(({ data: s }) => {
        if (s.session) setReady(true);
      });
    }
    return () => data.subscription.unsubscribe();
  }, []);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (password.length < 10) {
      toast.error("Your new password needs at least 10 characters");
      return;
    }
    setBusy(true);
    const { error } = await supabase.auth.updateUser({ password });
    if (error) {
      setBusy(false);
      toast.error(error.message);
      return;
    }
    try {
      await clearPasswordFlagAfterRecovery();
    } catch {
      // Flag stays set: the first-login screen will ask once more.
    }
    setBusy(false);
    toast.success("Password updated");
    navigate({ to: "/" });
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-background p-6">
      <div className="w-full max-w-sm space-y-6">
        <div className="flex flex-col items-center gap-2 text-center">
          <NorthStarMark />
          <h1 className="text-xl font-semibold">Set a new password</h1>
        </div>
        {ready ? (
          <form onSubmit={submit} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="pw">New password</Label>
              <Input id="pw" type="password" minLength={10} required value={password}
                onChange={(e) => setPassword(e.target.value)} autoComplete="new-password" />
            </div>
            <Button type="submit" className="w-full" disabled={busy}>
              {busy ? "Saving…" : "Update password"}
            </Button>
          </form>
        ) : (
          <p className="text-center text-sm text-muted-foreground">
            This page only works from the reset link in your email. Request a new link from the sign-in page.
          </p>
        )}
      </div>
    </div>
  );
}
