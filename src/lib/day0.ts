/** Day 0 checklist shown before "Confirm Day 0". The database (_day0_missing) is the real gate; this mirrors it. */
export type Day0Input = {
  hasAgreement: boolean;
  needsNoc: boolean;
  hasNoc: boolean;
  advanceAmount: string | number | null;
  advanceDate: string | null;
  reference: string | null;
  hasScreenshot: boolean;
};

export function day0Checklist(i: Day0Input): Array<{ label: string; ok: boolean }> {
  const items = [{ label: "Signed agreement uploaded", ok: i.hasAgreement }];
  if (i.needsNoc) items.push({ label: "Signed NOC uploaded", ok: i.hasNoc });
  items.push(
    { label: "Advance amount recorded", ok: Number(i.advanceAmount ?? 0) > 0 },
    { label: "Advance payment date recorded", ok: !!i.advanceDate },
    { label: "Payment reference or screenshot", ok: !!(i.reference ?? "").trim() || i.hasScreenshot },
  );
  return items;
}
