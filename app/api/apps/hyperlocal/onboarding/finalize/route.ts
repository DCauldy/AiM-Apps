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
 * Creates a default sender profile + branding profile from the chat-extracted
 * draft. Idempotent in the sense that re-finalizing creates new rows rather
 * than dedup-merging — the user can clean up duplicates in Settings.
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
      {
        error: "full_name and physical_address are both required",
      },
      { status: 400 }
    );
  }

  const service = createServiceRoleClient();

  // Promote to default sender if user has none yet
  const { count: existingSenders } = await service
    .from("platform_sender_profiles")
    .select("*", { count: "exact", head: true })
    .eq("user_id", user.id);

  const { data: sender, error: senderErr } = await service
    .from("platform_sender_profiles")
    .insert({
      user_id: user.id,
      full_name: draft.full_name.trim(),
      title: draft.title?.trim() || null,
      brokerage: draft.brokerage?.trim() || null,
      phone: draft.phone?.trim() || null,
      reply_to_email: draft.reply_to_email?.trim() || null,
      license_number: draft.license_number?.trim() || null,
      physical_address: draft.physical_address.trim(),
      sign_off: draft.sign_off?.trim() || "Talk soon,",
      is_default: (existingSenders ?? 0) === 0,
    })
    .select()
    .single();
  if (senderErr) {
    return Response.json({ error: senderErr.message }, { status: 500 });
  }

  // Optional default branding profile
  let branding = null;
  if (draft.brand_name?.trim() || draft.primary_color?.trim()) {
    const { count: existingBrands } = await service
      .from("platform_branding_profiles")
      .select("*", { count: "exact", head: true })
      .eq("user_id", user.id);

    const primary =
      draft.primary_color &&
      /^#[0-9A-Fa-f]{6}$/.test(draft.primary_color.trim())
        ? draft.primary_color.trim()
        : "#1B7FB5";

    const { data, error: brandErr } = await service
      .from("platform_branding_profiles")
      .insert({
        user_id: user.id,
        name: draft.brand_name?.trim() || "Default",
        primary_color: primary,
        is_default: (existingBrands ?? 0) === 0,
      })
      .select()
      .single();
    if (brandErr) {
      return Response.json({ error: brandErr.message }, { status: 500 });
    }
    branding = data;
  }

  return Response.json({ sender, branding });
}
