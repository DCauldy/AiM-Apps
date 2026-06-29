import { NextRequest } from "next/server";
import { createClient, createServiceRoleClient } from "@/lib/supabase/server";
import type {
  CmaAgentSettings,
  CmaAgentSettingsPatchBody,
} from "@/types/cma";

export const dynamic = "force-dynamic";

const MIN_CADENCE_DAYS = 7; // matches cma_agent_settings CHECK floor
const MIN_REMINDER_LEAD_DAYS = 0;
const MAX_REMINDER_LEAD_DAYS = 30;
const DEFAULT_CADENCE_DAYS = 90;
const DEFAULT_REMINDER_LEAD_DAYS = 7;

/**
 * GET /api/apps/listing-studio/agent-settings
 *
 * Returns the user's cma_agent_settings row, lazily creating it with
 * defaults if missing. The UI always has something to render — first
 * visit doesn't require an explicit "create defaults" round-trip.
 */
export async function GET() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return Response.json({ error: "Unauthorized" }, { status: 401 });

  const service = createServiceRoleClient();
  const { data: existing } = await service
    .from("cma_agent_settings")
    .select("*")
    .eq("user_id", user.id)
    .maybeSingle();

  if (existing) {
    return Response.json({ settings: existing as CmaAgentSettings });
  }

  // Lazy create.
  const { data: created, error } = await service
    .from("cma_agent_settings")
    .insert({
      user_id: user.id,
      default_cadence_days: DEFAULT_CADENCE_DAYS,
      reminder_lead_days: DEFAULT_REMINDER_LEAD_DAYS,
      manual_review_required: false,
    })
    .select("*")
    .single();

  if (error) return Response.json({ error: error.message }, { status: 500 });
  return Response.json({ settings: created as CmaAgentSettings });
}

/**
 * PATCH /api/apps/listing-studio/agent-settings
 *
 * Updates the user's cma_agent_settings row. Validates the cadence
 * floor (7 days, matching the CHECK constraint) and reminder window
 * (0-30 days; longer windows are silently capped). Skipping the
 * actual UPDATE when nothing changed avoids touching updated_at on
 * no-ops.
 */
export async function PATCH(req: NextRequest) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return Response.json({ error: "Unauthorized" }, { status: 401 });

  let body: CmaAgentSettingsPatchBody;
  try {
    body = (await req.json()) as CmaAgentSettingsPatchBody;
  } catch {
    return Response.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  if (
    body.default_cadence_days !== undefined &&
    (!Number.isFinite(body.default_cadence_days) ||
      body.default_cadence_days < MIN_CADENCE_DAYS)
  ) {
    return Response.json(
      {
        error: `default_cadence_days must be a number ≥ ${MIN_CADENCE_DAYS}`,
      },
      { status: 400 },
    );
  }
  if (
    body.reminder_lead_days !== undefined &&
    (!Number.isFinite(body.reminder_lead_days) ||
      body.reminder_lead_days < MIN_REMINDER_LEAD_DAYS ||
      body.reminder_lead_days > MAX_REMINDER_LEAD_DAYS)
  ) {
    return Response.json(
      {
        error: `reminder_lead_days must be between ${MIN_REMINDER_LEAD_DAYS} and ${MAX_REMINDER_LEAD_DAYS}`,
      },
      { status: 400 },
    );
  }

  const update: Record<string, unknown> = {
    updated_at: new Date().toISOString(),
  };
  if (body.default_cadence_days !== undefined)
    update.default_cadence_days = body.default_cadence_days;
  if (body.reminder_lead_days !== undefined)
    update.reminder_lead_days = body.reminder_lead_days;
  if (body.manual_review_required !== undefined)
    update.manual_review_required = body.manual_review_required;
  if (body.default_email_connection_id !== undefined)
    update.default_email_connection_id = body.default_email_connection_id;

  const service = createServiceRoleClient();

  // Upsert so the first PATCH (before any GET) also works.
  const { data, error } = await service
    .from("cma_agent_settings")
    .upsert(
      {
        user_id: user.id,
        default_cadence_days: DEFAULT_CADENCE_DAYS,
        reminder_lead_days: DEFAULT_REMINDER_LEAD_DAYS,
        manual_review_required: false,
        ...update,
      },
      { onConflict: "user_id" },
    )
    .select("*")
    .single();

  if (error) return Response.json({ error: error.message }, { status: 500 });
  return Response.json({ settings: data as CmaAgentSettings });
}
