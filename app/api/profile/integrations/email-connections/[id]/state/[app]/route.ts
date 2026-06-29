import { NextRequest } from "next/server";
import { createClient, createServiceRoleClient } from "@/lib/supabase/server";
import { updateAppEmailState } from "@/lib/platform/connections";
import type { AppSlug } from "@/types/platform-connections";

export const dynamic = "force-dynamic";

const ALLOWED_APPS: ReadonlySet<AppSlug> = new Set([
  "hyperlocal",
  "listing_studio",
]);

/**
 * PATCH /api/profile/integrations/email-connections/[id]/state/[app]
 *
 * Updates the per-app state on an email connection — is_default
 * toggle, paused, send-health write-backs. Powers the inline default
 * toggle on the profile Mail tab.
 *
 * Body: { is_default?, paused?, paused_reason?, paused_at? }
 *
 * Single-default invariant is enforced inside updateAppEmailState
 * (sibling defaults under the same app + user demote to false).
 */
export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string; app: string }> },
) {
  const { id, app } = await params;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return Response.json({ error: "Unauthorized" }, { status: 401 });

  if (!ALLOWED_APPS.has(app as AppSlug)) {
    return Response.json(
      { error: "app must be one of: hyperlocal, listing_studio" },
      { status: 400 },
    );
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return Response.json({ error: "Invalid JSON body" }, { status: 400 });
  }
  const { is_default, paused, paused_reason, paused_at } = (body ?? {}) as {
    is_default?: boolean;
    paused?: boolean;
    paused_reason?: string | null;
    paused_at?: string | null;
  };

  const service = createServiceRoleClient();
  const slug = app as AppSlug;

  const result =
    slug === "hyperlocal"
      ? await updateAppEmailState(service, user.id, "hyperlocal", id, {
          isDefault: is_default,
          paused,
          pausedReason: paused_reason,
          pausedAt: paused_at,
        })
      : await updateAppEmailState(service, user.id, "listing_studio", id, {
          isDefault: is_default,
          paused,
          pausedReason: paused_reason,
          pausedAt: paused_at,
        });

  if (!result) {
    return Response.json(
      { error: "Connection not found or not wired into this app" },
      { status: 404 },
    );
  }
  return Response.json({ connection: result });
}
