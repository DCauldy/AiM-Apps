import { createClient, createServiceRoleClient } from "@/lib/supabase/server";
import { isAdminUser } from "@/lib/admin";

export const dynamic = "force-dynamic";

export async function GET() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user || !isAdminUser(user)) {
    return Response.json({ error: "Forbidden" }, { status: 403 });
  }

  const serviceClient = createServiceRoleClient();
  const { data, error } = await serviceClient
    .from("admin_settings")
    .select("*")
    .order("key");

  if (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }

  return Response.json(data);
}

export async function PATCH(req: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user || !isAdminUser(user)) {
    return Response.json({ error: "Forbidden" }, { status: 403 });
  }

  const { key, value } = await req.json();

  if (!key || typeof value !== "string") {
    return Response.json({ error: "key and value are required" }, { status: 400 });
  }

  const serviceClient = createServiceRoleClient();
  const { data, error } = await serviceClient
    .from("admin_settings")
    .upsert(
      {
        key,
        value,
        updated_at: new Date().toISOString(),
        updated_by: user.id,
      },
      { onConflict: "key" }
    )
    .select()
    .single();

  if (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }

  return Response.json(data);
}
