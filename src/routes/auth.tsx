import { useEffect, useState } from "react";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { toast } from "sonner";
import { Eye, EyeOff, X } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { NorthStarMark } from "@/components/NorthStarMark";
import { APP_NAME } from "@/lib/constants";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export const Route = createFileRoute("/auth")({
  ssr: false,
  head: () => ({
    meta: [
      { title: "Sign in — Alcor North Star" },
      { name: "description", content: "Secure sign-in for the Alcor North Star internal platform." },
      { property: "og:title", content: "Sign in — Alcor North Star" },
      { property: "og:description", content: "Secure sign-in for Alcor North Star." },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: AuthPage,
});

const RECENT_KEY = "ns_recent_logins"; // emails only, never passwords

function AuthPage() {
  const navigate = useNavigate();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [fullName, setFullName] = useState("");
  const [busy, setBusy] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [recent, setRecent] = useState<string[]>([]);

  useEffect(() => {
    try {
      const v = JSON.parse(localStorage.getItem(RECENT_KEY) ?? "[]");
      if (Array.isArray(v)) setRecent(v.filter((x) => typeof x === "string"));
    } catch { /* ignore */ }
  }, []);

  function saveRecent(list: string[]) {
    setRecent(list);
    localStorage.setItem(RECENT_KEY, JSON.stringify(list));
  }

  const { data: setupRequired } = useQuery({
    queryKey: ["setup-required"],
    queryFn: async () => {
      const { data } = await supabase.rpc("setup_required");
      return Boolean(data);
    },
  });

  const isSetup = Boolean(setupRequired);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      if (data.session) navigate({ to: "/" });
    });
  }, [navigate]);


  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    try {
      if (isSetup) {
        const { error } = await supabase.auth.signUp({
          email,
          password,
          options: {
            data: { full_name: fullName },
            emailRedirectTo: window.location.origin,
          },
        });
        if (error) throw error;
        toast.success("Admin account created. Signing you in…");
        await supabase.auth.signInWithPassword({ email, password });
      } else {
        const { error } = await supabase.auth.signInWithPassword({ email, password });
        if (error) throw error;
      }
      const e2 = email.trim().toLowerCase();
      saveRecent([e2, ...recent.filter((x) => x !== e2)].slice(0, 10));
      navigate({ to: "/" });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Sign-in failed");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-background p-4">
      <div className="w-full max-w-sm">
        <form method="post" action="/auth" onSubmit={handleSubmit} className="card-surface w-full space-y-6 p-8">
          <div className="flex flex-col items-center text-center">
            <NorthStarMark className="h-8 w-8 text-gold" />
            <h1 className="font-display mt-4 text-page-title">{APP_NAME}</h1>
            {isSetup ? (
              <p className="mt-2 text-label text-muted-foreground">
                Create the first admin. This account becomes the platform administrator.
              </p>
            ) : null}
          </div>

          {isSetup ? (
            <div className="space-y-2">
              <Label htmlFor="fullName">Full name</Label>
              <Input
                id="fullName"
                value={fullName}
                onChange={(e) => setFullName(e.target.value)}
                required
                placeholder="Jane Doe"
              />
            </div>
          ) : null}

          <div className="space-y-2">
            <Label htmlFor="email">Email</Label>
            <Input
              id="email"
              name="email"
              type="email"
              autoComplete="username"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              placeholder="you@example.com"
            />
            {recent.length > 0 && (
              <div className="flex flex-wrap gap-2 pt-1">
                {recent.map((r) => (
                  <span key={r} className="inline-flex items-center gap-1 rounded-full border border-border bg-muted/40 py-1 pl-3 pr-1 text-label">
                    <button type="button" onClick={() => { setEmail(r); document.getElementById("password")?.focus(); }} className="hover:text-primary">{r}</button>
                    <button type="button" aria-label={`Forget ${r}`} onClick={() => saveRecent(recent.filter((x) => x !== r))} className="rounded-full p-1 text-muted-foreground hover:text-foreground"><X className="h-3 w-3" /></button>
                  </span>
                ))}
              </div>
            )}
          </div>


          <div className="space-y-2">
            <Label htmlFor="password">Password</Label>
            <div className="relative">
              <Input
                id="password"
                name="password"
                type={showPassword ? "text" : "password"}
                autoComplete={isSetup ? "new-password" : "current-password"}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                minLength={8}
                className="pr-10"
              />
              <button
                type="button"
                onClick={() => setShowPassword((v) => !v)}
                aria-label={showPassword ? "Hide password" : "Show password"}
                className="absolute inset-y-0 right-0 flex w-10 items-center justify-center text-muted-foreground transition-colors hover:text-foreground"
              >
                {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
              </button>
            </div>
            {!isSetup && (
              <button
                type="button"
                className="text-label text-muted-foreground underline-offset-4 hover:text-foreground hover:underline"
                disabled={busy}
                onClick={async () => {
                  // QA-29: trimmed address, busy while sending, no double requests.
                  const addr = email.trim();
                  if (!addr) {
                    toast.error("Enter your email first");
                    return;
                  }
                  setBusy(true);
                  try {
                    const { error } = await supabase.auth.resetPasswordForEmail(addr, {
                      redirectTo: `${window.location.origin}/reset-password`,
                    });
                    if (error) {
                      toast.error(error.message);
                      return;
                    }
                    toast.success("Check your email for a reset link");
                  } finally {
                    setBusy(false);
                  }
                }}
              >
                Forgot password?
              </button>
            )}
          </div>


          <Button type="submit" className="w-full" disabled={busy}>
            {busy ? "Please wait…" : isSetup ? "Create admin account" : "Sign in"}
          </Button>
        </form>
      </div>
    </div>
  );
}
