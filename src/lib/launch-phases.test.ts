import { QueryClient, QueryObserver } from "@tanstack/react-query";
import { afterEach, expect, it, vi } from "vitest";

const db = vi.hoisted(() => ({ order: vi.fn() }));
vi.mock("@/integrations/supabase/client", () => ({
  supabase: { from: () => ({ select: () => ({ order: db.order }) }) },
}));

import { launchPhaseNamesQuery, launchPhasesQuery } from "./launch-phases";

afterEach(() => vi.resetAllMocks());

it.each(["tasks-first", "board-first"])(
  "keeps launch phases usable across navigation and refetch (%s)",
  async (direction) => {
    const rows = [{ code: "P0", name: "Setup", sort_order: 0 }];
    db.order.mockResolvedValue({ data: rows, error: null });
    const client = new QueryClient({ defaultOptions: { queries: { retry: false, staleTime: Infinity } } });
    const board = new QueryObserver(client, launchPhasesQuery());
    const tasks = new QueryObserver(client, launchPhaseNamesQuery());
    const unsubscribers: Array<() => void> = [];
    try {
      // Mount one screen, populate the cache, then mount the other screen.
      if (direction === "tasks-first") {
        unsubscribers.push(tasks.subscribe(() => undefined));
        await client.fetchQuery(launchPhasesQuery());
        unsubscribers.push(board.subscribe(() => undefined));
      } else {
        unsubscribers.push(board.subscribe(() => undefined));
        await client.fetchQuery(launchPhasesQuery());
        unsubscribers.push(tasks.subscribe(() => undefined));
      }
      expect(board.getCurrentResult().data?.map((p) => p.code)).toEqual(["P0"]);
      expect(tasks.getCurrentResult().data?.get("P0")).toBe("P0 · Setup");
      expect(client.getQueryData(["launch-phases", "rows"])).toEqual(rows);

      db.order.mockResolvedValue({ data: [{ ...rows[0], name: "Ready" }], error: null });
      await client.invalidateQueries({ queryKey: ["launch-phases"] });
      expect(board.getCurrentResult().data?.find((p) => p.code === "P0")?.name).toBe("Ready");
      expect(tasks.getCurrentResult().data?.get("P0")).toBe("P0 · Ready");
      expect(Array.isArray(client.getQueryData(["launch-phases", "rows"]))).toBe(true);
    } finally {
      unsubscribers.forEach((unsubscribe) => unsubscribe());
      client.clear();
    }
  },
);
