import { ConfirmButton } from "@/components/ConfirmButton";
import { useEffect, useRef, useState } from "react";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Check, ChevronLeft, ChevronRight, Loader2, Plus, Upload, X } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { ensureClientLogin } from "@/lib/team.functions";
import { fetchActiveStaff } from "@/lib/staff";
import { LAUNCH_STATUS_LABEL, todayIST } from "@/lib/launch";
import { PageHeader } from "@/components/PageHeader";
import { DataTable } from "@/components/DataTable";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { PROPERTY_TYPES } from "@/lib/constants";
import { day0Checklist } from "@/lib/day0";
import { useAuth } from "@/hooks/useAuth";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/_authenticated/clients/new")({
  validateSearch: (search: Record<string, unknown>) => {
    const stepNum = Number(search["step"]);
    const launchId = typeof search["launchId"] === "string" && search["launchId"] !== "" ? search["launchId"] : undefined;
    return {
      clientId: typeof search["clientId"] === "string" ? (search["clientId"] as string) : undefined,
      step: search["step"] !== undefined && search["step"] !== "" && Number.isInteger(stepNum) ? stepNum : undefined,
      launchId,
    } as { clientId?: string; step?: number; launchId?: string };
  },
  head: () => ({
    meta: [
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
      { title: "Onboard a hotel — Alcor North Star" },
      {
        name: "description",
        content: "Four-step launch onboarding: basics, plan, Day 0 and team allocation.",
      },
      { property: "og:title", content: "Onboard a hotel — Alcor North Star" },
      { property: "og:description", content: "Guided hotel launch onboarding for Alcor Getaways." },
    ],
  }),
  component: NewClient,
});

const STEPS = ["Basics", "Plan", "Day 0", "Team"];
const ADDONS: Array<{ key: string; label: string }> = [
  { key: "landing_page", label: "Landing page ₹15,000" },
  { key: "funnel_setup", label: "Funnel setup ₹10,000" },
];
const CRM_OPTIONS = ["neodove", "superfone", "alcor_shared"] as const;

type Plan = {
  id: string;
  code: string;
  name: string;
  fee_inr: number | null;
  quarterly_fee_inr: number | null;
  billing_period: string | null;
  duration_weeks: number | null;
  sort_order?: number;
  day0_requires_noc: boolean;
  launch_day: number | null;
  plan_modules: Array<{ module_code: string; window_label: string | null; launch_modules: { name: string; owner_role: string; client_side: boolean } | null }>;
};

type CustomPlanServiceDraft = {
  service_name: string;
  scope: string;
  frequency: string;
  pipeline_code: string;
  included: boolean;
  fromBase: boolean;
};

type CustomPlanDraft = {
  name: string;
  base_plan_version_id: string;
  monthly_retainer_inr: string;
  commission_direct_pct: string;
  commission_ota_pct: string;
  commission_weddings_pct: string;
  commission_other_pct: string;
  setup_fee_inr: string;
  addon_ids: string[];
  contract_start: string;
  contract_end: string;
  payment_cycle: string;
  notice_days: string;
  termination_terms: string;
  services: CustomPlanServiceDraft[];
};

const COMMISSION_FIELDS = [
  { key: "commission_direct_pct", label: "Direct" },
  { key: "commission_ota_pct", label: "OTA" },
  { key: "commission_weddings_pct", label: "Weddings / events" },
  { key: "commission_other_pct", label: "Other" },
] as const;

// Fixed North Star launch allocation. Several module codes belong to the same
// roadmap workstream (for example, the GMB photos/reviews modules).
const FIXED_MODULE_ASSIGNMENTS: Record<string, { primary: string; backup: string }> = {
  INF: { primary: "Nisha", backup: "Anju" },
  TA: { primary: "Ronak", backup: "Mayank" },
  GAD: { primary: "Mohnish", backup: "Mayank" },
  PM: { primary: "Mohnish", backup: "Arvind" },
  VRD: { primary: "Mohnish", backup: "Shalini" },
  WA: { primary: "Ronak", backup: "Mohnish" },
  FUN: { primary: "Ronak", backup: "Mohnish" },
  BRD: { primary: "Mayank", backup: "Mohnish" },
  SMM: { primary: "Dinesh", backup: "Ashish" },
  GMB: { primary: "Anju", backup: "Nisha" },
  CRE: { primary: "Anju", backup: "Nisha" },
  ORM: { primary: "Anju", backup: "Nisha" },
  OTA: { primary: "Shalini", backup: "Mohnish" },
  RES: { primary: "Mohnish", backup: "Shalini" },
  RV: { primary: "Mohnish", backup: "" },
  BD: { primary: "Shalini", backup: "Amit" },
  FIN: { primary: "Shalini", backup: "Amit" },
  AM: { primary: "Shalini", backup: "Mayank" },
};

function staffNameKey(name: string) {
  const first = name.trim().split(/\s+/)[0]?.toLowerCase().replace(/[^a-z]/g, "") ?? "";
  if (first === "aashish") return "ashish";
  if (first === "monish") return "mohnish";
  return first;
}


function inr(v: number | null | undefined) {
  return v == null ? "—" : `₹${v.toLocaleString("en-IN")}`;
}

function NewClient() {
  const navigate = useNavigate();
  const qc = useQueryClient();
  const { user, isManager } = useAuth();
  const { clientId, step: stepParam, launchId: launchIdParam } = Route.useSearch() as { clientId?: string; step?: number; launchId?: string };
  const [step, setStep] = useState(stepParam ? Math.min(3, Math.max(0, stepParam)) : 0);
  const [saving, setSaving] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [day0Choice, setDay0Choice] = useState(todayIST());
  const [picked, setPicked] = useState({ agm: false, noc: false });
  const originalPlanId = useRef<string | null>(null);
  const originalCustomPlanId = useRef<string | null>(null);
  const [planChangeOpen, setPlanChangeOpen] = useState(false);
  const [planChangeReason, setPlanChangeReason] = useState("");
  const [customPlanDialogOpen, setCustomPlanDialogOpen] = useState(false);
  const [customPlanDraft, setCustomPlanDraft] = useState<CustomPlanDraft | null>(null);
  const [customPlanCreated, setCustomPlanCreated] = useState<{
    id: string;
    name: string;
    monthly_retainer_inr: number | null;
    setup_fee_inr: number | null;
    payment_cycle: string;
    approval_status: string;
  } | null>(null);
  const warnCutoff = new Date(Date.now() + 5.5 * 3600 * 1000 - 7 * 86400000).toISOString().slice(0, 10);

  const [basics, setBasics] = useState({
    hotel_name: "",
    legal_name: "",
    owner_name: "",
    gm_name: "",
    res_contact_name: "",
    res_contact_phone: "",
    email: "",
    mobile: "",
    whatsapp: "",
    city: "",
    state: "",
    address: "",
    number_of_rooms: "",
    property_type: "",
    website: "",
    gstin: "",
  });

  type DuplicateMatch = {
    client_id: string;
    hotel_name: string;
    city: string | null;
    state: string | null;
    email: string | null;
    mobile: string | null;
    matched_on: string[];
    launches: Array<{ id: string; status: string; plan: string | null }>;
  };
  const [duplicates, setDuplicates] = useState<DuplicateMatch[] | null>(null);
  const [confirmNew, setConfirmNew] = useState(false);

  const [launch, setLaunch] = useState<{
    id: string | null;
    plan_id: string | null;
    custom_plan_id: string | null;
    addons: string[];
    crm_option: string;
    meta_budget_daily: string;
    google_budget_daily: string;
    advance_amount: string;
    advance_received_at: string;
    payment_reference: string;
    payment_screenshot_path: string | null;
    status: string;
    day0_date: string | null;
    launch_date: string | null;
  }>({
    id: null,
    plan_id: null,
    custom_plan_id: null,
    addons: [],
    crm_option: "",
    meta_budget_daily: "",
    google_budget_daily: "",
    advance_amount: "",
    advance_received_at: "",
    payment_reference: "",
    payment_screenshot_path: null,
    status: "draft",
    day0_date: null,
    launch_date: null,
  });

  const [assignments, setAssignments] = useState<
    Record<string, { primary: string; backup: string; contact_name: string; contact_phone: string }>
  >({});

  const plan = useQuery({
    queryKey: ["plans-with-modules"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("plans")
        .select(
          "id, code, name, fee_inr, quarterly_fee_inr, billing_period, duration_weeks, day0_requires_noc, launch_day, sort_order, plan_modules(module_code, window_label, launch_modules(name, owner_role, client_side))",
        )
        .eq("active", true)
        .order("sort_order");
      if (error) throw error;
      return data as unknown as Plan[];
    },
  });

  const planVersions = useQuery({
    queryKey: ["onboarding-plan-versions"],
    queryFn: async () => {
      const { data, error } = await (supabase as any).from("plan_versions")
        .select("id, plan_id, name, version, status, monthly_retainer_inr, notice_days, plan_services(service_name, scope, frequency, pipeline_code, included, sort_order)")
        .eq("status", "active")
        .order("version", { ascending: false });
      if (error) throw error;
      return (data ?? []) as Array<{
        id: string;
        plan_id: string;
        name: string;
        version: number;
        monthly_retainer_inr: number;
        notice_days: number;
        plan_services: Array<CustomPlanServiceDraft & { sort_order: number }>;
      }>;
    },
  });

  const addons = useQuery({
    queryKey: ["onboarding-addons-catalogue"],
    queryFn: async () => {
      const { data, error } = await (supabase as any).from("addons_catalogue").select("id, name, price_inr, price_type").eq("active", true).order("sort_order");
      if (error) throw error;
      return (data ?? []) as Array<{ id: string; name: string; price_inr: number | null; price_type: string }>;
    },
  });

  const existingCustomPlan = useQuery({
    queryKey: ["onboarding-selected-custom-plan", launch.custom_plan_id],
    enabled: !!launch.custom_plan_id,
    queryFn: async () => {
      const { data, error } = await (supabase as any).from("custom_plans")
        .select("id, name, monthly_retainer_inr, setup_fee_inr, payment_cycle, approval_status")
        .eq("id", launch.custom_plan_id)
        .single();
      if (error) throw error;
      return data as { id: string; name: string; monthly_retainer_inr: number | null; setup_fee_inr: number | null; payment_cycle: string; approval_status: string };
    },
  });

  const customPlanForLaunch = customPlanCreated?.id === launch.custom_plan_id ? customPlanCreated : null;

  function servicesForVersion(versionId: string): CustomPlanServiceDraft[] {
    const version = planVersions.data?.find((item) => item.id === versionId);
    return [...(version?.plan_services ?? [])]
      .sort((a, b) => a.sort_order - b.sort_order)
      .map((service) => ({
        service_name: service.service_name,
        scope: service.scope ?? "",
        frequency: service.frequency ?? "",
        pipeline_code: service.pipeline_code ?? "",
        included: true,
        fromBase: true,
      }));
  }

  function openCustomPlanBuilder() {
    const versions = planVersions.data ?? [];
    const base = versions.find((item) => plan.data?.some((candidate) => candidate.id === item.plan_id && candidate.code === "gmb_seo")) ?? versions[0];
    if (!base) {
      toast.error("No active base plan is available for a custom plan.");
      return;
    }
    setCustomPlanDraft({
      name: basics.hotel_name.trim() ? `${basics.hotel_name.trim()} — Custom Plan` : "",
      base_plan_version_id: base.id,
      monthly_retainer_inr: String(base.monthly_retainer_inr),
      commission_direct_pct: "",
      commission_ota_pct: "",
      commission_weddings_pct: "",
      commission_other_pct: "0",
      setup_fee_inr: "",
      addon_ids: [],
      contract_start: "",
      contract_end: "",
      payment_cycle: "monthly",
      notice_days: String(base.notice_days),
      termination_terms: "",
      services: servicesForVersion(base.id),
    });
    setCustomPlanDialogOpen(true);
  }

  function changeCustomPlanBase(versionId: string) {
    if (!customPlanDraft) return;
    const base = planVersions.data?.find((item) => item.id === versionId);
    setCustomPlanDraft({
      ...customPlanDraft,
      base_plan_version_id: versionId,
      monthly_retainer_inr: base ? String(base.monthly_retainer_inr) : customPlanDraft.monthly_retainer_inr,
      notice_days: base ? String(base.notice_days) : customPlanDraft.notice_days,
      services: servicesForVersion(versionId),
    });
  }

  async function saveNewCustomPlan() {
    const draft = customPlanDraft;
    if (!draft || !draft.name.trim()) {
      toast.error("Enter a name for the custom plan.");
      return;
    }
    const baseVersion = planVersions.data?.find((item) => item.id === draft.base_plan_version_id);
    const basePlan = baseVersion ? plan.data?.find((item) => item.id === baseVersion.plan_id) : null;
    if (!baseVersion || !basePlan) {
      toast.error("The selected base plan is not available. Choose another base plan.");
      return;
    }
    const serviceRows = draft.services.filter((service) => service.service_name.trim());
    if (serviceRows.length !== draft.services.length) {
      toast.error("Every added service needs a service name.");
      return;
    }
    setSaving(true);
    try {
      const num = (value: string) => value.trim() === "" ? null : Number(value);
      const { data: created, error } = await (supabase as any).from("custom_plans").insert({
        base_plan_version_id: draft.base_plan_version_id,
        name: draft.name.trim(),
        created_by: user?.id ?? null,
        monthly_retainer_inr: num(draft.monthly_retainer_inr),
        commission_direct_pct: num(draft.commission_direct_pct),
        commission_ota_pct: num(draft.commission_ota_pct),
        commission_weddings_pct: num(draft.commission_weddings_pct),
        commission_other_pct: Number(draft.commission_other_pct || 0),
        setup_fee_inr: num(draft.setup_fee_inr),
        addon_ids: draft.addon_ids,
        contract_start: draft.contract_start || null,
        contract_end: draft.contract_end || null,
        payment_cycle: draft.payment_cycle,
        notice_days: num(draft.notice_days),
        termination_terms: draft.termination_terms.trim() || null,
      }).select("id, approval_status, name, monthly_retainer_inr, setup_fee_inr, payment_cycle").single();
      if (error) throw error;
      if (serviceRows.length) {
        const { error: servicesError } = await (supabase as any).from("custom_plan_services").insert(serviceRows.map((service, index) => ({
          custom_plan_id: created.id,
          service_name: service.service_name.trim(),
          scope: service.scope.trim() || null,
          frequency: service.frequency.trim() || null,
          pipeline_code: service.pipeline_code.trim() || null,
          included: service.included,
          sort_order: index,
        })));
        if (servicesError) throw servicesError;
      }
      const { data: finalPlan, error: finalPlanError } = await (supabase as any).from("custom_plans")
        .select("id, approval_status, name, monthly_retainer_inr, setup_fee_inr, payment_cycle")
        .eq("id", created.id)
        .single();
      if (finalPlanError) throw finalPlanError;

      setLaunch((current) => ({ ...current, plan_id: basePlan.id, custom_plan_id: created.id, addons: [] }));
      setCustomPlanCreated(finalPlan);
      setCustomPlanDialogOpen(false);
      setCustomPlanDraft(null);
      void qc.invalidateQueries({ queryKey: ["custom-plans"] });
      toast.success(finalPlan.approval_status === "approved" ? "Custom plan created and approved." : "Custom plan created. Management approval is required before activation.");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not create the custom plan.");
    } finally {
      setSaving(false);
    }
  }

  const staff = useQuery({
    queryKey: ["launch-staff"],
    queryFn: fetchActiveStaff,
  });

  // Files already uploaded for this launch (viewable by BD / management).
  const wizardDocs = useQuery({
    queryKey: ["wizard-docs", clientId],
    enabled: !!clientId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("documents")
        .select("id, doc_type, file_path")
        .eq("client_id", clientId!)
        .in("doc_type", ["Agreement Copy", "NOC — No Objection Certificate"])
        .not("file_path", "is", null)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data;
    },
  });

  // QA-07: the form stays closed until a resumed draft has loaded, so blanks never overwrite saved data.
  const [hydrate, setHydrate] = useState<{ state: "idle" | "loading" | "ready" | "error"; message?: string }>({ state: "idle" });
  // Hydrate a saved draft when resuming from the URL.
  useEffect(() => {
    if (!clientId || loaded) return;
    setLoaded(true);
    setHydrate({ state: "loading" });
    (async () => {
     try {
      // Commercial columns (advance, payment ref, screenshot) are column-locked in the DB;
      // they come through the launch_commercials RPC below, not the table select.
      const LAUNCH_BASE_COLS =
        "id, client_id, plan_id, custom_plan_id, addons, crm_option, meta_budget_daily, google_budget_daily, advance_received_at, status, day0_date, launch_date";
      const [{ data: c, error: cErr }, { data: ls, error: lErr }] = await Promise.all([
        supabase.from("clients").select("*").eq("id", clientId).maybeSingle(),
        launchIdParam
          ? supabase.from("client_launches").select(LAUNCH_BASE_COLS).eq("id", launchIdParam).limit(1)
          : supabase
              .from("client_launches")
              .select(LAUNCH_BASE_COLS)
              .eq("client_id", clientId)
              .in("status", ["draft", "awaiting_day0"])
              .order("created_at", { ascending: false })
              .limit(1),
      ]);
      if (cErr || lErr) throw cErr ?? lErr;
      if (!c) throw new Error("This hotel could not be found, or you don't have access to it.");
      if (c) {
        const ef = (c.extra_fields ?? {}) as Record<string, string>;
        setBasics({
          hotel_name: c.hotel_name ?? "",
          legal_name: ef["legal_name"] ?? "",
          owner_name: c.owner_name ?? "",
          gm_name: ef["gm_name"] ?? "",
          res_contact_name: ef["res_contact_name"] ?? "",
          res_contact_phone: ef["res_contact_phone"] ?? "",
          email: c.email ?? "",
          mobile: c.mobile ?? "",
          whatsapp: c.whatsapp ?? "",
          city: c.city ?? "",
          state: c.state ?? "",
          address: c.address ?? "",
          number_of_rooms: c.number_of_rooms ? String(c.number_of_rooms) : "",
          property_type: c.property_type ?? "",
          website: c.website ?? "",
          gstin: c.gst_number ?? "",
        });
      }
      const l = ls?.[0];
      if (l) {
        const { data: commRaw, error: commErr } = await supabase.rpc("launch_commercials", { _launch_id: l.id });
        if (commErr) throw commErr;
        const comm = (commRaw ?? {}) as {
          advance_amount?: number | null;
          payment_reference?: string | null;
          payment_screenshot_path?: string | null;
        };
        originalPlanId.current = l.plan_id;
        originalCustomPlanId.current = l.custom_plan_id ?? null;
        setLaunch((prev) => ({
          ...prev,
          id: l.id,
          plan_id: l.plan_id,
          custom_plan_id: l.custom_plan_id ?? null,
          addons: (l.addons as string[] | null) ?? [],
          crm_option: l.crm_option ?? "",
          meta_budget_daily: l.meta_budget_daily ? String(l.meta_budget_daily) : "",
          google_budget_daily: l.google_budget_daily ? String(l.google_budget_daily) : "",
          advance_amount: comm.advance_amount ? String(comm.advance_amount) : "",
          advance_received_at: l.advance_received_at ?? "",
          payment_reference: comm.payment_reference ?? "",
          payment_screenshot_path: comm.payment_screenshot_path ?? null,
          status: l.status,
          day0_date: l.day0_date,
          launch_date: l.launch_date,
        }));
        const { data: existing, error: asgErr } = await supabase
          .from("client_module_assignments")
          .select("module_code, primary_user_id, backup_user_id, client_contact_name, client_contact_phone")
          .eq("launch_id", l.id);
        if (asgErr) throw asgErr;
        const map: typeof assignments = {};
        for (const a of existing ?? []) {
          map[a.module_code] = {
            primary: a.primary_user_id ?? "",
            backup: a.backup_user_id ?? "",
            contact_name: a.client_contact_name ?? "",
            contact_phone: a.client_contact_phone ?? "",
          };
        }
        setAssignments(map);
      }
      setHydrate({ state: "ready" });
     } catch (err) {
      setHydrate({ state: "error", message: err instanceof Error ? err.message : "Could not load the saved draft" });
     }
    })();
  }, [clientId, launchIdParam, loaded]);

  const selectedPlan = plan.data?.find((p) => p.id === launch.plan_id) ?? null;
  const selectedCustomPlan = customPlanForLaunch;
  const modules = selectedPlan?.plan_modules ?? [];
  const isDiamond = selectedPlan?.code.startsWith("diamond_") ?? false;
  const isScale = selectedPlan?.code === "diamond_scale";
  const hideGoogle = selectedPlan?.code === "diamond_start";
  const needsNoc = selectedPlan?.day0_requires_noc ?? false;

  // Resolve the permanent roster names to active staff IDs used by the DB.
  // On a resumed draft, this replaces any earlier manual module allocation.
  useEffect(() => {
    if (!modules.length || !staff.data) return;
    setAssignments((current) => {
      let changed = false;
      const nextAssignments = { ...current };
      for (const module of modules) {
        const fixed = FIXED_MODULE_ASSIGNMENTS[module.module_code];
        if (!fixed) continue;
        const resolve = (name: string) => name
          ? staff.data!.find((person) => staffNameKey(person.full_name) === staffNameKey(name))?.id ?? ""
          : "";
        const primary = resolve(fixed.primary);
        const backup = resolve(fixed.backup);
        const existing = current[module.module_code] ?? { primary: "", backup: "", contact_name: "", contact_phone: "" };
        if (existing.primary !== primary || existing.backup !== backup) {
          nextAssignments[module.module_code] = { ...existing, primary, backup };
          changed = true;
        }
      }
      return changed ? nextAssignments : current;
    });
  }, [assignments, modules, staff.data]);

  const agmFile = useRef<File | null>(null);
  const nocFile = useRef<File | null>(null);

  async function uploadDraftFile(cid: string, prefix: string, file: File | null): Promise<string | null> {
    if (!file) return null;
    const path = `${cid}/${prefix}/${Date.now()}-${file.name.replace(/[^\w.-]+/g, "_")}`;
    const { error } = await supabase.storage.from("client-files").upload(path, file, { upsert: false });
    if (error) throw error;
    return path;
  }

  /** Create or update the client row; returns the client id and navigates so the URL carries it. */
  async function ensureClient(): Promise<string> {
    const payload = {
      hotel_name: basics.hotel_name.trim(),
      owner_name: basics.owner_name || null,
      email: basics.email || null,
      mobile: basics.mobile || null,
      whatsapp: basics.whatsapp || null,
      city: basics.city || null,
      state: basics.state || null,
      address: basics.address || null,
      number_of_rooms: basics.number_of_rooms ? Number(basics.number_of_rooms) : null,
      property_type: basics.property_type || null,
      website: basics.website || null,
      gst_number: basics.gstin || null,
      extra_fields: {
        legal_name: basics.legal_name || null,
        gm_name: basics.gm_name || null,
        res_contact_name: basics.res_contact_name || null,
        res_contact_phone: basics.res_contact_phone || null,
      },
    };
    if (clientId) {
      const { data: updated, error } = await supabase.from("clients").update(payload).eq("id", clientId).select("id");
      if (error) throw error;
      if (!updated?.length) throw new Error("Nothing was saved — you may not have permission to edit this hotel.");
      return clientId;
    }
    const { data, error } = await supabase
      .from("clients")
      .insert({ ...payload, status: "active", onboarding_status: "in_progress", bd_owner_id: user?.id ?? null })
      .select("id")
      .single();
    if (error) throw error;
    navigate({ to: "/clients/new", search: { clientId: data.id, step: 1 }, replace: true });
    return data.id;
  }

  async function saveLaunchDraft(cid: string): Promise<string> {
    if (launch.id) {
      const { error } = await supabase
        .from("client_launches")
        .update({
          plan_id: launch.plan_id as string,
          custom_plan_id: launch.custom_plan_id,
          ...(selectedCustomPlan?.monthly_retainer_inr != null ? { retainer_inr: selectedCustomPlan.monthly_retainer_inr } : {}),
          quarterly_fee_inr: plan.data?.find((x) => x.id === launch.plan_id)?.quarterly_fee_inr ?? null,
          addons: launch.addons,
          crm_option: launch.crm_option || null,
          meta_budget_daily: launch.meta_budget_daily ? Number(launch.meta_budget_daily) : null,
          google_budget_daily: launch.google_budget_daily ? Number(launch.google_budget_daily) : null,
        })
        .eq("id", launch.id);
      if (error) throw error;
      return launch.id;
    }
    const p = plan.data?.find((x) => x.id === launch.plan_id);
    const { data, error } = await supabase
      .from("client_launches")
      .insert({
        client_id: cid,
        plan_id: launch.plan_id as string,
        custom_plan_id: launch.custom_plan_id,
        ...(selectedCustomPlan?.monthly_retainer_inr != null ? { retainer_inr: selectedCustomPlan.monthly_retainer_inr } : {}),
        quarterly_fee_inr: p?.quarterly_fee_inr ?? null,
        addons: launch.addons,
        crm_option: launch.crm_option || null,
        meta_budget_daily: launch.meta_budget_daily ? Number(launch.meta_budget_daily) : null,
        google_budget_daily: launch.google_budget_daily ? Number(launch.google_budget_daily) : null,
        status: "draft",
        created_by: user?.id ?? null,
      })
      .select("id")
      .single();
    if (error) throw error;
    setLaunch((prev) => ({ ...prev, id: data.id, status: "draft" }));
    return data.id;
  }

  function next() {
    setStep((s) => Math.min(STEPS.length - 1, s + 1));
  }

  async function saveBasics() {
    const requiredBasics: Array<[string, string]> = [
      ["Hotel / brand name", basics.hotel_name],
      ["Legal entity name", basics.legal_name],
      ["Owner name", basics.owner_name],
      ["General Manager name", basics.gm_name],
      ["Reservations contact name", basics.res_contact_name],
      ["Reservations phone", basics.res_contact_phone],
      ["Owner email", basics.email],
      ["Mobile / WhatsApp", basics.mobile],
      ["WhatsApp", basics.whatsapp],
      ["City", basics.city],
      ["State", basics.state],
      ["Address", basics.address],
      ["Number of rooms", basics.number_of_rooms],
      ["Property type", basics.property_type],
      ["Website", basics.website],
      ["GSTIN", basics.gstin],
    ];
    const missingBasics = requiredBasics.find(([, value]) => !value.trim());
    if (missingBasics) {
      toast.error(`${missingBasics[0]} is required`);
      return;
    }
    if (Number(basics.number_of_rooms) < 1) {
      toast.error("Number of rooms must be at least 1");
      return;
    }
    if (!/^\S+@\S+\.\S+$/.test(basics.email.trim())) {
      toast.error("Enter the owner's email — it creates their portal login");
      return;
    }
    setSaving(true);
    try {
      if (!clientId) {
        const { data: matches, error: dupError } = await supabase.rpc("find_client_duplicates", {
          _name: basics.hotel_name,
          _phone: basics.mobile,
          _email: basics.email,
          _website: basics.website,
          _city: basics.city,
          _address: basics.address,
          _gstin: basics.gstin,
        });
        if (dupError) throw dupError;
        if ((matches as unknown as DuplicateMatch[] | null)?.length) {
          setDuplicates(matches as unknown as DuplicateMatch[]);
          setConfirmNew(false);
          return;
        }
      }
      await ensureClient();
      toast.success("Basics saved");
      next();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not save");
    } finally {
      setSaving(false);
    }
  }

  async function proceedAsNew() {
    if (!isManager || !confirmNew) return;
    setSaving(true);
    try {
      await ensureClient();
      setDuplicates(null);
      toast.success("Basics saved");
      next();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not save");
    } finally {
      setSaving(false);
    }
  }

  async function savePlan() {
    if (!launch.plan_id) {
      toast.error("Choose a plan");
      return;
    }
    // Day 0 already confirmed on this launch: a plan change must go through the
    // database (management only), which resets the launch to a draft.
    if (launch.id && launch.status !== "draft" && (launch.plan_id !== originalPlanId.current || launch.custom_plan_id !== originalCustomPlanId.current)) {
      if (!isManager) {
        toast.error("Day 0 is already confirmed — ask management to change this plan.");
        return;
      }
      if (launch.custom_plan_id !== originalCustomPlanId.current) {
        toast.error("A custom plan cannot be swapped on a confirmed launch from onboarding. Use the approved contract change workflow.");
        return;
      }
      setPlanChangeOpen(true);
      return;
    }
    setSaving(true);
    try {
      const cid = await ensureClient();
      await saveLaunchDraft(cid);
      const isNewPendingCustomPlan = !!launch.custom_plan_id
        && launch.custom_plan_id !== originalCustomPlanId.current
        && customPlanForLaunch?.approval_status === "pending";
      originalCustomPlanId.current = launch.custom_plan_id;
      if (isNewPendingCustomPlan) {
        const { data: approvers, error: approversError } = await supabase
          .from("user_roles")
          .select("user_id, role")
          .in("role", ["admin", "management"]);
        if (approversError) {
          toast.error("Plan saved, but approval notifications could not be sent.");
        } else {
          const approverIds = [...new Set((approvers ?? []).map((row) => row.user_id))];
          if (approverIds.length) {
            const { error: notificationError } = await supabase.from("notifications").insert(approverIds.map((userId) => ({
              user_id: userId,
              title: "Custom client plan needs approval",
              body: `${basics.hotel_name || "A new client"} · ${customPlanForLaunch?.name ?? "Custom plan"} is waiting for your approval.`,
              link: "/plans",
              kind: "plan_approval",
            })));
            if (notificationError) toast.error("Plan saved, but approval notifications could not be sent.");
          }
        }
      }
      toast.success("Plan saved");
      next();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not save");
    } finally {
      setSaving(false);
    }
  }

  async function confirmPlanChange() {
    const planCode = plan.data?.find((p) => p.id === launch.plan_id)?.code;
    if (!launch.id || !planCode) return;
    if (!planChangeReason.trim()) {
      toast.error("Give a reason for the plan change");
      return;
    }
    setSaving(true);
    try {
      const { data: sameId, error } = await supabase.rpc("change_plan", {
        _launch_id: launch.id,
        _plan_code: planCode,
        _reason: planChangeReason.trim(),
      });
      if (error) throw error;
      const { data: fresh, error: fe } = await supabase
        .from("client_launches")
        .select("id, plan_id, status, day0_date, launch_date")
        .eq("id", sameId as string)
        .single();
      if (fe) throw fe;
      setLaunch((prev) => ({
        ...prev,
        id: fresh!.id,
        plan_id: fresh!.plan_id,
        status: fresh!.status,
        day0_date: fresh!.day0_date,
        launch_date: fresh!.launch_date,
      }));
      originalPlanId.current = fresh!.plan_id;
      toast.success("Plan changed — confirm Day 0 again for the new plan");
      setPlanChangeOpen(false);
      setPlanChangeReason("");
      qc.invalidateQueries({ queryKey: ["launch-drafts"] });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not change the plan");
    } finally {
      setSaving(false);
    }
  }

  async function confirmDay0() {
    if (!clientId) return false;
    const cid: string = clientId;
    if (!launch.id || !cid) return false;
    if (!day0Choice) {
      toast.error("Choose the Day 0 date");
      return false;
    }
    if (day0Choice > todayIST()) {
      toast.error("Day 0 cannot be in the future");
      return false;
    }
    // QA-06: check the Day 0 checklist before uploading anything, so a failed attempt leaves no stray rows.
    const docs = wizardDocs.data ?? [];
    const hasAgreement = !!agmFile.current || docs.some((d) => d.doc_type === "Agreement Copy");
    const hasNoc = !needsNoc || !!nocFile.current || docs.some((d) => d.doc_type === "NOC — No Objection Certificate");
    const day0Missing = [
      !hasAgreement && "signed agreement",
      !hasNoc && "NOC",
      !launch.advance_received_at && "advance received date",
      !launch.payment_reference.trim() && "payment UTR/reference",
    ].filter(Boolean);
    if (day0Missing.length) {
      toast.error(`Before Day 0, add: ${day0Missing.join(", ")}`);
      return false;
    }
    setSaving(true);
    try {
      // Every upload is a NEW documents row — old agreements are kept so an
      // upgrade can require a fresh signature after the launch started.
      async function saveDoc(docType: string, path: string) {
        const { error } = await supabase.from("documents").insert({
          client_id: cid,
          doc_type: docType,
          category: "signed",
          mandatory: true,
          status: "uploaded",
          file_path: path,
          uploaded_by: user?.id ?? null,
        });
        if (error) throw error;
      }
      // Each agreement/NOC is uploaded and recorded once; a retry never duplicates it.
      const agreementPath = await uploadDraftFile(cid, "agreement", agmFile.current);
      if (agreementPath) { await saveDoc("Agreement Copy", agreementPath); agmFile.current = null; }
      if (needsNoc && nocFile.current) {
        const nocPath = await uploadDraftFile(cid, "noc", nocFile.current);
        if (nocPath) { await saveDoc("NOC — No Objection Certificate", nocPath); nocFile.current = null; }
      }
      void qc.invalidateQueries({ queryKey: ["wizard-docs", cid] });
      const payErr = await supabase
        .from("client_launches")
        .update({
          advance_amount: launch.advance_amount ? Number(launch.advance_amount) : null,
          advance_received_at: launch.advance_received_at || null,
          payment_reference: launch.payment_reference.trim() || null,
        })
        .eq("id", launch.id);
      if (payErr.error) throw payErr.error;

      const { error } = await supabase.rpc("confirm_day0", {
        _launch_id: launch.id,
        _day0: day0Choice,
      });
      if (error) throw error;

      const { data: fresh } = await supabase
        .from("client_launches")
        .select("day0_date, launch_date")
        .eq("id", launch.id)
        .single();
      setLaunch((prev) => ({
        ...prev,
        day0_date: fresh?.day0_date ?? prev.day0_date,
        launch_date: fresh?.launch_date ?? prev.launch_date,
      }));
      qc.invalidateQueries({ queryKey: ["wizard-docs", cid] });
      toast.success(`Day 0: ${fresh?.day0_date ?? "saved"} · Go-live: ${fresh?.launch_date ?? "scheduled"}`);
      try {
        const res = await ensureClientLogin({ data: { client_id: cid, origin: window.location.origin } });
        toast.success(
          res.status === "invited" ? `Owner login sent to ${res.email}` : `Owner login already active for ${res.email}`,
        );
      } catch (le) {
        toast.error(le instanceof Error ? le.message : "Could not send the owner login");
      }
      qc.invalidateQueries({ queryKey: ["launch-drafts"] });
      next();
      return true;
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not confirm Day 0");
      return false;
    } finally {
      setSaving(false);
    }
  }

  async function viewFile(path: string) {
    const { data, error } = await supabase.storage.from("client-files").createSignedUrl(path, 300);
    if (error || !data) {
      toast.error("Could not open the file");
      return;
    }
    window.open(data.signedUrl, "_blank", "noopener");
  }

  async function activate() {
    const launchId = launch.id;
    if (!launchId || !clientId) return false;
    setSaving(true);
    try {
      const rows = modules.map((m) => {
        const a = assignments[m.module_code] ?? { primary: "", backup: "", contact_name: "", contact_phone: "" };
        return {
          launch_id: launchId,
          client_id: clientId,
          module_code: m.module_code,
          primary_user_id: a.primary || null,
          backup_user_id: a.backup || null,
          client_contact_name: a.contact_name || null,
          client_contact_phone: a.contact_phone || null,
        };
      });
      const { error: upErr } = await supabase
        .from("client_module_assignments")
        .upsert(rows, { onConflict: "launch_id,module_code" });
      if (upErr) throw upErr;

      const { error } = await supabase.rpc("activate_client_launch", { _launch_id: launchId });
      if (error) throw error;
      const { count } = await supabase
        .from("client_tasks")
        .select("id", { count: "exact", head: true })
        .eq("launch_id", launchId);
      toast.success(`${count ?? 0} tasks created`);
      qc.invalidateQueries();
      navigate({ to: "/launches/$launchId", params: { launchId: launchId as string } });
      return true;
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not activate launch");
      return false;
    } finally {
      setSaving(false);
    }
  }

  const allPrimaries = modules.every((m) => assignments[m.module_code]?.primary);
  const resContactMissing = modules.some(
    (m) => m.launch_modules?.client_side && !(assignments[m.module_code]?.contact_name ?? "").trim(),
  );

  if (clientId && hydrate.state === "error") {
    return <p role="alert" className="text-sm text-destructive">The saved draft couldn't be loaded: {hydrate.message}. Reload the page to try again — nothing has been changed.</p>;
  }
  if (clientId && hydrate.state !== "ready") {
    return <p className="text-sm text-muted-foreground">Loading the saved draft…</p>;
  }
  return (
    <div className="space-y-6">
      <PageHeader
        title="Onboard a hotel"
        description={
          clientId
            ? "Draft in progress — the link in your address bar resumes exactly where you stopped."
            : "Four steps: basics, plan, Day 0 and team. A draft is saved at every step."
        }
      />

      <ol className="flex flex-wrap gap-2">
        {STEPS.map((s, i) => (
          <li key={s}>
            <button
              onClick={() => (i < step ? setStep(i) : undefined)}
              className={cn(
                "flex items-center gap-2 rounded-full border px-3.5 py-1.5 text-xs transition-colors",
                i === step
                  ? "border-primary bg-primary text-primary-foreground"
                  : i < step
                    ? "border-success/40 bg-success/10 text-success"
                    : "border-border text-muted-foreground",
              )}
            >
              {i < step ? <Check className="h-3 w-3" /> : <span>{i + 1}</span>}
              {s}
            </button>
          </li>
        ))}
      </ol>

      <div className="card-surface p-6">
        {step === 0 ? (
          <div className="space-y-5">
            <p className="text-section-title font-semibold">Hotel basics</p>
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Hotel / brand name" required>
                <Input required value={basics.hotel_name} onChange={(e) => setBasics({ ...basics, hotel_name: e.target.value })} placeholder="The Palm Springs Resort" />
              </Field>
              <Field label="Legal entity name" required>
                <Input required value={basics.legal_name} onChange={(e) => setBasics({ ...basics, legal_name: e.target.value })} placeholder="Palm Springs Hospitality Pvt Ltd" />
              </Field>
              <Field label="Owner name" required>
                <Input required value={basics.owner_name} onChange={(e) => setBasics({ ...basics, owner_name: e.target.value })} />
              </Field>
              <Field label="General Manager name" required>
                <Input required value={basics.gm_name} onChange={(e) => setBasics({ ...basics, gm_name: e.target.value })} />
              </Field>
              <Field label="Reservations contact name" required>
                <Input required value={basics.res_contact_name} onChange={(e) => setBasics({ ...basics, res_contact_name: e.target.value })} />
              </Field>
              <Field label="Reservations phone" required>
                <Input required value={basics.res_contact_phone} onChange={(e) => setBasics({ ...basics, res_contact_phone: e.target.value })} type="tel" />
              </Field>
              <Field label="Owner email (creates their portal login)" required>
                <Input required value={basics.email} onChange={(e) => setBasics({ ...basics, email: e.target.value })} type="email" />
              </Field>
              <Field label="Mobile / WhatsApp" required>
                <Input required value={basics.mobile} onChange={(e) => setBasics({ ...basics, mobile: e.target.value })} type="tel" />
              </Field>
              <Field label="WhatsApp (if different)" required>
                <Input required value={basics.whatsapp} onChange={(e) => setBasics({ ...basics, whatsapp: e.target.value })} type="tel" />
              </Field>
              <Field label="City" required>
                <Input required value={basics.city} onChange={(e) => setBasics({ ...basics, city: e.target.value })} />
              </Field>
              <Field label="State" required>
                <Input required value={basics.state} onChange={(e) => setBasics({ ...basics, state: e.target.value })} />
              </Field>
              <Field label="Address" required>
                <Input required value={basics.address} onChange={(e) => setBasics({ ...basics, address: e.target.value })} />
              </Field>
              <Field label="Number of rooms" required>
                <Input required value={basics.number_of_rooms} onChange={(e) => setBasics({ ...basics, number_of_rooms: e.target.value })} type="number" min="1" />
              </Field>
              <Field label="Property type" required>
                <Select value={basics.property_type} onValueChange={(v) => setBasics({ ...basics, property_type: v })}>
                  <SelectTrigger aria-required="true"><SelectValue placeholder="Select type" /></SelectTrigger>
                  <SelectContent>
                    {PROPERTY_TYPES.map((t) => (
                      <SelectItem key={t} value={t}>{t}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </Field>
              <Field label="Website" required>
                <Input required value={basics.website} onChange={(e) => setBasics({ ...basics, website: e.target.value })} placeholder="https://" />
              </Field>
              <Field label="GSTIN" required>
                <Input required value={basics.gstin} onChange={(e) => setBasics({ ...basics, gstin: e.target.value })} placeholder="22AAAAA0000A1Z5" />
              </Field>
            </div>
            <div className="flex justify-end">
              <Button onClick={saveBasics} disabled={saving}>
                {saving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                Save & continue <ChevronRight className="ml-2 h-4 w-4" />
              </Button>
            </div>
          </div>
        ) : null}

        {step === 1 ? (
          <div className="space-y-5">
            <p className="text-section-title font-semibold">Choose the plan</p>
            {plan.isLoading ? <p className="text-sm text-muted-foreground">Loading plans…</p> : null}
            <div className="grid gap-4 md:grid-cols-2">
              {(plan.data ?? []).map((p) => {
                const active = p.id === launch.plan_id && !launch.custom_plan_id;
                return (
                  <button
                    key={p.id}
                    type="button"
                    onClick={() => setLaunch({ ...launch, plan_id: p.id, custom_plan_id: null })}
                    className={cn(
                      "rounded-xl border p-5 text-left transition-colors",
                      active ? "border-primary bg-primary/5" : "border-border hover:border-primary/40",
                    )}
                  >
                    <p className="text-card-title font-semibold">{p.name}</p>
                    <p className="mt-1 text-sm">
                      {inr(p.fee_inr)} <span className="text-muted-foreground">/ {p.billing_period?.startsWith("quarter") ? "quarter" : "month"}</span>
                      {p.duration_weeks ? <span className="text-muted-foreground"> · {p.duration_weeks}-week launch</span> : null}
                    </p>
                    <p className="mt-2 text-xs text-muted-foreground">
                      {(p.plan_modules ?? []).map((module) => module.launch_modules?.name).filter(Boolean).join(" · ")}
                    </p>
                  </button>
                );
              })}
            </div>
            <div className="flex flex-col gap-4 rounded-xl border border-dashed p-5 sm:flex-row sm:items-center sm:justify-between">
              <div>
                {customPlanForLaunch ? (
                  <>
                    <p className="font-semibold">{customPlanForLaunch.name}</p>
                    <p className="mt-1 text-sm text-muted-foreground">
                      {inr(customPlanForLaunch.monthly_retainer_inr)} / {customPlanForLaunch.payment_cycle}
                      {customPlanForLaunch.setup_fee_inr != null ? ` · setup ${inr(customPlanForLaunch.setup_fee_inr)}` : ""}
                    </p>
                    {customPlanForLaunch.approval_status !== "approved" ? <p className="mt-1 text-xs text-warning">Pending management approval before activation.</p> : null}
                  </>
                ) : (
                  <>
                    <p className="font-medium">Need a different package?</p>
                    <p className="mt-1 text-sm text-muted-foreground">Create a client-specific plan from the Plans page template.</p>
                  </>
                )}
              </div>
              <Button type="button" onClick={openCustomPlanBuilder} disabled={plan.isLoading || planVersions.isLoading || !planVersions.data?.length || saving}>
                <Plus className="mr-2 h-4 w-4" /> New custom plan
              </Button>
            </div>
            {planVersions.isLoading ? <p className="text-sm text-muted-foreground">Loading active base plan templates…</p> : null}
            {planVersions.error ? <p role="alert" className="text-sm text-destructive">Could not load base plan templates: {planVersions.error.message}</p> : null}

            {isDiamond ? (
              <div className="space-y-4 rounded-lg border border-border p-4">
                <p className="text-sm font-medium">Add-ons</p>
                {ADDONS.map((a) => (
                  <label key={a.key} className="flex items-center gap-3 text-sm">
                    <Checkbox
                      checked={launch.addons.includes(a.key)}
                      onCheckedChange={(v) =>
                        setLaunch({
                          ...launch,
                          addons: v ? [...launch.addons, a.key] : launch.addons.filter((x) => x !== a.key),
                        })
                      }
                    />
                    {a.label}
                  </label>
                ))}
                <div className="grid gap-4 sm:grid-cols-2">
                  <Field label="CRM">
                    <Select value={launch.crm_option} onValueChange={(v) => setLaunch({ ...launch, crm_option: v })}>
                      <SelectTrigger><SelectValue placeholder="Select CRM" /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="neodove">Neodove</SelectItem>
                        <SelectItem value="superfone">Superfone</SelectItem>
                        {isScale ? <SelectItem value="alcor_shared">Alcor shared CRM</SelectItem> : null}
                      </SelectContent>
                    </Select>
                  </Field>
                  <Field label="Meta ads budget (₹ / day)">
                    <Input type="number" min="0" value={launch.meta_budget_daily} onChange={(e) => setLaunch({ ...launch, meta_budget_daily: e.target.value })} />
                  </Field>
                  {!hideGoogle ? (
                    <Field label="Google ads budget (₹ / day)">
                      <Input type="number" min="0" value={launch.google_budget_daily} onChange={(e) => setLaunch({ ...launch, google_budget_daily: e.target.value })} />
                    </Field>
                  ) : null}
                </div>
              </div>
            ) : null}

            <div className="flex justify-end">
              <Button onClick={savePlan} disabled={saving || !launch.plan_id || (!!launch.custom_plan_id && existingCustomPlan.isLoading)}>
                {saving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                Save & continue <ChevronRight className="ml-2 h-4 w-4" />
              </Button>
            </div>
          </div>
        ) : null}

        {step === 2 ? (
          <div className="space-y-5">
            <p className="text-section-title font-semibold">Day 0 — agreement & advance</p>
            {launch.day0_date ? (
              <div className="rounded-lg border border-success/40 bg-success/10 p-4 text-sm">
                Day 0: {launch.day0_date} · Go-live: {launch.launch_date ?? "—"} — files and payment can still be updated below.
              </div>
            ) : null}
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Day 0 date" required>
                <Input
                  type="date"
                  max={todayIST()}
                  value={day0Choice}
                  onChange={(e) => setDay0Choice(e.target.value)}
                />
                {day0Choice && day0Choice < warnCutoff ? (
                  <p className="text-xs text-warning-foreground">
                    This date is more than 7 days ago — double-check it before confirming.
                  </p>
                ) : null}
              </Field>
              <FileField
                label={`Signed agreement (required)`}
                fileRef={agmFile}
                onPick={(v) => setPicked((p) => ({ ...p, agm: v }))}
              />
              {needsNoc ? <FileField label="NOC — No Objection Certificate (required)" fileRef={nocFile} onPick={(v) => setPicked((p) => ({ ...p, noc: v }))} /> : null}
              <Field label="Advance amount (₹)">
                <Input type="number" min="0" value={launch.advance_amount} onChange={(e) => setLaunch({ ...launch, advance_amount: e.target.value })} />
              </Field>
              <Field label="Advance received on">
                <Input type="date" value={launch.advance_received_at} onChange={(e) => setLaunch({ ...launch, advance_received_at: e.target.value })} />
              </Field>
              <Field label="Payment reference / UTR" required>
                <Input required value={launch.payment_reference} onChange={(e) => setLaunch({ ...launch, payment_reference: e.target.value })} />
              </Field>
            </div>

            {wizardDocs.data?.length || launch.payment_screenshot_path ? (
              <div className="rounded-lg border border-border p-3 text-sm">
                <p className="text-label-muted">Already uploaded</p>
                <ul className="mt-2 space-y-1">
                  {wizardDocs.data?.map((d) => (
                    <li key={d.id} className="flex items-center justify-between gap-2">
                      <span>{d.doc_type}</span>
                      {d.file_path ? (
                        <Button variant="ghost" size="sm" className="h-7 px-2 text-xs" onClick={() => viewFile(d.file_path!)}>
                          View
                        </Button>
                      ) : null}
                    </li>
                  ))}
                  {launch.payment_screenshot_path ? (
                    <li className="flex items-center justify-between gap-2">
                      <span>Existing payment screenshot (view only)</span>
                      <Button variant="ghost" size="sm" className="h-7 px-2 text-xs" onClick={() => viewFile(launch.payment_screenshot_path!)}>
                        View
                      </Button>
                    </li>
                  ) : null}
                </ul>
                {launch.payment_screenshot_path ? <p className="mt-1.5 text-label text-muted-foreground">Existing payment evidence is retained for reference; new Day 0 records require a UTR/reference.</p> : null}
              </div>
            ) : null}

            {(() => {
              const items = day0Checklist({
                hasAgreement: picked.agm || !!wizardDocs.data?.some((d) => d.doc_type.startsWith("Agreement")),
                needsNoc,
                hasNoc: picked.noc || !!wizardDocs.data?.some((d) => d.doc_type.startsWith("NOC")),
                advanceAmount: launch.advance_amount,
                advanceDate: launch.advance_received_at,
                reference: launch.payment_reference,
              });
              const missing = items.filter((i) => !i.ok);
              return (
                <div className={cn("rounded-lg border p-4 text-sm", missing.length ? "border-warning/50 bg-warning/10" : "border-success/40 bg-success/10")}>
                  <p className="font-medium">{missing.length ? "Day 0 can be set only when all of these are in place:" : "Everything needed for Day 0 is in place."}</p>
                  <ul className="mt-2 space-y-1">
                    {items.map((i) => (
                      <li key={i.label} className="flex items-center gap-2">
                        {i.ok ? <Check className="h-4 w-4 text-success" /> : <span className="inline-block h-4 w-4 rounded-full border border-warning" />}
                        <span className={i.ok ? "" : "font-medium"}>{i.label}{i.ok ? "" : " — missing"}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              );
            })()}
            <div className="flex justify-end">
              <ConfirmButton onConfirm={confirmDay0} doneLabel="Confirmed" disabled={saving || !launch.id}>
                {saving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                Confirm Day 0</ConfirmButton>
            </div>
          </div>
        ) : null}

        {step === 3 ? (
          <div className="space-y-5">
            <p className="text-section-title font-semibold">Launch team</p>
            <p className="text-sm text-muted-foreground">Primary and backup owners are fixed from your allocation list. A missing staff profile must be activated before this launch can proceed.</p>
            <DataTable<(typeof modules)[number]>
              className="rounded-none border-0 bg-transparent shadow-none"
              rows={modules}
              rowKey={(m) => m.module_code}
              emptyMessage="This plan has no modules."
              columns={[
                {
                  key: "module",
                  header: "Module",
                  render: (m) => <span className="font-medium">{m.launch_modules?.name ?? m.module_code}</span>,
                },
                {
                  key: "window",
                  header: "Window",
                  render: (m) => <span className="text-muted-foreground">{m.window_label ?? "—"}</span>,
                },
                {
                  key: "primary",
                  header: "Primary",
                  render: (m) => {
                    const a = assignments[m.module_code] ?? { primary: "", backup: "", contact_name: "", contact_phone: "" };
                    const fixed = FIXED_MODULE_ASSIGNMENTS[m.module_code];
                    const selected = (staff.data ?? []).find((s) => s.id === a.primary);
                    return <span className={selected ? "font-medium" : "text-destructive"}>
                      {selected?.full_name ?? (fixed ? `Missing staff: ${fixed.primary}` : "No fixed assignment")}
                    </span>;
                  },
                },
                {
                  key: "backup",
                  header: "Backup",
                  render: (m) => {
                    const a = assignments[m.module_code] ?? { primary: "", backup: "", contact_name: "", contact_phone: "" };
                    const fixed = FIXED_MODULE_ASSIGNMENTS[m.module_code];
                    const selected = (staff.data ?? []).find((s) => s.id === a.backup);
                    return <span className={a.backup ? "font-medium" : "text-muted-foreground"}>
                      {a.backup ? selected?.full_name ?? `Missing staff: ${fixed?.backup ?? ""}` : "—"}
                    </span>;
                  },
                },
                {
                  key: "contact",
                  header: "Hotel contact",
                  render: (m) => {
                    const a = assignments[m.module_code] ?? { primary: "", backup: "", contact_name: "", contact_phone: "" };
                    return m.launch_modules?.client_side ? (
                      <div className="flex gap-1.5">
                        <Input className="h-8 w-28" placeholder="Name" value={a.contact_name} onChange={(e) => setAssignments({ ...assignments, [m.module_code]: { ...a, contact_name: e.target.value } })} />
                        <Input className="h-8 w-32" placeholder="Phone" value={a.contact_phone} onChange={(e) => setAssignments({ ...assignments, [m.module_code]: { ...a, contact_phone: e.target.value } })} />
                      </div>
                    ) : (
                      <span className="text-muted-foreground">—</span>
                    );
                  },
                },
              ]}
            />
            <div className="flex items-center justify-end gap-3">
              {!allPrimaries ? <p className="text-xs text-muted-foreground">Assign a primary to every module to activate.</p> : null}
              {allPrimaries && resContactMissing ? (
                <p className="text-xs text-muted-foreground">Enter the hotel contact name for the reservations desk module.</p>
              ) : null}
              <ConfirmButton onConfirm={activate} doneLabel="Activated" disabled={saving || !allPrimaries || resContactMissing || !launch.id}>
                {saving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                Activate launch</ConfirmButton>
            </div>
          </div>
        ) : null}
      </div>

      <div className="flex justify-between">
        <Button variant="outline" onClick={() => setStep((s) => Math.max(0, s - 1))} disabled={step === 0}>
          <ChevronLeft className="mr-2 h-4 w-4" /> Back
        </Button>
      </div>

      <Dialog open={customPlanDialogOpen} onOpenChange={setCustomPlanDialogOpen}>
        <DialogContent className="max-h-[90vh] max-w-3xl overflow-y-auto">
          <DialogHeader>
            <DialogTitle>New custom plan</DialogTitle>
            <DialogDescription>Build this client’s plan from an active standard plan template. The saved plan will be attached to this onboarding.</DialogDescription>
          </DialogHeader>
          {customPlanDraft ? (
            <div className="space-y-6">
              <div className="grid gap-4 sm:grid-cols-2">
                <Field label="Plan name" required>
                  <Input value={customPlanDraft.name} onChange={(event) => setCustomPlanDraft({ ...customPlanDraft, name: event.target.value })} placeholder="e.g. Hotel name — custom plan" />
                </Field>
                <Field label="Base plan">
                  <Select value={customPlanDraft.base_plan_version_id} onValueChange={changeCustomPlanBase}>
                    <SelectTrigger><SelectValue placeholder="Choose a base plan" /></SelectTrigger>
                    <SelectContent>
                      {[...(planVersions.data ?? [])]
                        .sort((a, b) => (plan.data?.find((item) => item.id === a.plan_id)?.sort_order ?? 99) - (plan.data?.find((item) => item.id === b.plan_id)?.sort_order ?? 99) || b.version - a.version)
                        .map((version) => <SelectItem key={version.id} value={version.id}>{version.name} (v{version.version})</SelectItem>)}
                    </SelectContent>
                  </Select>
                </Field>
                <Field label="Monthly retainer (₹, GST extra)">
                  <Input type="number" min="0" value={customPlanDraft.monthly_retainer_inr} onChange={(event) => setCustomPlanDraft({ ...customPlanDraft, monthly_retainer_inr: event.target.value })} />
                </Field>
                <Field label="Setup fee (₹, one-time)">
                  <Input type="number" min="0" value={customPlanDraft.setup_fee_inr} onChange={(event) => setCustomPlanDraft({ ...customPlanDraft, setup_fee_inr: event.target.value })} />
                </Field>
              </div>

              <div>
                <Label>Commission % of Alcor-generated revenue, by channel</Label>
                <div className="mt-1.5 grid gap-3 sm:grid-cols-4">
                  {COMMISSION_FIELDS.map(({ key, label }) => (
                    <Field key={key} label={label}>
                      <Input type="number" min="0" value={customPlanDraft[key]} onChange={(event) => setCustomPlanDraft({ ...customPlanDraft, [key]: event.target.value })} placeholder="Not specified" />
                    </Field>
                  ))}
                </div>
              </div>

              <div>
                <Label>Add-ons</Label>
                <div className="mt-1.5 flex flex-wrap gap-4">
                  {(addons.data ?? []).map((addon) => (
                    <label key={addon.id} className="flex items-center gap-2 text-sm">
                      <Checkbox
                        checked={customPlanDraft.addon_ids.includes(addon.id)}
                        onCheckedChange={(checked) => setCustomPlanDraft({
                          ...customPlanDraft,
                          addon_ids: checked ? [...customPlanDraft.addon_ids, addon.id] : customPlanDraft.addon_ids.filter((id) => id !== addon.id),
                        })}
                      />
                      {addon.name}{addon.price_inr ? ` (${inr(addon.price_inr)}${addon.price_type === "from" ? "+" : ""})` : " (vendor-priced)"}
                    </label>
                  ))}
                </div>
              </div>

              <div className="grid gap-4 sm:grid-cols-2">
                <Field label="Contract start"><Input type="date" value={customPlanDraft.contract_start} onChange={(event) => setCustomPlanDraft({ ...customPlanDraft, contract_start: event.target.value })} /></Field>
                <Field label="Contract end"><Input type="date" value={customPlanDraft.contract_end} onChange={(event) => setCustomPlanDraft({ ...customPlanDraft, contract_end: event.target.value })} /></Field>
                <Field label="Payment cycle">
                  <Select value={customPlanDraft.payment_cycle} onValueChange={(value) => setCustomPlanDraft({ ...customPlanDraft, payment_cycle: value })}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>{["monthly", "quarterly", "annual", "milestone"].map((cycle) => <SelectItem key={cycle} value={cycle}>{cycle}</SelectItem>)}</SelectContent>
                  </Select>
                </Field>
                <Field label="Notice days"><Input type="number" min="0" value={customPlanDraft.notice_days} onChange={(event) => setCustomPlanDraft({ ...customPlanDraft, notice_days: event.target.value })} /></Field>
              </div>
              <Field label="Termination terms">
                <Textarea value={customPlanDraft.termination_terms} onChange={(event) => setCustomPlanDraft({ ...customPlanDraft, termination_terms: event.target.value })} placeholder="Leave blank to keep the base plan’s standard terms" />
              </Field>

              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <Label>Services</Label>
                  <Button type="button" size="sm" variant="outline" onClick={() => setCustomPlanDraft({
                    ...customPlanDraft,
                    services: [...customPlanDraft.services, { service_name: "", scope: "", frequency: "monthly", pipeline_code: "", included: true, fromBase: false }],
                  })}>
                    <Plus className="mr-1.5 h-3.5 w-3.5" /> Add service
                  </Button>
                </div>
                <div className="space-y-2">
                  {customPlanDraft.services.map((service, index) => (
                    <div key={index} className="flex flex-wrap items-center gap-2 rounded-lg border border-border/60 p-2">
                      <Checkbox
                        checked={service.included}
                        onCheckedChange={(checked) => setCustomPlanDraft({
                          ...customPlanDraft,
                          services: customPlanDraft.services.map((item, itemIndex) => itemIndex === index ? { ...item, included: checked === true } : item),
                        })}
                        aria-label={`Include ${service.service_name || "service"}`}
                      />
                      {service.fromBase ? (
                        <span className={cn("min-w-40 flex-1 text-sm font-medium", !service.included && "line-through opacity-60")}>{service.service_name}</span>
                      ) : (
                        <Input className="min-w-40 flex-1" placeholder="Service name" value={service.service_name} onChange={(event) => setCustomPlanDraft({
                          ...customPlanDraft,
                          services: customPlanDraft.services.map((item, itemIndex) => itemIndex === index ? { ...item, service_name: event.target.value } : item),
                        })} />
                      )}
                      <Input className="w-36" placeholder="Scope" value={service.scope} onChange={(event) => setCustomPlanDraft({
                        ...customPlanDraft,
                        services: customPlanDraft.services.map((item, itemIndex) => itemIndex === index ? { ...item, scope: event.target.value } : item),
                      })} />
                      <Input className="w-32" placeholder="Frequency" value={service.frequency} onChange={(event) => setCustomPlanDraft({
                        ...customPlanDraft,
                        services: customPlanDraft.services.map((item, itemIndex) => itemIndex === index ? { ...item, frequency: event.target.value } : item),
                      })} />
                      <Input className="w-32" placeholder="Pipeline code" value={service.pipeline_code} onChange={(event) => setCustomPlanDraft({
                        ...customPlanDraft,
                        services: customPlanDraft.services.map((item, itemIndex) => itemIndex === index ? { ...item, pipeline_code: event.target.value } : item),
                      })} />
                      {!service.fromBase ? <Button type="button" size="sm" variant="ghost" aria-label="Remove service" onClick={() => setCustomPlanDraft({
                        ...customPlanDraft,
                        services: customPlanDraft.services.filter((_, itemIndex) => itemIndex !== index),
                      })}><X className="h-3.5 w-3.5" /></Button> : null}
                    </div>
                  ))}
                </div>
                <p className="text-xs text-muted-foreground">Untick a base service to remove it from this custom plan.</p>
              </div>
              <p className="rounded-lg border border-warning/40 bg-warning/10 p-3 text-sm text-warning-foreground">
                Changes from the base plan may require management approval before activation.
              </p>
            </div>
          ) : null}
          <DialogFooter>
            <Button variant="outline" onClick={() => setCustomPlanDialogOpen(false)}>Cancel</Button>
            <Button onClick={saveNewCustomPlan} disabled={saving || !customPlanDraft?.name.trim() || !customPlanDraft?.base_plan_version_id}>
              {saving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}Save custom plan
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={planChangeOpen} onOpenChange={(o) => (!o ? setPlanChangeOpen(false) : undefined)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="text-card-title font-semibold">Change the plan</DialogTitle>
            <DialogDescription>
              Day 0 was already confirmed on this launch. Changing the plan resets it to a draft — the new plan's
              agreement{needsNoc ? " and NOC" : ""} must be uploaded fresh at Day 0.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3 text-sm">
            <p>
              New plan: <span className="font-medium">{plan.data?.find((p) => p.id === launch.plan_id)?.name}</span>
            </p>
            <div className="space-y-1.5">
              <Label>Reason (required)</Label>
              <Textarea rows={2} value={planChangeReason} onChange={(e) => setPlanChangeReason(e.target.value)} />
            </div>
            <Button onClick={confirmPlanChange} disabled={saving} className="w-full">
              {saving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}Change plan & reset to draft
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={duplicates !== null} onOpenChange={(o) => (!o ? setDuplicates(null) : undefined)}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle className="text-card-title font-semibold">Possible duplicate hotel</DialogTitle>
            <DialogDescription>
              These existing clients match what you entered. Open one, start a new launch on it, or
              proceed with a brand-new record.
            </DialogDescription>
          </DialogHeader>
          <ul className="max-h-72 space-y-3 overflow-y-auto">
            {(duplicates ?? []).map((d) => (
              <li key={d.client_id} className="rounded-lg border border-border/70 p-3 text-sm">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div>
                    <p className="font-medium">{d.hotel_name}</p>
                    <p className="text-xs text-muted-foreground">
                      {[d.city, d.state].filter(Boolean).join(", ") || "—"} · matches: {d.matched_on.join(", ").replace(/_/g, " + ")}
                    </p>
                  </div>
                  <div className="flex gap-2">
                    <Button size="sm" variant="outline" asChild>
                      <Link to="/clients/$clientId" params={{ clientId: d.client_id }}>Open existing</Link>
                    </Button>
                    <Button size="sm" variant="outline" asChild>
                      <Link to="/clients/new" search={{ clientId: d.client_id, step: 1 }}>Add launch</Link>
                    </Button>
                  </div>
                </div>
                {d.launches.length ? (
                  <p className="mt-1 text-xs text-muted-foreground">
                    Launches: {d.launches.map((l) => `${l.plan ?? "—"} (${LAUNCH_STATUS_LABEL[l.status] ?? l.status})`).join(" · ")}
                  </p>
                ) : (
                  <p className="mt-1 text-xs text-muted-foreground">No launches yet.</p>
                )}
              </li>
            ))}
          </ul>
          <div className="border-t border-border/70 pt-3">
            {isManager ? (
              <div className="flex flex-wrap items-center gap-3">
                <label className="flex items-center gap-2 text-sm">
                  <Checkbox checked={confirmNew} onCheckedChange={(v) => setConfirmNew(v === true)} />
                  I confirm this is a different hotel, not a duplicate
                </label>
                <Button size="sm" variant="destructive" disabled={!confirmNew || saving} onClick={proceedAsNew}>
                  {saving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                  Proceed as new
                </Button>
              </div>
            ) : (
              <p className="text-xs text-muted-foreground">
                Creating a new record despite these matches needs management/admin — ask them to proceed.
              </p>
            )}
          </div>
        </DialogContent>
      </Dialog>

    </div>
  );
}

function Field({ label, required, children }: { label: string; required?: boolean; children: React.ReactNode }) {
  return (
    <div className="space-y-2">
      <Label>
        {label}
        {required ? <span className="text-destructive"> *</span> : null}
      </Label>
      {children}
    </div>
  );
}

function FileField({ label, fileRef, onPick }: { label: string; fileRef: React.MutableRefObject<File | null>; onPick?: (picked: boolean) => void }) {
  const [name, setName] = useState("");
  return (
    <div className="space-y-2">
      <Label>{label}</Label>
      <label className="flex cursor-pointer items-center gap-2 rounded-lg border border-dashed border-border px-3.5 py-2.5 text-sm text-muted-foreground hover:border-primary/40">
        <Upload className="h-4 w-4" />
        <span className="truncate">{name || "Choose file"}</span>
        <input
          type="file"
          className="hidden"
          onChange={(e) => {
            const f = e.target.files?.[0] ?? null;
            fileRef.current = f;
            setName(f?.name ?? "");
            onPick?.(!!f);
          }}
        />
      </label>
    </div>
  );
}
