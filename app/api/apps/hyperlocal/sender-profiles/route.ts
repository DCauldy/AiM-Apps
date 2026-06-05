import { createClient, createServiceRoleClient } from "@/lib/supabase/server";
import { NextRequest } from "next/server";

export const dynamic = "force-dynamic";

const ALLOWED_FIELDS = [
  "full_name",
  "title",
  "brokerage",
  "phone",
  "reply_to_email",
  "license_number",
  "physical_address",
  "sign_off",
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
    .from("platform_sender_profiles")
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

  if (!payload.full_name || !payload.physical_address) {
    return Response.json(
      { error: "full_name and physical_address are required" },
      { status: 400 }
    );
  }

  const service = createServiceRoleClient();

  // If setting is_default, clear other defaults first
  if (payload.is_default) {
    await service
      .from("platform_sender_profiles")
      .update({ is_default: false })
      .eq("user_id", user.id);
  }

  const { data, error } = await service
    .from("platform_sender_profiles")
    .insert({ ...payload, user_id: user.id })
    .select()
    .single();

  if (error) return Response.json({ error: error.message }, { status: 500 });
  return Response.json({ profile: data });
}
