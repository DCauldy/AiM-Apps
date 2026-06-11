import { NextRequest } from "next/server";
import { createClient, createServiceRoleClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

const PUBLIC_FIELDS = `
  id, profile_id, provider, email_address, display_name,
  is_active, is_default,
  resend_domain, resend_dkim_status, resend_webhook_id,
  provider_metadata,
  last_send_at, last_error,
  created_at, updated_at
`;

/**
 * PATCH /api/apps/listing-studio/email-connections/[id]
 *
 * Updates non-credential fields on an email connection (display_name,
 * is_active, is_default). Credentials rotate through provider-specific
 * routes that own their verification step.
 *
 * Setting is_default = true on this row clears it on every other
 * connection owned by the same user — only one default at a time.
 */
export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return Response.json({ error: "Unauthorized" }, { status: 401 });

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return Response.json({ error: "Invalid JSON body" }, { status: 400 });
  }
  const { display_name, is_active, is_default } = (body ?? {}) as {
    display_name?: string;
    is_active?: boolean;
    is_default?: boolean;
  };

  const update: Record<string, unknown> = {
    updated_at: new Date().toISOString(),
  };
  if (display_name !== undefined) update.display_name = display_name;
  if (is_active !== undefined) update.is_active = is_active;
  if (is_default !== undefined) update.is_default = is_default;

  const service = createServiceRoleClient();

  // Single-default invariant: when promoting one row to default, demote
  // any sibling defaults. Skipped when is_default is being explicitly
  // set to false (or not changing).
  if (is_default === true) {
    await service
      .from("cma_email_connections")
      .update({ is_default: false, updated_at: new Date().toISOString() })
      .eq("user_id", user.id)
      .eq("is_default", true)
      .neq("id", id);
  }

  const { data, error } = await service
    .from("cma_email_connections")
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
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return Response.json({ error: "Unauthorized" }, { status: 401 });

  // If this row is the user's default email connection, refuse to
  // delete — there's no fallback for the cadence scheduler. Agent
  // must promote another connection to default first.
  const { data: row } = await supabase
    .from("cma_email_connections")
    .select("is_default")
    .eq("id", id)
    .eq("user_id", user.id)
    .maybeSingle();
  if (row?.is_default) {
    return Response.json(
      {
        error:
          "Cannot delete the default email connection. Promote another connection to default first.",
      },
      { status: 409 },
    );
  }

  const { error } = await supabase
    .from("cma_email_connections")
    .delete()
    .eq("id", id)
    .eq("user_id", user.id);

  if (error) return Response.json({ error: error.message }, { status: 500 });
  return Response.json({ success: true });
}
