import { describe, expect, it } from "vitest";
import { isEvidencePath } from "./evidence";

describe("isEvidencePath", () => {
  it("treats http and https links as external", () => {
    expect(isEvidencePath("https://example.com/proof.png")).toBe(false);
    expect(isEvidencePath("http://example.com/x")).toBe(false);
  });
  it("treats storage paths as uploaded files", () => {
    expect(isEvidencePath("client-1/action-evidence/abc.pdf")).toBe(true);
  });
  it("treats blank or scheme-less text as a path, never a link", () => {
    expect(isEvidencePath("")).toBe(true);
    expect(isEvidencePath("ftp://x")).toBe(true);
  });
});
