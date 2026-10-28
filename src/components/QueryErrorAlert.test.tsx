// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, expect, it } from "vitest";
import { QueryErrorAlert } from "./ResDesk";

afterEach(cleanup);

it("QA-36 surfaces the real error message instead of a role or assignment message", () => {
  render(<QueryErrorAlert error={new Error("permission denied for table rd_daily_logs")} fallback="Fallback" />);
  expect(screen.getByRole("alert").textContent).toBe("permission denied for table rd_daily_logs");
});

it("QA-36 falls back to a retry hint only when there is no error message", () => {
  render(<QueryErrorAlert error={null} fallback="Could not load performance figures. Please retry." />);
  expect(screen.getByRole("alert").textContent).toBe("Could not load performance figures. Please retry.");
});
