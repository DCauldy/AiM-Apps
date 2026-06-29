import { createClient, createServiceRoleClient } from "@/lib/supabase/server";
import { NextRequest } from "next/server";

export const dynamic = "force-dynamic";

export async function GET() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return Response.json({ error: "Unauthorized" }, { status: 401 });

  const { data, error } = await supabase
    .from("hl_suppressions")
    .select("*")
    .eq("user_id", user.id)
    .order("added_at", { ascending: false });

  if (error) return Response.json({ error: error.message }, { status: 500 });
  return Response.json({ suppressions: data ?? [] });
}

export async function POST(req: NextRequest) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return Response.json({ error: "Unauthorized" }, { status: 401 });

  const body = await req.json();
  const email = String(body.email ?? "").trim().toLowerCase();
  if (!email) {
    return Response.json({ error: "email is required" }, { status: 400 });
  }

  const service = createServiceRoleClient();
  const { error } = await service
    .from("hl_suppressions")
    .upsert(
      {
        user_id: user.id,
        email,
        reason: "manual",
      },
      { onConflict: "user_id,email" }
    );

  if (error) return Response.json({ error: error.message }, { status: 500 });
  return Response.json({ success: true });
}

export async function DELETE(req: NextRequest) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return Response.json({ error: "Unauthorized" }, { status: 401 });

  const url = new URL(req.url);
  const email = url.searchParams.get("email");
  if (!email) {
    return Response.json({ error: "email query param is required" }, { status: 400 });
  }

  const { error } = await supabase
    .from("hl_suppressions")
    .delete()
    .eq("user_id", user.id)
    .eq("email", email.toLowerCase());

  if (error) return Response.json({ error: error.message }, { status: 500 });
  return Response.json({ success: true });
}
