import "server-only";

import { NextRequest } from "next/server";
import { createClient, createServiceRoleClient } from "@/lib/supabase/server";
import { getActiveProfile } from "@/lib/profiles/server";
import { sendAdminChangeRequestEmail } from "@/lib/radar-otterly/email";

export const dynamic = "force-dynamic";

interface ChangeRequestBody {
  type?: "add_prompt" | "add_competitor";
  // add_prompt
  prompt?: string;
  /** Otterly prompt ID to replace (when at cap). Optional — empty
   *  means "add as new". */
  replace_prompt_id?: string;
  /** Human-readable text of the prompt being replaced, so ops sees
   *  what to remove without looking up the ID. */
  replace_prompt_text?: string;
  // add_competitor
  brand?: string;
  domain?: string;
  /** Brand name of the competitor to replace (when at cap). */
  replace_competitor_brand?: string;
}

// POST /api/apps/radar/requests
//
// Customer-submitted change request. Two types:
//   - add_prompt:     { type, prompt }
//   - add_competitor: { type, brand, domain? }
//
// Inserts a row in radar_change_requests, emails ops, returns 200.
// Ops fulfills in Otterly's UI from the admin queue.
export async function POST(req: NextRequest) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  const profile = await getActiveProfile(user.id);
  if (!profile) {
    return Response.json({ status: "no_profile" }, { status: 400 });
  }

  const body = (await req.json().catch(() => ({}))) as ChangeRequestBody;
  const type = body.type;
  if (type !== "add_prompt" && type !== "add_competitor") {
    return Response.json(
      { error: "type must be add_prompt or add_competitor" },
      { status: 400 },
    );
  }

  let payload: Record<string, unknown>;
  if (type === "add_prompt") {
    const prompt = body.prompt?.trim();
    if (!prompt || prompt.length < 4) {
      return Response.json(
        { error: "prompt is required (min 4 chars)" },
        { status: 400 },
      );
    }
    payload = {
      prompt,
      ...(body.replace_prompt_id
        ? {
            replace_prompt_id: body.replace_prompt_id,
            replace_prompt_text: body.replace_prompt_text ?? null,
          }
        : {}),
    };
  } else {
    const brand = body.brand?.trim();
    if (!brand) {
      return Response.json(
        { error: "brand is required" },
        { status: 400 },
      );
    }
    const domain = body.domain?.trim() || undefined;
    payload = {
      brand,
      ...(domain ? { domain } : {}),
      ...(body.replace_competitor_brand
        ? { replace_competitor_brand: body.replace_competitor_brand }
        : {}),
    };
  }

  const service = createServiceRoleClient();

  const { data: profileRow } = await service
    .from("platform_profiles")
    .select("website_url, display_name, full_name, reply_to_email")
    .eq("id", profile.id)
    .maybeSingle();
  const hostname = profileRow?.website_url ?? "(no website on profile)";

  const { data: inserted, error: insertError } = await service
    .from("radar_change_requests")
    .insert({
      user_id: user.id,
      profile_id: profile.id,
      type,
      payload,
      status: "pending",
    })
    .select("id, requested_at")
    .single();

  if (insertError || !inserted) {
    return Response.json(
      {
        status: "db_error",
        message: insertError?.message ?? "insert failed",
      },
      { status: 500 },
    );
  }

  // Best-effort admin email — don't fail the request if it bounces.
  try {
    await sendAdminChangeRequestEmail({
      requestId: inserted.id,
      type,
      hostname,
      payload,
      requesterEmail:
        user.email ?? profileRow?.reply_to_email ?? null,
      requesterName:
        profileRow?.display_name ?? profileRow?.full_name ?? null,
    });
  } catch (e) {
    console.error("[radar/requests] admin email failed:", e);
  }

  return Response.json({
    status: "created",
    request_id: inserted.id,
    requested_at: inserted.requested_at,
  });
}

// GET /api/apps/radar/requests
//
// Lists the current user's pending + completed change requests so the
// Settings UI can show "you requested X on Y, status: pending".
export async function GET() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  const service = createServiceRoleClient();
  const { data: rows } = await service
    .from("radar_change_requests")
    .select("id, type, payload, status, requested_at, completed_at")
    .eq("user_id", user.id)
    .order("requested_at", { ascending: false })
    .limit(20);

  return Response.json({ requests: rows ?? [] });
}
