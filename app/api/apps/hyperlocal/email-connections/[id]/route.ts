import { createClient, createServiceRoleClient } from "@/lib/supabase/server";
import { NextRequest } from "next/server";

export const dynamic = "force-dynamic";

const PUBLIC_FIELDS = `id, provider, email_address, display_name, is_active, is_default, resend_domain, resend_dkim_status, last_send_at, last_error, created_at, updated_at`;

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return Response.json({ error: "Unauthorized" }, { status: 401 });

  const body = await req.json();
  const update: Record<string, unknown> = {
    updated_at: new Date().toISOString(),
  };
  if (typeof body.display_name === "string") update.display_name = body.display_name;
  if (typeof body.is_active === "boolean") update.is_active = body.is_active;
  if (typeof body.is_default === "boolean") update.is_default = body.is_default;

  const service = createServiceRoleClient();

  // If setting default, clear other defaults first
  if (body.is_default === true) {
    await service
      .from("hl_email_connections")
      .update({ is_default: false })
      .eq("user_id", user.id);
  }

  const { data, error } = await service
    .from("hl_email_connections")
    .update(update)
    .eq("id", id)
    .eq("user_id", user.id)
    .select(PUBLIC_FIELDS)
    .single();

  if (error) return Response.json({ error: error.message }, { status: 500 });
  return Response.json({ connection: data });
}

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return Response.json({ error: "Unauthorized" }, { status: 401 });

  const { error } = await supabase
    .from("hl_email_connections")
    .delete()
    .eq("id", id)
    .eq("user_id", user.id);

  if (error) return Response.json({ error: error.message }, { status: 500 });
  return Response.json({ success: true });
}
