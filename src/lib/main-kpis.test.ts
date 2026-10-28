import { expect, it } from "vitest";
import { orderMainKpis, netSubscribers, formatSum, mergeNewKeys, yoyValue, ownerAdsMain, portfolioMainTotals } from "./main-kpis";
it("Main KPI positions remain ordered independently of scoring order", () => {
  expect(orderMainKpis([{ main_position: 4 }, { main_position: 1 }, { main_position: 3 }]).map((r) => r.main_position)).toEqual([1, 3, 4]);
});
it("Metricool subscribers are gained minus lost, including negative net growth", () => {
  expect(netSubscribers(7, 10)).toBe(-3); expect(netSubscribers(7, null)).toBeNull();
});
it("Publications totals include stories and withhold incomplete format sums", () => {
  expect(formatSum([4, 2, 3])).toBe(9); expect(formatSum([4, null, 3])).toBeNull();
});
it("Localo and Metricool backfills never overwrite existing keys", () => {
  expect(mergeNewKeys({ views: 15, chat_clicks: 3 }, { views: 99, chat_clicks: 8, booking_clicks: 2 })).toEqual({ views: 15, chat_clicks: 3, booking_clicks: 2 });
});
it("OTA YoY is unavailable without a positive last-year approved base", () => {
  expect(yoyValue(20, null)).toBeNull(); expect(yoyValue(20, 0)).toBeNull(); expect(yoyValue(20, 10)).toBe(100);
});
it("Owner Ads main cards retain all already-visible weekly rows and the required order", () => {
  expect(ownerAdsMain([{ campaigns_live: 2, ad_spend: 100, leads: 5 }, { campaigns_live: 3, ad_spend: 200, leads: 10 }])).toEqual([
    { name: "Live ads", value: 3, kpi_type: "number" }, { name: "Ad spend", value: 300, kpi_type: "currency" },
    { name: "Leads", value: 15, kpi_type: "number" }, { name: "Cost per lead", value: 20, kpi_type: "currency" },
  ]);
});
it("Portfolio sums additive actuals but never sums rates or per-hotel maxima", () => {
  const base = {pipeline_code:"gbp",pipeline_name:"GMB",definition_id:"calls",name:"Calls",kpi_type:"number",unit:"count",direction:"higher_better",main_position:2,main_group:null};
  const result = portfolioMainTotals([{...base,value:3},{...base,value:7},{...base,definition_id:"rate",kpi_type:"percentage",value:90},{...base,definition_id:"max",name:"Channels live",value:4}]);
  expect(result[0]?.items.map((k)=>k.value)).toEqual([10]);
});