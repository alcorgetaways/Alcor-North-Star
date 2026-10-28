import { useEffect, useRef } from "react";
import { shouldReseed } from "@/lib/form-rules";

/**
 * QA-03: copy server data into local form state, but never over unsaved edits.
 * A refetch (window focus, "Refresh numbers") while the form is dirty is ignored.
 */
export function useSeedWhenClean<T>(data: T | undefined | null, dirty: boolean, seed: (d: T) => void) {
  const dirtyRef = useRef(dirty);
  dirtyRef.current = dirty;
  const seedRef = useRef(seed);
  seedRef.current = seed;
  useEffect(() => {
    if (data === undefined || data === null) return;
    if (!shouldReseed(dirtyRef.current)) return;
    seedRef.current(data);
  }, [data]);
}
