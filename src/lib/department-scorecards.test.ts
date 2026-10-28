import { describe, it, expect } from "vitest";
import { departmentMetricValue } from "./department-scorecards";
describe("Q31 metric values", () => {
  it("preserves missing auto data rather than making it zero", () => { expect(departmentMetricValue(null, "dept.new_properties")).toBe("No data yet"); });
  it("displays revenue signed in lakhs", () => { expect(departmentMetricValue(250000, "dept.revenue_signed")).toBe("₹2.5 lakh"); });
  it("preserves explicitly recorded zero meetings", () => { expect(departmentMetricValue(0, "dept.meetings")).toBe("0"); });
});