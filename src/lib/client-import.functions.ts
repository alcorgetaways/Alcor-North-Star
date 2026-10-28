import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { requirePasswordChanged } from "@/lib/password.functions";
import { z } from "zod";
import { randomTempPassword } from "@/lib/security-rules";
import { OWNER_ROWS, TRACKER_ROWS, type TrackerRow } from "./client-import-data";

type PlanInfo = {
  id: string;
  versionId: string;
  fee: number;
  services: Array<{ pipeline_code: string; service_name: string }>;
};

const PLAN_MAP: Record<string, string> = {
  GMB: "gmb_seo",
  Small: "diamond_start",
  Growing: "diamond_grow",
  Pro: "diamond_scale",
};

const PIPELINE_LABEL: Record<string, string> = {
  gbp: "GMB SEO",
  website_seo: "Website Audit & CRO",
  social_media: "Social Media",
  ota: "OTA Management",
  email_marketing: "TA Connect – B2B email",
  reservations_desk: "Virtual Reservations Desk",
  performance_marketing: "Meta Ads",
  whatsapp: "WhatsApp Automation & Drip",
  influencer: "Influencer",
};

const SCALE_PIPELINES = [
  "gbp",
  "website_seo",
  "social_media",
  "ota",
  "performance_marketing",
  "email_marketing",
  "influencer",
  "reservations_desk",
  "whatsapp",
];

/** Confirmed custom terms, keyed by tracker source_row. */
const OVERRIDES: Record<
  number,
  { retainer?: number; direct?: number; ota?: number; weddings?: number; deposit?: number; services?: string[] }
> = {
  53: { retainer: 200000, services: SCALE_PIPELINES }, // Excel parent: 5 × 35000 + 25000 Website SEO, brand marketing free
  65: { retainer: 0, direct: 20, weddings: 10, ota: 0, deposit: 200000 }, // Simcha Island
  61: { retainer: 30000, ota: 10, direct: 11 }, // Yadus Jawai
  62: { retainer: 35000, ota: 10, direct: 12 }, // Kutani Bagh Sariska
  35: { retainer: 7000 }, // Dental centre: Hotel Maurya terms (no commission), own retainer
};

const NO_CONTRACT_CLIENTS = new Set([
  "dental centre",
  "reflections by sol escapes",
  "yadus jawai by alcor",
  "kutani bagh sariska",
]);

const norm = (s: string) =>
  s
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();

const ALIASES: Record<string, string> = {
  "countryside villa by alcor": "countryside villa dhanaulti",
  "countryside villa dhanaulti": "countryside villa dhanaulti",
  "excel hotels resorts": "excel main brand",
  "excel hotels banyan jim corbett": "the banyan retreat",
  "excel hotels bhimtal": "excel bhimtal",
};
const clientKey = (name: string) => ALIASES[norm(name)] ?? norm(name);

const DISPLAY_NAME: Record<string, string> = {
  "excel main brand": "Excel Main Brand",
  "the banyan retreat": "The Banyan Retreat",
  "excel bhimtal": "Excel Bhimtal",
  "countryside villa dhanaulti": "Countryside Villa - Dhanaulti",
};

/** Excel child properties; rows 45/46 attach to two of them, the rest have no launch. */
const EXCEL_CHILDREN = ["excel bhimtal", "excel nainital", "excel corbett", "la perle resort", "the banyan retreat"];
const EXTRA_CLIENTS: Array<{ key: string; name: string; parent: string }> = [
  { key: "excel nainital", name: "Excel Nainital", parent: "excel main brand" },
  { key: "excel corbett", name: "Excel Corbett", parent: "excel main brand" },
  { key: "la perle resort", name: "La Perle Resort", parent: "excel main brand" },
];

export type ClientImportReport = {
  dry_run: boolean;
  rows_read: number;
  clients: { created: number; existing: number };
  launches: { created: number; existing: number };
  custom_plans: { created: number; standard_matched: number };
  rows_merged_into_existing_clients: number;
  shared_contacts_kept_separate: string[];
  skipped_rows: Array<{ row: number; reason: string }>;
  errors: string[];
  owner_logins: {
    created: number;
    reused: number;
    skipped: number;
    failed: number;
    rows: Array<{ email: string; client: string; status: string; reason: string }>;
  };
  flags: string[];
};

export const importClients = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth, requirePasswordChanged])
  .inputValidator((input: unknown) =>
    z.object({ dry_run: z.boolean().default(false) }).strict().parse(input ?? {}),
  )
  .handler(async ({ data, context }): Promise<ClientImportReport> => {
    const { data: isAdmin } = await context.supabase.rpc("has_role", {
      _user_id: context.userId,
      _role: "admin",
    });
    if (!isAdmin) throw new Error("Only an admin can import clients");

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const report: ClientImportReport = {
      dry_run: data.dry_run,
      rows_read: TRACKER_ROWS.length,
      clients: { created: 0, existing: 0 },
      launches: { created: 0, existing: 0 },
      custom_plans: { created: 0, standard_matched: 0 },
      rows_merged_into_existing_clients: 0,
      shared_contacts_kept_separate: [],
      skipped_rows: [],
      errors: [],
      owner_logins: { created: 0, reused: 0, skipped: 0, failed: 0, rows: [] },
      flags: [],
    };

    // ---- Reference data ----
    const [{ data: planRows }, { data: versionRows }, { data: serviceRows }] = await Promise.all([
      supabaseAdmin.from("plans").select("id, code, fee_inr"),
      supabaseAdmin.from("plan_versions").select("id, plan_id, monthly_retainer_inr, status"),
      supabaseAdmin.from("plan_services").select("plan_version_id, pipeline_code, service_name, included"),
    ]);
    const plans: Record<string, PlanInfo> = {};
    for (const p of planRows ?? []) {
      const v = (versionRows ?? []).find((x) => x.plan_id === p.id && x.status === "active");
      if (!v) continue;
      plans[p.code as string] = {
        id: p.id as string,
        versionId: v.id as string,
        fee: Number(v.monthly_retainer_inr ?? p.fee_inr ?? 0),
        services: (serviceRows ?? [])
          .filter((s) => s.plan_version_id === v.id && s.included)
          .map((s) => ({ pipeline_code: s.pipeline_code as string, service_name: s.service_name as string })),
      };
    }

    const { data: mohnishProfile } = await supabaseAdmin
      .from("profiles")
      .select("id")
      .eq("email", "mohnish@group2001.in")
      .maybeSingle();
    const mohnishId = (mohnishProfile?.id as string | undefined) ?? null;

    // ---- Group tracker rows into clients ----
    const groups = new Map<string, TrackerRow[]>();
    for (const row of TRACKER_ROWS) {
      const key = clientKey(row.name);
      groups.set(key, [...(groups.get(key) ?? []), row]);
    }
    for (const rows of groups.values()) {
      rows.sort((a, b) => (a.month < b.month ? -1 : a.month > b.month ? 1 : a.row - b.row));
    }
    for (const rows of groups.values()) {
      if (rows.length > 1) report.rows_merged_into_existing_clients += rows.length - 1;
    }

    // Shared phone numbers across distinct clients — reported, never merged.
    const phoneOwners = new Map<string, Set<string>>();
    for (const row of TRACKER_ROWS) {
      const phone = row.phone.replace(/\D/g, "");
      if (!phone) continue;
      const set = phoneOwners.get(phone) ?? new Set<string>();
      set.add(clientKey(row.name));
      phoneOwners.set(phone, set);
    }
    for (const [phone, keys] of phoneOwners) {
      if (keys.size > 1) {
        report.shared_contacts_kept_separate.push(`${phone}: ${[...keys].sort().join(" / ")}`);
      }
    }
    report.shared_contacts_kept_separate.sort();

    // ---- Existing clients ----
    const { data: existingClients } = await supabaseAdmin
      .from("clients")
      .select("id, hotel_name, parent_client_id, import_flags");
    const clientIdByKey = new Map<string, string>();
    for (const c of existingClients ?? []) {
      clientIdByKey.set(clientKey(c.hotel_name as string), c.id as string);
    }

    const allKeys = new Set<string>([...groups.keys(), ...EXTRA_CLIENTS.map((c) => c.key)]);
    const displayName = (key: string): string => {
      if (DISPLAY_NAME[key]) return DISPLAY_NAME[key];
      const extra = EXTRA_CLIENTS.find((c) => c.key === key);
      if (extra) return extra.name;
      const rows = groups.get(key) ?? [];
      return rows[rows.length - 1]?.name ?? key;
    };

    // ---- Create clients (parent brands before their children) ----
    const orderedKeys = [...allKeys].sort((a, b) => {
      const pa = EXCEL_CHILDREN.includes(a) ? 1 : 0;
      const pb = EXCEL_CHILDREN.includes(b) ? 1 : 0;
      return pa - pb;
    });
    for (const key of orderedKeys) {
      const rows = groups.get(key) ?? [];
      const latest = rows[rows.length - 1];
      const pick = (f: keyof TrackerRow) =>
        [...rows].reverse().map((r) => (r[f] as string) ?? "").find((v) => v && v.trim()) ?? "";
      const flags: string[] = [];
      const mobile = latest ? pick("phone") : "";
      const contact = latest ? pick("contact") : "";
      const state = latest ? pick("state") : "";
      const dest = latest ? pick("dest") : "";
      const source = latest ? pick("source") : "";
      if (!mobile) flags.push("missing_phone");
      if (!contact) flags.push("missing_contact_person");
      if (!state) flags.push("missing_state");
      if (!dest) flags.push("missing_destination");
      if (!source) flags.push("missing_source");
      if (NO_CONTRACT_CLIENTS.has(key)) flags.push("no_contract_file");
      const isNew = !clientIdByKey.has(key) || (clientIdByKey.get(key) ?? "").startsWith("dry-run:");
      if (isNew) {
        for (const f of flags) report.flags.push(`${displayName(key)}: ${f}`);
      }
      if (clientIdByKey.has(key) && !isNew) {
        report.clients.existing += 1;
        continue;
      }
      if (data.dry_run) {
        report.clients.created += 1;
        // Simulate the id so launches, documents and owner logins resolve in the report.
        clientIdByKey.set(key, `dry-run:${key}`);
        continue;
      }
      const parentKey = EXCEL_CHILDREN.includes(key) ? "excel main brand" : null;
      const hasActive = rows.some((r) => r.status === "Active");
      const { data: inserted, error } = await supabaseAdmin
        .from("clients")
        .insert({
          hotel_name: displayName(key),
          mobile: mobile || null,
          contact_person: contact || null,
          state: state || null,
          destination: dest || null,
          lead_source: source || null,
          status: hasActive ? "active" : "inactive",
          parent_client_id: parentKey ? (clientIdByKey.get(parentKey) ?? null) : null,
          import_flags: flags,
          created_by: context.userId,
        })
        .select("id")
        .single();
      if (error) {
        report.errors.push(`Client ${displayName(key)}: ${error.message}`);
        continue;
      }
      clientIdByKey.set(key, inserted.id as string);
      report.clients.created += 1;
    }

    // ---- Custom plans + launches ----
    const { data: existingLaunches } = await supabaseAdmin
      .from("client_launches")
      .select("id, client_id, source_row, custom_plan_id")
      .not("source_row", "is", null);
    const launchByRow = new Map<number, { id: string; custom_plan_id: string | null }>();
    for (const l of existingLaunches ?? []) {
      launchByRow.set(l.source_row as number, { id: l.id as string, custom_plan_id: l.custom_plan_id as string | null });
    }

    // Reuse identical legacy custom plans within the same client during this run.
    // On a rerun every launch already exists (keyed by source_row), so no custom
    // plan is ever created twice.
    const customPlanByShape = new Map<string, string>();

    const sameSet = (a: string[], b: string[]) =>
      a.length === b.length && [...a].sort().join(",") === [...b].sort().join(",");

    for (const [key, rows] of groups) {
      const clientId = clientIdByKey.get(key);
      if (!clientId) {
        for (const r of rows) report.skipped_rows.push({ row: r.row, reason: "client not created" });
        continue;
      }
      for (const row of rows) {
        if (launchByRow.has(row.row)) {
          report.launches.existing += 1;
          report.skipped_rows.push({ row: row.row, reason: "launch already imported" });
          continue;
        }
        try {
          const baseCode = PLAN_MAP[row.plan] as string | undefined;
          const base = baseCode ? plans[baseCode] : undefined;
          if (!base) throw new Error(`unknown plan ${row.plan}`);
          const ov = OVERRIDES[row.row];
          const services = ov?.services ?? (row.services.length ? row.services : base.services.map((s) => s.pipeline_code));
          const retainer = ov?.retainer ?? row.retainer;
          const basePipelines = [...new Set(base.services.map((s) => s.pipeline_code))];
          const standardMatch =
            !ov && retainer === base.fee && sameSet([...new Set(services)], basePipelines);

          const launchFlags: string[] = [];
          if (row.month.endsWith("-01")) launchFlags.push("approx_contract_start");
          if (row.status === "Churned") launchFlags.push("churned_no_closure_date");
          for (const f of launchFlags) report.flags.push(`Row ${row.row} ${row.name}: ${f}`);
          report.launches.created += 1;
          if (standardMatch) report.custom_plans.standard_matched += 1;
          if (data.dry_run) {
            if (!standardMatch) report.custom_plans.created += 1;
            continue;
          }

          let customPlanId: string | null = null;
          if (!standardMatch) {
            const shape = [base.versionId, retainer, ov?.direct ?? 0, ov?.ota ?? 0, ov?.weddings ?? 0].join("|");
            const shapeKey = clientId + "|" + shape + "|" + [...new Set(services)].sort().join(",");
            const reuse = customPlanByShape.get(shapeKey);
            if (reuse) {
              customPlanId = reuse;
            } else {
              const { data: cp, error: cpErr } = await supabaseAdmin
                .from("custom_plans")
                .insert({
                  base_plan_version_id: base.versionId,
                  name: `Legacy — ${displayName(key)} (tracker row ${row.row})`,
                  status: "active",
                  approval_status: "approved",
                  approved_by: mohnishId,
                  approved_at: new Date().toISOString(),
                  monthly_retainer_inr: retainer,
                  commission_direct_pct: ov?.direct ?? null,
                  commission_ota_pct: ov?.ota ?? null,
                  commission_weddings_pct: ov?.weddings ?? null,
                  commission_other_pct: 0,
                  payment_cycle: "monthly",
                  notes: "Legacy agreement imported from BD tracker",
                  created_by: context.userId,
                })
                .select("id")
                .single();
              if (cpErr) throw new Error(cpErr.message);
              customPlanId = cp.id as string;
              // Services for the custom plan: base plan wording per pipeline where available.
              const cpId = cp.id as string;
              const serviceRowsToInsert = [...new Set(services)].map((code: string, i: number) => {
                const baseService = base.services.find((s: { pipeline_code: string; service_name: string }) => s.pipeline_code === code);
                return {
                  custom_plan_id: cpId,
                  service_name: baseService?.service_name ?? PIPELINE_LABEL[code] ?? code,
                  pipeline_code: code,
                  included: true,
                  sort_order: i + 1,
                };
              });
              const { error: svcErr } = await supabaseAdmin.from("custom_plan_services").insert(serviceRowsToInsert);
              if (svcErr) throw new Error(svcErr.message);
              // The set_approval trigger forces differing terms to pending on insert;
              // approve explicitly (allowed for the service role) with Mohnish as approver.
              const { error: apErr } = await supabaseAdmin
                .from("custom_plans")
                .update({ approval_status: "approved", approved_by: mohnishId })
                .eq("id", customPlanId);
              if (apErr) throw new Error(apErr.message);
              customPlanByShape.set(shapeKey, customPlanId);
              report.custom_plans.created += 1;
            }
          }

          const approx = row.month.endsWith("-01");
          let status = "active";
          let closing: string | null = null;
          if (row.status === "Churned") {
            status = "closed";
            closing = "client_discontinued";
          } else if (row.status === "On Hold") {
            status = "on_hold";
          }
          const { data: launch, error: lErr } = await supabaseAdmin
            .from("client_launches")
            .insert({
              client_id: clientId,
              plan_id: base.id,
              plan_version_id: base.versionId,
              custom_plan_id: customPlanId,
              status,
              closing_reason_code: closing,
              retainer_inr: retainer,
              commission_direct_pct: ov?.direct ?? null,
              commission_ota_pct: ov?.ota ?? null,
              commission_weddings_pct: ov?.weddings ?? null,
              deposit_inr: ov?.deposit ?? null,
              contract_start: row.month,
              contract_start_approx: approx,
              source_row: row.row,
              import_flags: launchFlags,
              created_by: context.userId,
            })
            .select("id")
            .single();
          if (lErr) throw new Error(lErr.message);
          launchByRow.set(row.row, { id: launch.id as string, custom_plan_id: customPlanId });
        } catch (e) {
          report.errors.push(`Row ${row.row} ${row.name}: ${e instanceof Error ? e.message : "unknown"}`);
        }
      }
    }

    // ---- Link previous launches (newest is current) ----
    if (!data.dry_run) {
      for (const [key, rows] of groups) {
        const clientId = clientIdByKey.get(key);
        if (!clientId || rows.length < 2) continue;
        const sorted = [...rows].sort((a, b) => (a.month < b.month ? -1 : a.month > b.month ? 1 : a.row - b.row));
        for (let i = 1; i < sorted.length; i++) {
          const curRow = sorted[i];
          const prevRow = sorted[i - 1];
          if (!curRow || !prevRow) continue;
          const cur = launchByRow.get(curRow.row);
          const prev = launchByRow.get(prevRow.row);
          if (cur && prev) {
            await supabaseAdmin.from("client_launches").update({ previous_launch_id: prev.id }).eq("id", cur.id);
          }
        }
      }
    }

    // ---- Documents: tracker sheets + contract references ----
    if (!data.dry_run) {
      const seenDocs = new Set<string>();
      const addDoc = async (clientId: string, category: string, docType: string, notes: string) => {
        const dedupe = `${clientId}|${docType}|${notes}`;
        if (seenDocs.has(dedupe)) return;
        seenDocs.add(dedupe);
        const { data: existing } = await supabaseAdmin
          .from("documents")
          .select("id")
          .eq("client_id", clientId)
          .eq("doc_type", docType)
          .eq("notes", notes)
          .limit(1);
        if (existing && existing.length > 0) return;
        const { error } = await supabaseAdmin.from("documents").insert({
          client_id: clientId,
          category,
          doc_type: docType,
          file_path: null,
          status: "verified",
          mandatory: false,
          notes,
          uploaded_by: context.userId,
        });
        if (error) report.errors.push(`Document ${docType} for ${clientId}: ${error.message}`);
      };
      for (const row of TRACKER_ROWS) {
        if (!row.tracker) continue;
        const clientId = clientIdByKey.get(clientKey(row.name));
        if (clientId) await addDoc(clientId, "reference", "Tracker sheet", row.tracker);
      }
      for (const o of OWNER_ROWS) {
        const clientId = clientIdByKey.get(clientKey(o.client));
        if (clientId) await addDoc(clientId, "contract", "Contract reference", o.note);
      }
    }

    // ---- Owner logins (active clients only, list B) ----
    const { data: allUsers } = data.dry_run
      ? { data: null }
      : await supabaseAdmin.auth.admin.listUsers({ page: 1, perPage: 1000 });
    const userByEmail = new Map(
      (allUsers?.users ?? []).map((u) => [(u.email ?? "").trim().toLowerCase(), u.id]),
    );

    for (const o of OWNER_ROWS) {
      const email = o.email.trim().toLowerCase();
      const key = clientKey(o.client);
      const clientId = clientIdByKey.get(key);
      const push = (status: string, reason: string) => {
        report.owner_logins.rows.push({ email, client: displayName(key), status, reason });
        if (status === "created") report.owner_logins.created += 1;
        else if (status === "reused") report.owner_logins.reused += 1;
        else if (status === "skipped") report.owner_logins.skipped += 1;
        else report.owner_logins.failed += 1;
      };
      if (!clientId) {
        push("failed", "client not found");
        continue;
      }
      if (data.dry_run) {
        push(userByEmail.has(email) ? "reused" : "created", "dry run — no account touched");
        continue;
      }
      try {
        const contactName =
          (groups.get(key) ?? []).map((r) => r.contact).find((c) => c && c.trim()) ?? displayName(key);
        const existingId = userByEmail.get(email);
        if (existingId) {
          const { error: roleErr } = await supabaseAdmin
            .from("user_roles")
            .upsert({ user_id: existingId, role: "client" }, { onConflict: "user_id,role" });
          if (roleErr) throw new Error(roleErr.message);
          const { error: profErr } = await supabaseAdmin
            .from("profiles")
            .upsert({ id: existingId, full_name: contactName, email, status: "active", client_id: clientId }, { onConflict: "id" });
          if (profErr) throw new Error(profErr.message);
          push("reused", "existing account linked; password and first-login flag untouched");
          continue;
        }
        const { data: created, error } = await supabaseAdmin.auth.admin.createUser({
          email,
          password: randomTempPassword(), // per-user random; never shared, stored or emailed
          email_confirm: true,
          user_metadata: { full_name: contactName },
        });
        if (error) throw new Error(error.message);
        const userId = created.user?.id;
        if (!userId) throw new Error("Auth did not return a user id");
        const { error: profErr } = await supabaseAdmin.from("profiles").upsert(
          { id: userId, full_name: contactName, email, status: "active", client_id: clientId, must_change_password: true },
          { onConflict: "id" },
        );
        if (profErr) throw new Error(profErr.message);
        const { error: roleErr } = await supabaseAdmin
          .from("user_roles")
          .upsert({ user_id: userId, role: "client" }, { onConflict: "user_id,role" });
        if (roleErr) throw new Error(roleErr.message);
        await supabaseAdmin.rpc("log_admin_action", {
          _actor: context.userId,
          _action: "import_owner_created",
          _target_type: "user",
          _target_id: userId,
          _outcome: "success",
          _details: { email, client: displayName(key) },
        });
        userByEmail.set(email, userId);
        push("created", "account created with a random one-time password; sign-in via the set-password link");
      } catch (e) {
        push("failed", e instanceof Error ? e.message : "unknown");
      }
    }

    // ---- Tag the test client ----
    if (!data.dry_run) {
      await supabaseAdmin.from("clients").update({ is_test: true }).eq("hotel_name", "The Palm Spring Resort");
    }

    return report;
  });
