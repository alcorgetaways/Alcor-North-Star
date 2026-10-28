import { useEffect, useState } from "react";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { toast } from "sonner";
import { Eye, EyeOff, LogOut } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { completeForcedPasswordChange } from "@/lib/password.functions";
import { validateForcedNewPassword } from "@/lib/password-policy";
import { NorthStarMark } from "@/components/NorthStarMark";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export const Route = createFileRoute("/change-password")({
  ssr: false,
  head: () => ({
    meta: [
      { title: "Change password — Alcor North Star" },
      { name: "description", content: "Set your own password to start using Alcor North Star." },
      { property: "og:title", content: "Change password — Alcor North Star" },
      { property: "og:description", content: "Set your own password to start using Alcor North Star." },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: ChangePasswordPage,
});

function ChangePasswordPage() {
  const navigate = useNavigate();
  const [allowed, setAllowed] = useState<boolean | null>(null);
  const [current, setCurrent] = useState("");
  const [next, setNext] = useState("");
  const [confirm, setConfirm] = useState("");
  const [show, setShow] = useState(false);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    (async () => {
      const { data, error } = await supabase.auth.getUser();
      if (error || !data.user) {
        navigate({ to: "/auth", replace: true });
        return;
      }
      const { data: profile } = await supabase
        .from("profiles")
        .select("must_change_password")
        .eq("id", data.user.id)
        .maybeSingle();
      if (!profile?.must_change_password) {
        navigate({ to: "/", replace: true });
        return;
      }
      setAllowed(true);
    })();
  }, [navigate]);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    const ruleError = validateForcedNewPassword(current, next, confirm);
    if (ruleError) {
      toast.error(ruleError);
      return;
    }
    setBusy(true);
    try {
      await completeForcedPasswordChange({
        data: { current_password: current, new_password: next },
      });
      toast.success("Password changed — welcome to North Star");
      navigate({ to: "/", replace: true });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not change the password");
    } finally {
      setBusy(false);
    }
  }

  if (!allowed) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background">
        <NorthStarMark className="h-8 w-8 animate-pulse text-gold" />
      </div>
    );
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-background p-6">
      <div className="w-full max-w-sm space-y-6">
        <div className="flex flex-col items-center gap-2 text-center">
          <NorthStarMark className="h-9 w-9 text-gold" />
          <h1 className="font-display text-2xl">Choose your own password</h1>
          <p className="text-sm text-muted-foreground">
            For security you must replace the temporary password before using North Star.
          </p>
        </div>
        <form method="post" action="/change-password" onSubmit={submit} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="current-pw">Temporary password</Label>
            <Input
              id="current-pw"
              type={show ? "text" : "password"}
              autoComplete="current-password"
              value={current}
              onChange={(e) => setCurrent(e.target.value)}
              required
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="new-pw">New password (at least 10 characters)</Label>
            <div className="relative">
              <Input
                id="new-pw"
                type={show ? "text" : "password"}
                autoComplete="new-password"
                minLength={10}
                value={next}
                onChange={(e) => setNext(e.target.value)}
                required
                className="pr-10"
              />
              <button
                type="button"
                onClick={() => setShow((v) => !v)}
                aria-label={show ? "Hide passwords" : "Show passwords"}
                className="absolute inset-y-0 right-0 flex w-10 items-center justify-center text-muted-foreground transition-colors hover:text-foreground"
              >
                {show ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
              </button>
            </div>
          </div>
          <div className="space-y-2">
            <Label htmlFor="confirm-pw">Repeat new password</Label>
            <Input
              id="confirm-pw"
              type={show ? "text" : "password"}
              autoComplete="new-password"
              minLength={10}
              value={confirm}
              onChange={(e) => setConfirm(e.target.value)}
              required
            />
          </div>
          <Button type="submit" className="w-full" disabled={busy}>
            {busy ? "Saving…" : "Change password"}
          </Button>
        </form>
        <Button
          variant="ghost"
          className="w-full"
          onClick={async () => {
            await supabase.auth.signOut();
            navigate({ to: "/auth", replace: true });
          }}
        >
          <LogOut className="mr-2 h-4 w-4" /> Sign out
        </Button>
      </div>
    </div>
  );
}
