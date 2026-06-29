import { NextRequest } from "next/server";
import { createClient, createServiceRoleClient } from "@/lib/supabase/server";
import {
  deletePlatformEmailConnection,
  getAppEmailConnection,
  updateAppEmailState,
} from "@/lib/platform/connections";

export const dynamic = "force-dynamic";

/**
 * PATCH /api/apps/listing-studio/email-connections/[id]
 *
 * Updates non-credential fields. is_active toggles the shared
 * platform-level flag (gates send across all apps), is_default toggles
 * the per-app default; the helper enforces the single-default
 * invariant. display_name lives on the platform row — the helper
 * doesn't expose it directly, so we skip it for now (display_name
 * edits aren't reachable from the current UI; can re-add if needed).
 *
 * NB: Wave 11 will revisit the display_name update path once the UI
 * is refactored to the joined shape.
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

  const service = createServiceRoleClient();

  // display_name lives on the platform_email_connections row. The
  // helper doesn't expose a platform-side patch for it, so handle the
  // direct update here while routing the state fields through the
  // helper.
  if (display_name !== undefined) {
    await service
      .from("platform_email_connections")
      .update({
        display_name,
        updated_at: new Date().toISOString(),
      })
      .eq("id", id)
      .eq("user_id", user.id);
  }

  const connection = await updateAppEmailState(
    service,
    user.id,
    "listing_studio",
    id,
    {
      isActive: is_active,
      isDefault: is_default,
    },
  );

  if (!connection) {
    return Response.json({ error: "Not found" }, { status: 404 });
  }
  return Response.json({ connection });
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

  const service = createServiceRoleClient();

  // If this row is the user's default email connection, refuse to
  // delete — there's no fallback for the cadence scheduler. Agent
  // must promote another connection to default first.
  const existing = await getAppEmailConnection(
    service,
    user.id,
    "listing_studio",
    id,
  );
  if (!existing) {
    return Response.json({ error: "Not found" }, { status: 404 });
  }
  if (existing.state.is_default) {
    return Response.json(
      {
        error:
          "Cannot delete the default email connection. Promote another connection to default first.",
      },
      { status: 409 },
    );
  }

  await deletePlatformEmailConnection(service, user.id, id);
  return Response.json({ success: true });
}
