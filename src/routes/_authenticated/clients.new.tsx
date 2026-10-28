import { ConfirmButton } from "@/components/ConfirmButton";
import { useEffect, useRef, useState } from "react";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Check, ChevronLeft, ChevronRight, Loader2, Upload } from "lucide-react";
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
  day0_requires_noc: boolean;
  launch_day: number | null;
  plan_modules: Array<{ module_code: string; window_label: string | null; launch_modules: { name: string; owner_role: string; client_side: boolean } | null }>;
};


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
  const [picked, setPicked] = useState({ agm: false, noc: false, pay: false });
  const originalPlanId = useRef<string | null>(null);
  const [planChangeOpen, setPlanChangeOpen] = useState(false);
  const [planChangeReason, setPlanChangeReason] = useState("");
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
        "id, client_id, plan_id, addons, crm_option, meta_budget_daily, google_budget_daily, advance_received_at, status, day0_date, launch_date";
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
        setLaunch((prev) => ({
          ...prev,
          id: l.id,
          plan_id: l.plan_id,
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
  const modules = selectedPlan?.plan_modules ?? [];
  const isDiamond = selectedPlan?.code.startsWith("diamond_") ?? false;
  const isScale = selectedPlan?.code === "diamond_scale";
  const hideGoogle = selectedPlan?.code === "diamond_start";
  const needsNoc = selectedPlan?.day0_requires_noc ?? false;

  const agmFile = useRef<File | null>(null);
  const nocFile = useRef<File | null>(null);
  const payFile = useRef<File | null>(null);

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
    if (!basics.hotel_name.trim()) {
      toast.error("Hotel / brand name is required");
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
    if (launch.id && launch.status !== "draft" && launch.plan_id !== originalPlanId.current) {
      if (!isManager) {
        toast.error("Day 0 is already confirmed — ask management to change this plan.");
        return;
      }
      setPlanChangeOpen(true);
      return;
    }
    setSaving(true);
    try {
      const cid = await ensureClient();
      await saveLaunchDraft(cid);
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
      // Each file is uploaded and recorded once; its ref is cleared straight after, so a retry never duplicates it.
      const agreementPath = await uploadDraftFile(cid, "agreement", agmFile.current);
      if (agreementPath) { await saveDoc("Agreement Copy", agreementPath); agmFile.current = null; }
      if (needsNoc && nocFile.current) {
        const nocPath = await uploadDraftFile(cid, "noc", nocFile.current);
        if (nocPath) { await saveDoc("NOC — No Objection Certificate", nocPath); nocFile.current = null; }
      }
      void qc.invalidateQueries({ queryKey: ["wizard-docs", cid] });
      const payPath = await uploadDraftFile(cid, "advance", payFile.current);
      const payErr = await supabase
        .from("client_launches")
        .update({
          advance_amount: launch.advance_amount ? Number(launch.advance_amount) : null,
          advance_received_at: launch.advance_received_at || null,
          payment_reference: launch.payment_reference || null,
          ...(payPath ? { payment_screenshot_path: payPath } : {}),
        })
        .eq("id", launch.id);
      if (payErr.error) throw payErr.error;
      if (payPath) { payFile.current = null; setLaunch((prev) => ({ ...prev, payment_screenshot_path: payPath })); }

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
        payment_screenshot_path: payPath ?? prev.payment_screenshot_path,
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
                <Input value={basics.hotel_name} onChange={(e) => setBasics({ ...basics, hotel_name: e.target.value })} placeholder="The Palm Springs Resort" />
              </Field>
              <Field label="Legal entity name">
                <Input value={basics.legal_name} onChange={(e) => setBasics({ ...basics, legal_name: e.target.value })} placeholder="Palm Springs Hospitality Pvt Ltd" />
              </Field>
              <Field label="Owner name">
                <Input value={basics.owner_name} onChange={(e) => setBasics({ ...basics, owner_name: e.target.value })} />
              </Field>
              <Field label="General Manager name">
                <Input value={basics.gm_name} onChange={(e) => setBasics({ ...basics, gm_name: e.target.value })} />
              </Field>
              <Field label="Reservations contact name">
                <Input value={basics.res_contact_name} onChange={(e) => setBasics({ ...basics, res_contact_name: e.target.value })} />
              </Field>
              <Field label="Reservations phone">
                <Input value={basics.res_contact_phone} onChange={(e) => setBasics({ ...basics, res_contact_phone: e.target.value })} type="tel" />
              </Field>
              <Field label="Owner email (creates their portal login)" required>
                <Input value={basics.email} onChange={(e) => setBasics({ ...basics, email: e.target.value })} type="email" />
              </Field>
              <Field label="Mobile / WhatsApp">
                <Input value={basics.mobile} onChange={(e) => setBasics({ ...basics, mobile: e.target.value })} type="tel" />
              </Field>
              <Field label="WhatsApp (if different)">
                <Input value={basics.whatsapp} onChange={(e) => setBasics({ ...basics, whatsapp: e.target.value })} type="tel" />
              </Field>
              <Field label="City">
                <Input value={basics.city} onChange={(e) => setBasics({ ...basics, city: e.target.value })} />
              </Field>
              <Field label="State">
                <Input value={basics.state} onChange={(e) => setBasics({ ...basics, state: e.target.value })} />
              </Field>
              <Field label="Address">
                <Input value={basics.address} onChange={(e) => setBasics({ ...basics, address: e.target.value })} />
              </Field>
              <Field label="Number of rooms">
                <Input value={basics.number_of_rooms} onChange={(e) => setBasics({ ...basics, number_of_rooms: e.target.value })} type="number" min="1" />
              </Field>
              <Field label="Property type">
                <Select value={basics.property_type} onValueChange={(v) => setBasics({ ...basics, property_type: v })}>
                  <SelectTrigger><SelectValue placeholder="Select type" /></SelectTrigger>
                  <SelectContent>
                    {PROPERTY_TYPES.map((t) => (
                      <SelectItem key={t} value={t}>{t}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </Field>
              <Field label="Website">
                <Input value={basics.website} onChange={(e) => setBasics({ ...basics, website: e.target.value })} placeholder="https://" />
              </Field>
              <Field label="GSTIN">
                <Input value={basics.gstin} onChange={(e) => setBasics({ ...basics, gstin: e.target.value })} placeholder="22AAAAA0000A1Z5" />
              </Field>
            </div>
            <div className="flex justify-end">
              <Button onClick={saveBasics} disabled={saving || !basics.hotel_name.trim()}>
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
                const active = p.id === launch.plan_id;
                return (
                  <button
                    key={p.id}
                    type="button"
                    onClick={() => setLaunch({ ...launch, plan_id: p.id })}
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
                      {(p.plan_modules ?? [])
                        .map((m) => m.launch_modules?.name)
                        .filter(Boolean)
                        .join(" · ")}
                    </p>
                  </button>
                );
              })}
            </div>

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
              <Button onClick={savePlan} disabled={saving || !launch.plan_id}>
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
              <Field label="Payment reference / UTR">
                <Input value={launch.payment_reference} onChange={(e) => setLaunch({ ...launch, payment_reference: e.target.value })} />
              </Field>
              <FileField label="Payment screenshot" fileRef={payFile} onPick={(v) => setPicked((p) => ({ ...p, pay: v }))} />
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
                      <span>Payment screenshot</span>
                      <Button variant="ghost" size="sm" className="h-7 px-2 text-xs" onClick={() => viewFile(launch.payment_screenshot_path!)}>
                        View
                      </Button>
                    </li>
                  ) : null}
                </ul>
                <p className="mt-1.5 text-label text-muted-foreground">
                  A newly chosen file is added as a new version — earlier uploads are kept.
                </p>
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
                hasScreenshot: picked.pay || !!launch.payment_screenshot_path,
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
            <p className="text-sm text-muted-foreground">Every module needs a primary owner before the launch can be activated.</p>
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
                    const lm = m.launch_modules;
                    const a = assignments[m.module_code] ?? { primary: "", backup: "", contact_name: "", contact_phone: "" };
                    const setA = (patch: Partial<typeof a>) =>
                      setAssignments({ ...assignments, [m.module_code]: { ...a, ...patch } });
                    const eligible = (staff.data ?? []).filter(
                      (s) => !lm?.owner_role || s.launch_roles.includes(lm.owner_role),
                    );
                    const pool = eligible.length ? eligible : staff.data ?? [];
                    return (
                      <>
                        <Select value={a.primary} onValueChange={(v) => setA({ primary: v, backup: a.backup === v ? "" : a.backup })}>
                          <SelectTrigger className="h-8 w-40"><SelectValue placeholder="Select" /></SelectTrigger>
                          <SelectContent>
                            {pool.map((s) => (
                              <SelectItem key={s.id} value={s.id}>{s.full_name}</SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                        {!eligible.length && (staff.data ?? []).length ? (
                          <p className="mt-1 text-label text-warning-foreground">No one has this launch role yet</p>
                        ) : null}
                      </>
                    );
                  },
                },
                {
                  key: "backup",
                  header: "Backup",
                  render: (m) => {
                    const lm = m.launch_modules;
                    const a = assignments[m.module_code] ?? { primary: "", backup: "", contact_name: "", contact_phone: "" };
                    const eligible = (staff.data ?? []).filter(
                      (s) => !lm?.owner_role || s.launch_roles.includes(lm.owner_role),
                    );
                    const pool = eligible.length ? eligible : staff.data ?? [];
                    return (
                      <Select
                        value={a.backup}
                        onValueChange={(v) =>
                          setAssignments({ ...assignments, [m.module_code]: { ...a, backup: v } })
                        }
                      >
                        <SelectTrigger className="h-8 w-40"><SelectValue placeholder="Select" /></SelectTrigger>
                        <SelectContent>
                          {pool.filter((s) => s.id !== a.primary).map((s) => (
                            <SelectItem key={s.id} value={s.id}>{s.full_name}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    );
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
