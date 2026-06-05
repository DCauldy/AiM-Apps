import { createClient, createServiceRoleClient } from "@/lib/supabase/server";
import { NextRequest } from "next/server";

export const dynamic = "force-dynamic";

const ALLOWED_FIELDS = [
  "name",
  "primary_color",
  "secondary_color",
  "accent_color",
  "heading_font",
  "body_font",
  "motifs",
  "corner_style",
  "button_shape",
  "density",
  "header_treatment",
  "header_image_url",
  "metric_box_style",
  "divider_style",
  "logo_url",
  "headshot_url",
  "brokerage_badge_url",
  "legal_disclaimer",
  "is_default",
] as const;

function pickAllowed(body: Record<string, unknown>) {
  const out: Record<string, unknown> = {};
  for (const k of ALLOWED_FIELDS) {
    if (k in body) out[k] = body[k];
  }
  return out;
}

export async function GET() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return Response.json({ error: "Unauthorized" }, { status: 401 });

  const { data, error } = await supabase
    .from("platform_branding_profiles")
    .select("*")
    .eq("user_id", user.id)
    .order("is_default", { ascending: false })
    .order("created_at", { ascending: false });

  if (error) return Response.json({ error: error.message }, { status: 500 });
  return Response.json({ profiles: data ?? [] });
}

export async function POST(req: NextRequest) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return Response.json({ error: "Unauthorized" }, { status: 401 });

  const body = await req.json();
  const payload = pickAllowed(body);

  const service = createServiceRoleClient();

  if (payload.is_default) {
    await service
      .from("platform_branding_profiles")
      .update({ is_default: false })
      .eq("user_id", user.id);
  }

  const { data, error } = await service
    .from("platform_branding_profiles")
    .insert({ ...payload, user_id: user.id })
    .select()
    .single();

  if (error) return Response.json({ error: error.message }, { status: 500 });
  return Response.json({ profile: data });
}
