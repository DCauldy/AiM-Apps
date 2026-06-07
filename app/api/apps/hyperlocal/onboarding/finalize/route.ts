import { createClient, createServiceRoleClient } from "@/lib/supabase/server";
import { NextRequest } from "next/server";

export const dynamic = "force-dynamic";

interface OnboardingDraft {
  full_name?: string | null;
  title?: string | null;
  brokerage?: string | null;
  phone?: string | null;
  reply_to_email?: string | null;
  license_number?: string | null;
  physical_address?: string | null;
  sign_off?: string | null;
  brand_name?: string | null;
  primary_color?: string | null;
}

/**
 * POST /api/apps/hyperlocal/onboarding/finalize
 * Body: { draft }
 *
 * Patches the user's active Profile with any sender/branding fields the chat
 * collected. The Profile-first guard on /apps/hyperlocal/onboarding ensures an
 * active profile exists before this endpoint is called.
 *
 * Replaces the older flow that wrote separate platform_sender_profiles +
 * platform_branding_profiles rows — those tables are being retired now that
 * the unified Profile owns sender identity and brand visuals.
 */
export async function POST(req: NextRequest) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return Response.json({ error: "Unauthorized" }, { status: 401 });

  const body = await req.json();
  const draft = (body.draft ?? {}) as OnboardingDraft;

  if (!draft.full_name?.trim() || !draft.physical_address?.trim()) {
    return Response.json(
      { error: "full_name and physical_address are both required" },
      { status: 400 }
    );
  }

  const service = createServiceRoleClient();

  const { data: meta } = await service
    .from("profiles")
    .select("active_profile_id")
    .eq("id", user.id)
    .single();

  if (!meta?.active_profile_id) {
    return Response.json(
      { error: "No active Profile. Create one at /apps/profile/new first." },
      { status: 400 }
    );
  }

  // Build a patch of only the fields the chat actually collected so we do not
  // clobber existing platform_profiles values with empty drafts.
  const patch: Record<string, unknown> = {
    updated_at: new Date().toISOString(),
  };
  const set = (key: string, value: string | null | undefined) => {
    if (value && value.trim().length > 0) patch[key] = value.trim();
  };
  set("full_name", draft.full_name);
  set("title", draft.title);
  set("brokerage", draft.brokerage);
  set("phone", draft.phone);
  set("reply_to_email", draft.reply_to_email);
  set("license_number", draft.license_number);
  set("physical_address", draft.physical_address);
  set("sign_off", draft.sign_off);

  if (draft.primary_color && /^#[0-9A-Fa-f]{6}$/.test(draft.primary_color.trim())) {
    patch.primary_color = draft.primary_color.trim();
  }
  if (draft.brand_name?.trim()) {
    patch.display_name = draft.brand_name.trim();
  }

  const { data: profile, error } = await service
    .from("platform_profiles")
    .update(patch)
    .eq("id", meta.active_profile_id)
    .select()
    .single();

  if (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }

  // Return the updated profile under the legacy {sender, branding} shape so
  // the OnboardingChat client does not have to change its expected payload.
  return Response.json({
    sender: {
      id: profile.id,
      full_name: profile.full_name ?? profile.display_name,
      title: profile.title,
      brokerage: profile.brokerage,
      phone: profile.phone,
      reply_to_email: profile.reply_to_email,
      license_number: profile.license_number,
      physical_address: profile.physical_address,
      sign_off: profile.sign_off,
      is_default: true,
    },
    branding: {
      id: profile.id,
      name: profile.display_name,
      primary_color: profile.primary_color,
      is_default: true,
    },
  });
}
