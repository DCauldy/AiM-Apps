/**
 * Effective-profile adapters — bridge between the new platform_profiles
 * model and the legacy per-app profile tables during the transition.
 *
 * Apps call these instead of reading user_profiles / platform_sender_profiles /
 * platform_branding_profiles directly. Each adapter:
 *   1. Looks up profiles.active_profile_id.
 *   2. If set → reads from platform_profiles (the new unified table) and
 *      stitches in any app-specific extras (e.g. CTAs from legacy
 *      user_profiles, branding fonts, etc.).
 *   3. If null → reads from the legacy app tables exclusively.
 *
 * This means existing users with no active profile keep working with their
 * legacy data, and users who set up a platform_profile via /apps/profile
 * immediately start exercising the new path.
 *
 * After Phase 4 backfill, every user has active_profile_id set, so the
 * legacy fallback is dead code and can be removed.
 */

import { createServiceRoleClient } from "@/lib/supabase/server";
import type { BofuProfile } from "@/types/blog-engine";

// ---------------------------------------------------------------------------
// Blog Engine
// ---------------------------------------------------------------------------

/**
 * Returns a BofuProfile shape for Blog Engine consumers. App-specific extras
 * (CTAs, blog_tone, include_disclaimers) come from user_profiles in both
 * legacy and new paths — Phase 4 will move them onto bofu_schedules.
 */
export async function getProfileForBlogEngine(userId: string): Promise<BofuProfile | null> {
  const service = createServiceRoleClient();

  const { data: meta } = await service
    .from("profiles")
    .select("active_profile_id")
    .eq("id", userId)
    .single();

  // Legacy extras (CTAs, blog_tone, include_disclaimers) — still on user_profiles
  // until Phase 4 creates a proper home.
  const { data: legacy } = await service
    .from("user_profiles")
    .select("*")
    .eq("user_id", userId)
    .maybeSingle();

  if (!meta?.active_profile_id) {
    return (legacy as BofuProfile | null) ?? null;
  }

  const { data: profile } = await service
    .from("platform_profiles")
    .select("*")
    .eq("id", meta.active_profile_id)
    .eq("user_id", userId)
    .maybeSingle();

  if (!profile) {
    return (legacy as BofuProfile | null) ?? null;
  }

  // Stitch into a BofuProfile shape. Shared fields come from platform_profiles;
  // app-specific extras (CTAs, blog_tone, etc.) come from user_profiles if
  // present, otherwise sensible defaults.
  const stitched: BofuProfile = {
    id: profile.id,
    user_id: profile.user_id,
    professional_type: profile.professional_type ?? "solo_agent",
    full_name: profile.full_name ?? "",
    business_name: profile.brokerage ?? null,
    bio: profile.bio ?? null,
    country: profile.country ?? "United States",
    state: profile.state ?? "",
    metro_area: profile.metro_area ?? "",
    counties: profile.counties ?? [],
    neighborhoods: profile.neighborhoods ?? [],
    target_clients: profile.target_clients ?? [],
    property_types: profile.property_types ?? [],
    specializations: profile.specializations ?? [],
    website_url: profile.website_url ?? null,
    blog_url: profile.blog_url ?? null,
    seo_keywords: profile.seo_keywords ?? [],
    brand_colors: {
      primary: profile.primary_color,
      secondary: profile.secondary_color,
      accent: profile.accent_color,
    },
    logo_url: profile.logo_url ?? null,
    // App-specific extras: prefer legacy values, fall back to defaults.
    cta_primary: legacy?.cta_primary ?? null,
    cta_link: legacy?.cta_link ?? null,
    cta_secondary: legacy?.cta_secondary ?? null,
    cta_secondary_link: legacy?.cta_secondary_link ?? null,
    license_info: profile.license_info ?? null,
    regulatory_body: profile.regulatory_body ?? null,
    compliance_notes: profile.compliance_notes ?? null,
    blog_tone: (legacy?.blog_tone as BofuProfile["blog_tone"]) ?? "professional",
    include_disclaimers: legacy?.include_disclaimers ?? true,
    onboarding_completed: legacy?.onboarding_completed ?? true,
    onboarding_chat_thread_id: legacy?.onboarding_chat_thread_id ?? null,
    created_at: profile.created_at,
    updated_at: profile.updated_at,
  } as BofuProfile;

  return stitched;
}

// ---------------------------------------------------------------------------
// Hyperlocal
// ---------------------------------------------------------------------------

export interface HyperlocalSender {
  id: string;
  full_name: string;
  title: string | null;
  brokerage: string | null;
  phone: string | null;
  reply_to_email: string | null;
  license_number: string | null;
  physical_address: string;
  sign_off: string | null;
}

export interface HyperlocalBranding {
  id: string;
  name: string;
  primary_color: string;
  secondary_color: string;
  accent_color: string;
  heading_font: string;
  body_font: string;
  motifs: string | null;
  corner_style: string;
  button_shape: string;
  density: string;
  header_treatment: string;
  header_image_url: string | null;
  metric_box_style: string;
  divider_style: string;
  logo_url: string | null;
  headshot_url: string | null;
  brokerage_badge_url: string | null;
  legal_disclaimer: string | null;
}

/** Returns the user's effective sender + branding for outbound Hyperlocal email. */
export async function getProfileForHyperlocal(
  userId: string
): Promise<{ sender: HyperlocalSender | null; branding: HyperlocalBranding | null }> {
  const service = createServiceRoleClient();

  const { data: meta } = await service
    .from("profiles")
    .select("active_profile_id")
    .eq("id", userId)
    .single();

  if (!meta?.active_profile_id) {
    // Legacy path — read defaults from existing tables
    const [{ data: sender }, { data: branding }] = await Promise.all([
      service
        .from("platform_sender_profiles")
        .select("*")
        .eq("user_id", userId)
        .order("is_default", { ascending: false })
        .limit(1)
        .maybeSingle(),
      service
        .from("platform_branding_profiles")
        .select("*")
        .eq("user_id", userId)
        .order("is_default", { ascending: false })
        .limit(1)
        .maybeSingle(),
    ]);

    return {
      sender: sender ? (sender as HyperlocalSender) : null,
      branding: branding ? (branding as HyperlocalBranding) : null,
    };
  }

  // New path — derive sender and branding from platform_profiles
  const { data: profile } = await service
    .from("platform_profiles")
    .select("*")
    .eq("id", meta.active_profile_id)
    .eq("user_id", userId)
    .maybeSingle();

  if (!profile) return { sender: null, branding: null };

  const sender: HyperlocalSender | null = profile.physical_address
    ? {
        id: profile.id,
        full_name: profile.full_name ?? profile.display_name,
        title: profile.title,
        brokerage: profile.brokerage,
        phone: profile.phone,
        reply_to_email: profile.reply_to_email,
        license_number: profile.license_number,
        physical_address: profile.physical_address,
        sign_off: profile.sign_off,
      }
    : null;

  const branding: HyperlocalBranding = {
    id: profile.id,
    name: profile.display_name,
    primary_color: profile.primary_color,
    secondary_color: profile.secondary_color,
    accent_color: profile.accent_color,
    heading_font: profile.heading_font,
    body_font: profile.body_font,
    motifs: profile.motifs,
    corner_style: profile.corner_style,
    button_shape: profile.button_shape,
    density: profile.density,
    header_treatment: profile.header_treatment,
    header_image_url: profile.header_image_url,
    metric_box_style: profile.metric_box_style,
    divider_style: profile.divider_style,
    logo_url: profile.logo_url,
    headshot_url: profile.headshot_url,
    brokerage_badge_url: profile.brokerage_badge_url,
    legal_disclaimer: profile.legal_disclaimer,
  };

  return { sender, branding };
}

// ---------------------------------------------------------------------------
// Radar
// ---------------------------------------------------------------------------

export interface RadarIdentity {
  full_name: string | null;
  brokerage: string | null;
  metro_area: string | null;
  specializations: string[];
  website_url: string | null;
}

export async function getProfileForRadar(userId: string): Promise<RadarIdentity | null> {
  const service = createServiceRoleClient();

  const { data: meta } = await service
    .from("profiles")
    .select("active_profile_id")
    .eq("id", userId)
    .single();

  if (meta?.active_profile_id) {
    const { data: profile } = await service
      .from("platform_profiles")
      .select("full_name, brokerage, metro_area, specializations, website_url")
      .eq("id", meta.active_profile_id)
      .eq("user_id", userId)
      .maybeSingle();
    if (profile) return profile as RadarIdentity;
  }

  // Legacy fallback — Radar previously read identity from user_profiles
  const { data: legacy } = await service
    .from("user_profiles")
    .select("full_name, business_name, metro_area, specializations, website_url")
    .eq("user_id", userId)
    .maybeSingle();

  if (!legacy) return null;
  return {
    full_name: legacy.full_name ?? null,
    brokerage: legacy.business_name ?? null,
    metro_area: legacy.metro_area ?? null,
    specializations: legacy.specializations ?? [],
    website_url: legacy.website_url ?? null,
  };
}

// ---------------------------------------------------------------------------
// Prompt Studio — silent system context
// ---------------------------------------------------------------------------

/**
 * Returns a short paragraph describing the active profile, suitable for
 * silent injection into the system prompt of every Prompt Studio conversation.
 *
 * Returns null when there is no active profile or no usable identity data,
 * in which case the caller should inject nothing (legacy behavior).
 */
export async function getPromptStudioProfileContext(userId: string): Promise<string | null> {
  const service = createServiceRoleClient();

  const { data: meta } = await service
    .from("profiles")
    .select("active_profile_id")
    .eq("id", userId)
    .single();

  let identity: {
    full_name: string | null;
    brokerage: string | null;
    professional_type: string | null;
    metro_area: string | null;
    target_clients: string[] | null;
    specializations: string[] | null;
  } | null = null;

  if (meta?.active_profile_id) {
    const { data } = await service
      .from("platform_profiles")
      .select("full_name, brokerage, professional_type, metro_area, target_clients, specializations")
      .eq("id", meta.active_profile_id)
      .eq("user_id", userId)
      .maybeSingle();
    if (data) identity = data;
  }

  if (!identity) {
    const { data } = await service
      .from("user_profiles")
      .select("full_name, business_name, professional_type, metro_area, target_clients, specializations")
      .eq("user_id", userId)
      .maybeSingle();
    if (data) {
      identity = {
        full_name: data.full_name,
        brokerage: data.business_name,
        professional_type: data.professional_type,
        metro_area: data.metro_area,
        target_clients: data.target_clients,
        specializations: data.specializations,
      };
    }
  }

  if (!identity || !identity.full_name) return null;

  const parts: string[] = [];
  parts.push(`You are helping ${identity.full_name}`);
  if (identity.brokerage) parts.push(`at ${identity.brokerage}`);
  if (identity.professional_type) parts.push(`(${identity.professional_type.replace(/_/g, " ")})`);
  if (identity.metro_area) parts.push(`serving ${identity.metro_area}`);
  let sentence = parts.join(" ") + ".";

  if (identity.specializations && identity.specializations.length > 0) {
    sentence += ` Their specializations: ${identity.specializations.join(", ")}.`;
  }
  if (identity.target_clients && identity.target_clients.length > 0) {
    sentence += ` Their target clients: ${identity.target_clients.join(", ")}.`;
  }
  sentence += ` Keep responses on-brand and tuned for these specifics whenever relevant.`;
  return sentence;
}
