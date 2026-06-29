import { createServiceRoleClient } from "@/lib/supabase/server";
import type { PlatformProfile, ActiveProfileSummary, UserProfileSlotState } from "@/types/platform-profile";

/**
 * Server-side helpers for the unified profile system.
 *
 * All functions take an explicit userId so they're callable from API routes
 * (which authenticated the user) as well as Inngest functions, webhooks, and
 * the middleware. None of them call auth.getUser() themselves.
 */

/** Fields that are safe to accept from client POST/PATCH bodies. */
export const PROFILE_WRITABLE_FIELDS = [
  "display_name",
  "full_name",
  "title",
  "professional_type",
  "brokerage",
  "bio",
  "country",
  "state",
  "metro_area",
  "counties",
  "neighborhoods",
  "target_clients",
  "specializations",
  "property_types",
  "phone",
  "reply_to_email",
  "physical_address",
  "sign_off",
  "license_number",
  "license_info",
  "regulatory_body",
  "compliance_notes",
  "legal_disclaimer",
  "website_url",
  "blog_url",
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
  "seo_keywords",
] as const;

export function pickProfileFields(body: Record<string, unknown>) {
  const out: Record<string, unknown> = {};
  for (const k of PROFILE_WRITABLE_FIELDS) {
    if (k in body) out[k] = body[k];
  }
  return out;
}

/** Active + archived profiles for a user, default first. */
export async function listUserProfiles(userId: string): Promise<PlatformProfile[]> {
  const service = createServiceRoleClient();
  const { data, error } = await service
    .from("platform_profiles")
    .select("*")
    .eq("user_id", userId)
    .order("is_default", { ascending: false })
    .order("archived_at", { ascending: true, nullsFirst: true })
    .order("created_at", { ascending: true });
  if (error) throw error;
  return (data ?? []) as PlatformProfile[];
}

/** Read user's slot state from public.profiles. */
export async function getSlotState(userId: string): Promise<UserProfileSlotState> {
  const service = createServiceRoleClient();
  const { data, error } = await service
    .from("profiles")
    .select("active_profile_id, profile_slot_count, slot_grace_period_ends_at")
    .eq("id", userId)
    .single();
  if (error) throw error;
  return data as UserProfileSlotState;
}

/** How many non-archived profiles the user currently has. */
export async function countActiveProfiles(userId: string): Promise<number> {
  const service = createServiceRoleClient();
  const { count, error } = await service
    .from("platform_profiles")
    .select("id", { count: "exact", head: true })
    .eq("user_id", userId)
    .is("archived_at", null);
  if (error) throw error;
  return count ?? 0;
}

/** Set user's active profile pointer on public.profiles. */
export async function setActiveProfile(userId: string, profileId: string): Promise<void> {
  const service = createServiceRoleClient();
  const { error } = await service
    .from("profiles")
    .update({ active_profile_id: profileId, updated_at: new Date().toISOString() })
    .eq("id", userId);
  if (error) throw error;
}

/** Mark exactly one profile as the user's default. Clears the flag from others. */
export async function setDefaultProfile(userId: string, profileId: string): Promise<void> {
  const service = createServiceRoleClient();

  // Clear any existing defaults for this user
  await service
    .from("platform_profiles")
    .update({ is_default: false, updated_at: new Date().toISOString() })
    .eq("user_id", userId)
    .eq("is_default", true);

  // Set the new default
  const { error } = await service
    .from("platform_profiles")
    .update({ is_default: true, updated_at: new Date().toISOString() })
    .eq("id", profileId)
    .eq("user_id", userId);
  if (error) throw error;
}

/** Fetch the user's currently-active profile, if any. */
export async function getActiveProfile(userId: string): Promise<PlatformProfile | null> {
  const slot = await getSlotState(userId);
  if (!slot.active_profile_id) return null;

  const service = createServiceRoleClient();
  const { data, error } = await service
    .from("platform_profiles")
    .select("*")
    .eq("id", slot.active_profile_id)
    .eq("user_id", userId)
    .maybeSingle();
  if (error) throw error;
  return (data ?? null) as PlatformProfile | null;
}

/** Slim active-profile summary for chrome rendering. */
export async function getActiveProfileSummary(userId: string): Promise<ActiveProfileSummary | null> {
  const slot = await getSlotState(userId);
  if (!slot.active_profile_id) return null;

  const service = createServiceRoleClient();
  const { data, error } = await service
    .from("platform_profiles")
    .select("id, display_name, brokerage, logo_url, primary_color, accent_color")
    .eq("id", slot.active_profile_id)
    .eq("user_id", userId)
    .maybeSingle();
  if (error) throw error;
  return (data ?? null) as ActiveProfileSummary | null;
}

/** Whether the user can create one more profile under their current slot count. */
export async function canCreateProfile(userId: string): Promise<{ allowed: boolean; reason?: string; slotCount: number; activeCount: number }> {
  const [slot, activeCount] = await Promise.all([getSlotState(userId), countActiveProfiles(userId)]);
  if (activeCount >= slot.profile_slot_count) {
    return {
      allowed: false,
      reason: `You have ${activeCount} of ${slot.profile_slot_count} profile slots used. Upgrade to add another.`,
      slotCount: slot.profile_slot_count,
      activeCount,
    };
  }
  return { allowed: true, slotCount: slot.profile_slot_count, activeCount };
}
