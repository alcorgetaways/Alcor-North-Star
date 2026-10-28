import { useEffect, useRef, useState } from "react";
import { Check, Loader2 } from "lucide-react";
import { Button, type ButtonProps } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export type ConfirmResult = { ok: true } | { ok: false; message: string };

/**
 * Runs an action and normalises the outcome. Treats a thrown error or a
 * Supabase-style `{ error }` result as failure. Only real success is "ok".
 */
export async function runConfirm(action: () => PromiseLike<unknown>): Promise<ConfirmResult> {
  try {
    const res = (await action()) as { error?: { message?: string } | null } | undefined | false;
    if (res === false) return { ok: false, message: "Not completed" };
    if (res && typeof res === "object" && res.error) return { ok: false, message: res.error.message ?? "Something went wrong" };
    return { ok: true };
  } catch (e) {
    return { ok: false, message: e instanceof Error ? e.message : "Something went wrong" };
  }
}

/**
 * Approve / submit / mark-done button: spinner → green tick + done word for
 * ~1.2 s → settles. Error → small shake + message under the button.
 */
export function ConfirmButton({
  onConfirm,
  doneLabel,
  children,
  onDone,
  disabled,
  className,
  ...props
}: Omit<ButtonProps, "onClick"> & {
  onConfirm: () => PromiseLike<unknown>;
  doneLabel: string;
  /** Called after the tick has been shown (e.g. refetch). */
  onDone?: () => void;
}) {
  const [state, setState] = useState<"idle" | "busy" | "done" | "error">("idle");
  const [message, setMessage] = useState<string | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => () => {
    if (timer.current) clearTimeout(timer.current);
  }, []);

  async function click() {
    setState("busy");
    setMessage(null);
    const r = await runConfirm(onConfirm);
    if (r.ok) {
      setState("done");
      timer.current = setTimeout(() => {
        setState("idle");
        onDone?.();
      }, 1200);
    } else {
      setState("error");
      setMessage(r.message);
    }
  }

  return (
    <span className="inline-flex flex-col items-start gap-1">
      <Button
        {...props}
        type="button"
        onClick={click}
        disabled={disabled || state === "busy" || state === "done"}
        aria-live="polite"
        className={cn(
          "transition-colors duration-[var(--motion-fast)]",
          state === "done" && "bg-success text-success-foreground hover:bg-success disabled:opacity-100",
          state === "error" && "motion-shake",
          className,
        )}
      >
        {state === "busy" ? <Loader2 className="mr-1.5 h-4 w-4 animate-spin" aria-hidden="true" /> : null}
        {state === "done" ? <Check className="motion-pop mr-1.5 h-4 w-4" aria-hidden="true" /> : null}
        {state === "done" ? doneLabel : children}
      </Button>
      {state === "error" && message ? (
        <span role="alert" className="max-w-xs text-label text-destructive">
          {message}
        </span>
      ) : null}
    </span>
  );
}
