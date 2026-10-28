import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { monthKey, previousMonthKey } from "@/lib/kpi";
import { istEndOfDayMs } from "@/lib/report-scores";

export type TeamScoreRow = {
  user_id: string;
  full_name: string;
  role: string;
  reports_due: number | null;
  reports_on_time: number | null;
  on_time_pct: number | null;
  kpi_pct: number | null;
  tasks_due: number | null;
  tasks_on_time: number | null;
  launch_pct: number | null;
  open_actions: number | null;
  overdue_actions: number | null;
  red_action_score: number | null;
  overall_score: number | null;
};

export type HotelKpiRow = {
  kpi: string;
  definition: string | null;
  unit: string | null;
  direction: string;
  target: number | null;
  actual: number | null;
  achievement: number | null;
  red_reason: string | null;
  corrective_action: string | null;
};

export type HotelPipelineScore = {
  code: string;
  name: string;
  status: string;
  weight: number;
  score: number | null;
  kpis: HotelKpiRow[];
};

export type HotelScorecard = {
  month: string;
  overall: number | null;
  band: "green" | "amber" | "red";
  pipelines: HotelPipelineScore[];
};

export type ScorecardWeights = { kpi: number; on_time: number; launch: number; red_actions: number };

export const DEFAULT_WEIGHTS: ScorecardWeights = { kpi: 50, on_time: 20, launch: 20, red_actions: 10 };

export function band(score: number | null | undefined): "green" | "amber" | "red" {
  if (score == null) return "amber";
  if (score >= 90) return "green";
  if (score >= 70) return "amber";
  return "red";
}

export const BAND_CLASS: Record<"green" | "amber" | "red", string> = {
  green: "bg-success/12 text-success border-success/30",
  amber: "bg-warning/15 text-warning-foreground border-warning/40",
  red: "bg-destructive/12 text-destructive border-destructive/30",
};

export const BAND_LABEL: Record<"green" | "amber" | "red", string> = {
  green: "On track",
  amber: "Needs push",
  red: "At risk",
};

/** team_scorecard: management sees everyone, staff see their own row. */
export function useTeamScorecard(month: string, enabled = true) {
  return useQuery({
    queryKey: ["team-scorecard", month],
    enabled,
    queryFn: async () => {
      const { data, error } = await supabase.rpc("team_scorecard", { _month: month });
      if (error) throw error;
      return (data ?? []) as unknown as TeamScoreRow[];
    },
  });
}

export function useHotelScorecard(clientId: string, month: string, enabled = true) {
  return useQuery({
    queryKey: ["hotel-scorecard", clientId, month],
    enabled: enabled && !!clientId,
    queryFn: async () => {
      const { data, error } = await supabase.rpc("hotel_scorecard", {
        _client_id: clientId,
        _month: month,
      });
      if (error) throw error;
      return (data ?? null) as unknown as HotelScorecard | null;
    },
  });
}

export function useScorecardSettings(enabled = true) {
  return useQuery({
    queryKey: ["scorecard-settings"],
    enabled,
    queryFn: async () => {
      const { data, error } = await supabase.from("app_settings").select("key, value");
      if (error) throw error;
      const weightsRow = (data ?? []).find((r) => r.key === "scorecard_weights");
      const deadlineRow = (data ?? []).find((r) => r.key === "report_deadline_day");
      return {
        weights: { ...DEFAULT_WEIGHTS, ...((weightsRow?.value as Partial<ScorecardWeights>) ?? {}) },
        deadlineDay: Number(deadlineRow?.value ?? 5),
        bands: ((data ?? []).find((r) => r.key === "scorecard_bands")?.value as { green: number; amber: number } | undefined) ?? { green: 90, amber: 70 },
      };
    },
  });
}

export function useSaveScorecardSettings() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (s: { weights: ScorecardWeights; deadlineDay: number; bands?: { green: number; amber: number } }) => {
      const { error: e1 } = await supabase
        .from("app_settings")
        .upsert({ key: "scorecard_weights", value: s.weights }, { onConflict: "key" });
      if (e1) throw e1;
      const { error: e2 } = await supabase
        .from("app_settings")
        .upsert({ key: "report_deadline_day", value: s.deadlineDay }, { onConflict: "key" });
      if (e2) throw e2;
      if (s.bands) { const {error}=await supabase.rpc("set_scorecard_bands",{_green:s.bands.green,_amber:s.bands.amber}); if(error)throw error; }
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["scorecard-settings"] });
    },
  });
}

export function useCreateMonthlyReports() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async () => {
      // The cron creates last month's reports on the 1st; management can rerun it here.
      const { data, error } = await supabase.rpc("create_monthly_reports", {
        _month: previousMonthKey(monthKey()),
      });
      if (error) throw error;
      return data as number;
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["reports"] });
    },
  });
}

export type ReportOnTime = "on_time" | "late" | "overdue" | "not_due";

/** On time / Late / Overdue for the reports list, from submitted_at vs due_date. */
export function reportTiming(r: { status: string; submitted_at: string | null; due_date: string | null }): ReportOnTime {
  if (!r.due_date) return "not_due";
  const due = istEndOfDayMs(r.due_date); // end of the due day in India time
  if (r.submitted_at) return new Date(r.submitted_at).getTime() <= due ? "on_time" : "late";
  if (r.status === "draft") return Date.now() > due ? "overdue" : "not_due";
  return "not_due";
}

export const TIMING_LABEL: Record<ReportOnTime, string> = {
  on_time: "On time",
  late: "Late",
  overdue: "Overdue",
  not_due: "Not due yet",
};

export const TIMING_CLASS: Record<ReportOnTime, string> = {
  on_time: "bg-success/12 text-success border-success/30",
  late: "bg-warning/15 text-warning-foreground border-warning/40",
  overdue: "bg-destructive/12 text-destructive border-destructive/30",
  not_due: "bg-muted text-muted-foreground border-border",
};
