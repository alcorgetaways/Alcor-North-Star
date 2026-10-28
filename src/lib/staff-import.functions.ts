import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { requirePasswordChanged } from "@/lib/password.functions";
import { z } from "zod";
import { randomTempPassword } from "@/lib/security-rules";

type StaffRole = "admin" | "management" | "bd_manager" | "pipeline_manager" | "team_member" | "finance" | "hr";

type ExistingSpec = {
  email: string;
  name: string;
  title: string;
  keepRoles: StaffRole[]; // exact role set after import
  addRoles?: never;
};

type NewSpec = {
  email: string;
  name: string;
  title: string;
  role: StaffRole;
};

const EXISTING: ExistingSpec[] = [
  {
    email: "alcorgetaways@gmail.com",
    name: "Mayank",
    title: "Performance Marketing (in training) + WhatsApp Automations & Drip + Marketing Funnel Development + Web Designing + IT & Automations",
    keepRoles: ["pipeline_manager"],
  },
  {
    email: "alcorsparesort@gmail.com",
    name: "Aashish",
    title: "Social Media Marketing Associate + Performance Marketing (in training)",
    keepRoles: ["team_member"],
  },
  {
    email: "dm@alcorgetaways.com",
    name: "Anju",
    title: "Website SEO Head + GMB SEO Head",
    keepRoles: ["pipeline_manager"],
  },
  {
    email: "marketing@alcorgetaways.com",
    name: "Nisha",
    title: "Website SEO assistant + GMB SEO assistant + Influencer Marketing Head",
    keepRoles: ["pipeline_manager"],
  },
  {
    email: "alcor@group2001.in",
    name: "Dinesh",
    title: "Social Media Marketing Asst Manager + Performance Marketing (in training)",
    keepRoles: ["pipeline_manager"],
  },
  {
    email: "shalini@alcorgetaways.com",
    name: "Shalini Sharma",
    title: "Business Development Associate",
    keepRoles: ["bd_manager"],
  },
  {
    email: "mohnish@group2001.in",
    name: "Mohnish",
    title: "Co-Founder & Master Admin",
    keepRoles: ["admin", "management"],
  },
  {
    email: "tonny.sapra@group2001.in",
    name: "Tonny Sapra",
    title: "Founder",
    keepRoles: ["admin"],
  },
];

const NEW_STAFF: NewSpec[] = [
  { email: "accounts@alcorgetaways.com", name: "Amit", title: "Finance", role: "finance" },
  {
    email: "hotelsalesmastery@gmail.com",
    name: "Ronak",
    title: "WhatsApp Automations & Drip Marketing + Email Marketing (Travel Agent Connect) + Marketing Funnel Development",
    role: "pipeline_manager",
  },
  {
    email: "alcorgetaways.leadforms@gmail.com",
    name: "Arvind Kumar",
    title: "Social Media Marketing Associate + Performance Marketing (in training)",
    role: "team_member",
  },
  { email: "aman@alcorgetaways.com", name: "Aman", title: "Asst Reservations Manager", role: "team_member" },
  { email: "rahul@alcorgetaways.com", name: "Rahul", title: "Asst Reservations Manager", role: "team_member" },
  { email: "monika@alcorgetaways.com", name: "Monika", title: "Reservations Associate", role: "team_member" },
  { email: "ankit@alcorgetaways.com", name: "Ankit", title: "Reservations Associate", role: "team_member" },
  { email: "book@alcorgetaways.com", name: "Tanuja", title: "Reservations Associate", role: "team_member" },
  { email: "param@alcorgetaways.com", name: "Param", title: "Reservations Associate", role: "team_member" },
  { email: "neha@alcorgetaways.com", name: "Neha", title: "Reservations Associate", role: "team_member" },
  { email: "hr@alcorgetaways.com", name: "Sushma Kumari", title: "HR Asst Manager", role: "hr" },
];

/** pipeline code -> head email(s) and team email(s). source: manual. */
const MEMBERSHIPS: Array<{ pipeline: string; head: string[]; team: string[] }> = [
  { pipeline: "gbp", head: ["dm@alcorgetaways.com"], team: ["marketing@alcorgetaways.com"] },
  { pipeline: "website_seo", head: ["dm@alcorgetaways.com"], team: ["marketing@alcorgetaways.com"] },
  { pipeline: "influencer", head: ["marketing@alcorgetaways.com"], team: [] },
  {
    pipeline: "social_media",
    head: ["alcor@group2001.in"],
    team: ["alcorgetaways.leadforms@gmail.com", "alcorsparesort@gmail.com"],
  },
  {
    pipeline: "performance_marketing",
    head: ["mohnish@group2001.in"],
    team: ["alcorgetaways@gmail.com", "alcorgetaways.leadforms@gmail.com"],
  },
  { pipeline: "email_marketing", head: ["hotelsalesmastery@gmail.com"], team: [] },
  { pipeline: "whatsapp", head: ["hotelsalesmastery@gmail.com"], team: [] },
  {
    pipeline: "marketing_funnel",
    head: ["alcorgetaways@gmail.com"],
    team: ["hotelsalesmastery@gmail.com"],
  },
  { pipeline: "ota", head: ["shalini@alcorgetaways.com"], team: [] },
  {
    pipeline: "corporate_comms",
    head: ["alcor@group2001.in"],
    team: ["alcorgetaways.leadforms@gmail.com", "alcorsparesort@gmail.com"],
  },
  { pipeline: "business_development", head: ["shalini@alcorgetaways.com"], team: [] },
  {
    pipeline: "reservations_desk",
    head: ["mohnish@group2001.in"],
    team: [
      "aman@alcorgetaways.com",
      "rahul@alcorgetaways.com",
      "param@alcorgetaways.com",
      "monika@alcorgetaways.com",
      "book@alcorgetaways.com",
      "ankit@alcorgetaways.com",
      "neha@alcorgetaways.com",
    ],
  },
];

export type ImportRow = {
  email: string;
  name: string;
  status: "created" | "already_exists" | "updated" | "skipped" | "failed";
  reason: string;
};

export const importStaff = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth, requirePasswordChanged])
  .inputValidator((input: unknown) =>
    z.object({ dry_run: z.boolean().default(false) }).strict().parse(input ?? {}),
  )
  .handler(async ({ data, context }) => {
    const { data: isAdmin } = await context.supabase.rpc("has_role", {
      _user_id: context.userId,
      _role: "admin",
    });
    if (!isAdmin) throw new Error("Only an admin can import staff");

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const rows: ImportRow[] = [];

    async function findUser(email: string) {
      const { data: list, error } = await supabaseAdmin.auth.admin.listUsers({
        page: 1,
        perPage: 1000,
      });
      if (error) throw new Error(error.message);
      return (
        list.users.find((u) => (u.email ?? "").trim().toLowerCase() === email.toLowerCase()) ?? null
      );
    }

    async function syncProfile(userId: string, name: string, title: string, email: string) {
      const { error } = await supabaseAdmin
        .from("profiles")
        .upsert(
          { id: userId, full_name: name, department: title, email, status: "active" },
          { onConflict: "id" },
        );
      if (error) throw new Error(error.message);
    }

    async function syncRoles(userId: string, wanted: StaffRole[]) {
      const { data: current } = await supabaseAdmin
        .from("user_roles")
        .select("role")
        .eq("user_id", userId);
      const have = new Set((current ?? []).map((r) => r.role as string));
      for (const role of wanted) {
        if (!have.has(role)) {
          const { error } = await supabaseAdmin.from("user_roles").insert({ user_id: userId, role });
          if (error) throw new Error(error.message);
        }
      }
      for (const role of have) {
        if (!wanted.includes(role as StaffRole) && role !== "client") {
          const { error } = await supabaseAdmin
            .from("user_roles")
            .delete()
            .eq("user_id", userId)
            .eq("role", role as StaffRole);
          if (error) throw new Error(error.message);
        }
      }
    }

    // --- Existing accounts: name/title/roles only, never passwords ---
    for (const spec of EXISTING) {
      try {
        const user = await findUser(spec.email);
        if (!user) {
          rows.push({
            email: spec.email,
            name: spec.name,
            status: "skipped",
            reason: "No auth account with this email",
          });
          continue;
        }
        if (!data.dry_run) {
          await syncProfile(user.id, spec.name, spec.title, spec.email);
          await syncRoles(user.id, spec.keepRoles);
        }
        rows.push({
          email: spec.email,
          name: spec.name,
          status: "updated",
          reason: "Name, title and roles synced; password untouched",
        });
      } catch (e) {
        rows.push({
          email: spec.email,
          name: spec.name,
          status: "failed",
          reason: e instanceof Error ? e.message : "Unknown error",
        });
      }
    }

    // --- New accounts ---
    for (const spec of NEW_STAFF) {
      try {
        const existing = await findUser(spec.email);
        if (existing) {
          if (!data.dry_run) {
            await syncProfile(existing.id, spec.name, spec.title, spec.email);
            await syncRoles(existing.id, [spec.role]);
          }
          rows.push({
            email: spec.email,
            name: spec.name,
            status: "already_exists",
            reason: "Account already existed; profile and role synced, password and flag untouched",
          });
          continue;
        }
        if (data.dry_run) {
          rows.push({ email: spec.email, name: spec.name, status: "created", reason: "Would be created (dry run)" });
          continue;
        }
        const { data: created, error } = await supabaseAdmin.auth.admin.createUser({
          email: spec.email,
          password: randomTempPassword(), // per-user random; never shared, stored or emailed
          email_confirm: true,
          user_metadata: { full_name: spec.name, department: spec.title, role: spec.role },
        });
        if (error) throw new Error(error.message);
        const userId = created.user?.id;
        if (!userId) throw new Error("Auth did not return a user id");
        await syncProfile(userId, spec.name, spec.title, spec.email);
        await syncRoles(userId, [spec.role]);
        const { error: flagError } = await supabaseAdmin
          .from("profiles")
          .update({ must_change_password: true })
          .eq("id", userId);
        if (flagError) throw new Error(flagError.message);
        await supabaseAdmin.rpc("log_admin_action", {
          _actor: context.userId,
          _action: "import_staff_created",
          _target_type: "user",
          _target_id: userId,
          _details: { email: spec.email, role: spec.role },
        });
        rows.push({
          email: spec.email,
          name: spec.name,
          status: "created",
          reason: "Account created with a random one-time password; sign-in via the set-password link in the login email",
        });
      } catch (e) {
        rows.push({
          email: spec.email,
          name: spec.name,
          status: "failed",
          reason: e instanceof Error ? e.message : "Unknown error",
        });
      }
    }

    // --- Pipeline memberships ---
    const membershipNotes: string[] = [];
    if (!data.dry_run) {
      const { data: allUsers } = await supabaseAdmin.auth.admin.listUsers({ page: 1, perPage: 1000 });
      const idByEmail = new Map(
        (allUsers?.users ?? []).map((u) => [(u.email ?? "").trim().toLowerCase(), u.id]),
      );
      const { data: pipelines } = await supabaseAdmin.from("pipelines").select("id, code");
      const pipelineId = new Map((pipelines ?? []).map((p) => [p.code as string, p.id as string]));

      const wanted = new Set<string>(); // "pipelineId:userId:role"
      for (const m of MEMBERSHIPS) {
        const pid = pipelineId.get(m.pipeline);
        if (!pid) {
          membershipNotes.push(`Pipeline ${m.pipeline} not found — skipped`);
          continue;
        }
        for (const [role, emails] of [
          ["head", m.head],
          ["team_member", m.team],
        ] as const) {
          for (const email of emails) {
            const uid = idByEmail.get(email.toLowerCase());
            if (!uid) {
              membershipNotes.push(`${email} has no account — membership in ${m.pipeline} skipped`);
              continue;
            }
            wanted.add(`${pid}:${uid}:${role}`);
            const { error } = await supabaseAdmin
              .from("pipeline_members")
              .upsert(
                { pipeline_id: pid, user_id: uid, role, source: "manual", active: true },
                { onConflict: "user_id,pipeline_id,role" },
              );
            if (error) membershipNotes.push(`${email} in ${m.pipeline}: ${error.message}`);
          }
        }
      }

      // Deactivate (never delete) older assignments on these pipelines that conflict with the list.
      const pipelineIds = [...new Set([...pipelineId.values()])];
      const { data: current } = await supabaseAdmin
        .from("pipeline_members")
        .select("id, pipeline_id, user_id, role")
        .in("pipeline_id", pipelineIds)
        .eq("active", true);
      for (const row of current ?? []) {
        if (!wanted.has(`${row.pipeline_id}:${row.user_id}:${row.role}`)) {
          await supabaseAdmin.from("pipeline_members").update({ active: false }).eq("id", row.id);
          membershipNotes.push(`Deactivated a conflicting ${row.role} membership`);
        }
      }
    }

    const counts = {
      created: rows.filter((r) => r.status === "created").length,
      already_exists: rows.filter((r) => r.status === "already_exists").length,
      updated: rows.filter((r) => r.status === "updated").length,
      skipped: rows.filter((r) => r.status === "skipped").length,
      failed: rows.filter((r) => r.status === "failed").length,
    };
    return { rows, counts, membershipNotes, dry_run: data.dry_run };
  });
