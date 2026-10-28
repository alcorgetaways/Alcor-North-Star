import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { MetricCard, shouldCountUp } from "@/components/MetricCard";
import { ProgressRing, ringGeometry } from "@/components/ProgressRing";
import { runConfirm } from "@/components/ConfirmButton";
import { inr, inrShort, int, pct, signedPct } from "@/lib/format";
import { currency, pct as kpiPct } from "@/lib/kpi";

describe("MetricCard", () => {
  it("skips the count-up when reduced motion is on", () => {
    expect(shouldCountUp("card", true, false)).toBe(false);
  });
  it("counts up only the first time per session", () => {
    expect(shouldCountUp("card", false, false)).toBe(true);
    expect(shouldCountUp("card", false, true)).toBe(false);
    expect(shouldCountUp(undefined, false, false)).toBe(false);
  });
  it("renders the final value immediately (no animation on the server)", () => {
    const html = renderToStaticMarkup(<MetricCard id="x" label="Leads" value={1234} />);
    expect(html).toContain("1,234");
  });
});

describe("ProgressRing", () => {
  it("0%", () => expect(ringGeometry(0)).toMatchObject({ pct: 0, ratio: 0, complete: false }));
  it("62%", () => expect(ringGeometry(62)).toMatchObject({ pct: 62, ratio: 0.62, complete: false, text: "62%" }));
  it("100% is complete", () => expect(ringGeometry(100)).toMatchObject({ pct: 100, ratio: 1, complete: true }));
  it(">100% caps the arc but shows the real %", () => expect(ringGeometry(130)).toMatchObject({ pct: 130, ratio: 1, complete: true, text: "130%" }));
  it("null shows a dash and no arc", () => {
    expect(ringGeometry(null)).toMatchObject({ pct: null, text: "—" });
    const html = renderToStaticMarkup(<ProgressRing value={null} />);
    expect(html).not.toContain("ring-arc");
  });
  it("has an accessible label", () => {
    const html = renderToStaticMarkup(<ProgressRing value={62} label="of yearly goal" />);
    expect(html).toContain('role="img"');
    expect(html).toContain('aria-label="62% of yearly goal"');
  });
});

describe("ConfirmButton runConfirm", () => {
  it("success only when the action resolves without an error", async () => {
    expect(await runConfirm(async () => ({ error: null }))).toEqual({ ok: true });
  });
  it("Supabase-style error is a failure with its message", async () => {
    expect(await runConfirm(async () => ({ error: { message: "Gate A is not signed" } }))).toEqual({ ok: false, message: "Gate A is not signed" });
  });
  it("thrown error is a failure", async () => {
    expect(await runConfirm(async () => { throw new Error("Please tell the team what to change"); })).toEqual({ ok: false, message: "Please tell the team what to change" });
  });
});

describe("format", () => {
  it("INR short form", () => {
    expect(inrShort(660000)).toBe("₹6.6L");
    expect(inrShort(12000000)).toBe("₹1.2Cr");
    expect(inrShort(950)).toBe("₹950");
    expect(inrShort(100000)).toBe("₹1L");
  });
  it("INR full and integers use en-IN grouping", () => {
    expect(inr(655975)).toBe("₹6,55,975");
    expect(int(123456)).toBe("1,23,456");
  });
  it("percent with 0–1 decimals", () => {
    expect(pct(62.46)).toBe("62%");
    expect(pct(62.46, 1)).toBe("62.5%");
    expect(signedPct(-4)).toBe("−4%");
    expect(signedPct(12.34)).toBe("+12.3%");
  });
  it("missing values are a dash", () => {
    expect(inr(null)).toBe("—");
    expect(int(undefined)).toBe("—");
    expect(pct(Number.NaN)).toBe("—");
  });
  it("old kpi helpers return the same output as before", () => {
    expect(currency(655975)).toBe("₹6,55,975");
    expect(kpiPct(87)).toBe("87%");
  });
});
