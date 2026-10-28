// @vitest-environment jsdom
import { describe, expect, it } from "vitest";
import { renderHook } from "@testing-library/react";
import { useSeedWhenClean } from "./use-seed-when-clean";

describe("QA-03 report re-seed", () => {
  it("refetch while dirty keeps unsaved edits; re-seeds once clean", () => {
    const seeded: string[] = [];
    const { rerender } = renderHook(({ data, dirty }) => useSeedWhenClean(data, dirty, (d) => seeded.push(d)), {
      initialProps: { data: "v1" as string | undefined, dirty: false },
    });
    expect(seeded).toEqual(["v1"]);
    rerender({ data: "v2", dirty: true }); // "Refresh numbers" while editing
    expect(seeded).toEqual(["v1"]);
    rerender({ data: "v3", dirty: false }); // after save
    expect(seeded).toEqual(["v1", "v3"]);
  });
});
