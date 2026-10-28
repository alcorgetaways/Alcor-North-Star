import { useEffect, useState } from "react";

/** List/Board preference per page, kept on this device; read after mount to avoid a hydration mismatch. */
export function useViewPref(key: string, fallback: "list" | "board" = "list") {
  const [view, setView] = useState<"list" | "board">(fallback);
  useEffect(() => {
    try {
      const v = localStorage.getItem(`ns-view-${key}`);
      if (v === "list" || v === "board") setView(v);
    } catch {
      /* ignore */
    }
  }, [key]);
  const set = (v: string) => {
    const next = v === "board" ? "board" : "list";
    setView(next);
    try {
      localStorage.setItem(`ns-view-${key}`, next);
    } catch {
      /* ignore */
    }
  };
  return [view, set] as const;
}
