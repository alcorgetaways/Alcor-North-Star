import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export type DepartmentMetric = { id: string; name: string; unit: string; source_key: string; actual: number | null; target: number | null; suggested: number | null; target_status: string; achievement: number | null };
export type DepartmentScorecard = {
  id: string; code: string; name: string; manager: string; manager_id: string; month: string;
  can_edit: boolean; can_approve: boolean; score: number | null; metrics: DepartmentMetric[];
  manual: { outside_proposals: number | null; meetings: number | null } | null;
  people: Array<{ user_id: string; name: string; due: number; on_time: number; pct: number | null }>;
};
export function departmentMetricValue(value: number | null, key: string) {
  if (value === null) return "No data yet";
  if (key === "dept.revenue_signed") return `₹${(value / 100000).toLocaleString("en-IN", { maximumFractionDigits: 2 })} lakh`;
  return `${value.toLocaleString("en-IN", { maximumFractionDigits: 2 })}${key === "dept.tasks_on_time" ? "%" : ""}`;
}
export function useDepartmentScorecards(month: string) {
  return useQuery({ queryKey: ["department-scorecards", month], queryFn: async () => {
    const { data, error } = await supabase.rpc("department_scorecards", { _month: month });
    if (error) throw error;
    return data as unknown as DepartmentScorecard[];
  } });
}
export function useSaveDepartmentMonth() {
  const qc = useQueryClient();
  return useMutation({ mutationFn: async (v: { pipeline: string; month: string; outside: number | null; meetings: number | null }) => {
    const { error } = await supabase.rpc("save_department_month", { _pipeline: v.pipeline, _month: v.month, _outside: v.outside as number, _meetings: v.meetings as number });
    if (error) throw error;
  }, onSuccess: () => { void qc.invalidateQueries({ queryKey: ["department-scorecards"] }); } });
}
export function useSaveDepartmentTarget() {
  const qc = useQueryClient();
  return useMutation({ mutationFn: async (v: { pipeline: string; definition: string; month: string; target: number; approve: boolean }) => {
    const { error } = await supabase.rpc("save_department_target", { _pipeline: v.pipeline, _definition: v.definition, _month: v.month, _target: v.target, _approve: v.approve });
    if (error) throw error;
  }, onSuccess: () => { void qc.invalidateQueries({ queryKey: ["department-scorecards"] }); } });
}