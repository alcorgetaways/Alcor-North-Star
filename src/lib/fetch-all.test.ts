import { expect, it } from "vitest";
import { fetchAll } from "./fetch-all";
it("QA-35 reads every booking beyond 5000 and propagates read failures", async () => {
  const rows = Array.from({ length: 5001 }, (_, id) => ({ id }));
  expect((await fetchAll(async (from,to) => ({ data: rows.slice(from,to+1), error: null }))).length).toBe(5001);
  await expect(fetchAll(async () => ({ data: null, error: new Error("read failed") }))).rejects.toThrow("read failed");
});
