import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { requirePasswordChanged } from "@/lib/password.functions";
import { z } from "zod";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";

/** Audit via supabaseAdmin: log_admin_action is service-role only and takes the actor explicitly. */
async function audit(actorId: string, action: string, targetId: string, details: Record<string, unknown>) {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  await supabaseAdmin.rpc("log_admin_action", {
    _actor: actorId,
    _action: action,
    _target_type: "client",
    _target_id: targetId,
    _details: details as import("@/integrations/supabase/types").Json,
  });
}

async function requireManager(
  supabase: SupabaseClient<Database>,
  userId: string,
) {
  const { data: isMgr } = await supabase.rpc("is_manager", { _user_id: userId });
  if (!isMgr) throw new Error("Only admin or management can change team assignments");
}

/** Manual add: a person is attached to one pipeline of one client. Survives recalculation. */
export const addClientAssignment = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth, requirePasswordChanged])
  .inputValidator((input: unknown) =>
    z
      .object({
        clientId: z.string().uuid(),
        userId: z.string().uuid(),
        pipelineId: z.string().uuid(),
        role: z.enum(["head", "team_member"]).default("team_member"),
      })
      .strict()
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    await requireManager(context.supabase, context.userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: pipeline } = await supabaseAdmin
      .from("pipelines")
      .select("name")
      .eq("id", data.pipelineId)
      .single();
    const { error } = await supabaseAdmin.from("client_staff_assignments").upsert(
      {
        client_id: data.clientId,
        user_id: data.userId,
        pipeline_id: data.pipelineId,
        role: data.role,
        source: "manual",
        excluded: false,
        matched_service: pipeline?.name ?? null,
        last_calculated_at: new Date().toISOString(),
      },
      { onConflict: "client_id,user_id,pipeline_id" },
    );
    if (error) throw new Error(error.message);
    await audit(context.userId, "assignment_add", data.clientId, {
      user_id: data.userId,
      pipeline_id: data.pipelineId,
      role: data.role,
    });
    return { ok: true };
  });

/** Manual remove: soft-excludes the row (never deletes) so it survives recalculation. */
export const removeClientAssignment = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth, requirePasswordChanged])
  .inputValidator((input: unknown) =>
    z.object({ assignmentId: z.string().uuid() }).strict().parse(input),
  )
  .handler(async ({ data, context }) => {
    await requireManager(context.supabase, context.userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: row, error: readErr } = await supabaseAdmin
      .from("client_staff_assignments")
      .select("id, client_id, user_id, pipeline_id")
      .eq("id", data.assignmentId)
      .single();
    if (readErr || !row) throw new Error("Assignment not found");
    const { error } = await supabaseAdmin
      .from("client_staff_assignments")
      .update({ excluded: true, source: "manual", last_calculated_at: new Date().toISOString() })
      .eq("id", data.assignmentId);
    if (error) throw new Error(error.message);
    await audit(context.userId, "assignment_remove", row.client_id, {
      user_id: row.user_id,
      pipeline_id: row.pipeline_id,
    });
    return { ok: true };
  });

/** Reset a client to automatic assignments (admin/management, confirmed in the UI). */
export const recalculateClientAssignments = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth, requirePasswordChanged])
  .inputValidator((input: unknown) =>
    z
      .object({ clientId: z.string().uuid(), resetManual: z.boolean().default(false) })
      .strict()
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    await requireManager(context.supabase, context.userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: result, error } = await supabaseAdmin.rpc("recalc_client_assignments", {
      _client_id: data.clientId,
      _reset_manual: data.resetManual,
    });
    if (error) throw new Error(error.message);
    await audit(context.userId, "assignment_recalculate", data.clientId, {
      reset_manual: data.resetManual,
    });
    return result as { assigned: number; unmatched: string[] } | null;
  });
