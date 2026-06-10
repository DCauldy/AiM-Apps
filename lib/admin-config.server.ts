import "server-only";

import { cache } from "react";

import { createServiceRoleClient } from "@/lib/supabase/server";
import { FEATURES } from "@/lib/feature-flags";
import { PROMPT_PACKS, type PromptPack } from "@/lib/prompt-packs";
import { BLOG_PACKS, type BlogPack } from "@/lib/blog-packs";
import { RADAR_PACKS, type RadarPack } from "@/lib/radar-packs";
import {
  HYPERLOCAL_PACKS,
  UNLIMITED,
  type HyperlocalPack,
} from "@/lib/hyperlocal-packs";
import {
  LISTING_STUDIO_PACKS,
  type ListingStudioPack,
} from "@/lib/listing-studio-packs";

// `cache()` dedupes within a single SSR render. Both the layout and the
// page often look up the same feature flag — wrapping collapses those to
// one admin_settings hit.
/** Read a single feature flag from admin_settings, falling back to env var */
export const getFeatureFlag = cache(async function getFeatureFlag(
  key: string,
): Promise<boolean> {
  try {
    const supabase = createServiceRoleClient();
    const { data } = await supabase
      .from("admin_settings")
      .select("value")
      .eq("key", key)
      .single();

    if (data) {
      return data.value === "true";
    }
  } catch {
    // DB unavailable — fall through to env var
  }

  if (key === "PROMPT_PACKS") return FEATURES.PROMPT_PACKS;
  if (key === "BLOG_ENGINE") return FEATURES.BLOG_ENGINE;
  if (key === "PROMPT_STUDIO") return FEATURES.PROMPT_STUDIO;
  if (key === "RADAR") return FEATURES.RADAR;
  if (key === "HYPERLOCAL") return FEATURES.HYPERLOCAL;
  if (key === "LISTING_STUDIO") return FEATURES.LISTING_STUDIO;
  return false;
});

/** Bulk read all feature flags from admin_settings */
export const getFeatureFlags = cache(async function getFeatureFlags(): Promise<
  Record<string, boolean>
> {
  try {
    const supabase = createServiceRoleClient();
    const { data } = await supabase.from("admin_settings").select("*");

    if (data && data.length > 0) {
      const flags: Record<string, boolean> = {};
      for (const row of data) {
        flags[row.key] = row.value === "true";
      }
      return flags;
    }
  } catch {
    // DB unavailable — fall through to env vars
  }

  return {
    PROMPT_PACKS: FEATURES.PROMPT_PACKS,
    BLOG_ENGINE: FEATURES.BLOG_ENGINE,
    PROMPT_STUDIO: FEATURES.PROMPT_STUDIO,
    RADAR: FEATURES.RADAR,
    HYPERLOCAL: FEATURES.HYPERLOCAL,
    LISTING_STUDIO: FEATURES.LISTING_STUDIO,
  };
});

/** Read prompt packs from DB, falling back to hardcoded array */
export async function getPromptPacks(): Promise<PromptPack[]> {
  try {
    const supabase = createServiceRoleClient();
    const { data } = await supabase
      .from("admin_pack_configs")
      .select("*")
      .eq("app", "prompt_studio")
      .eq("is_active", true)
      .order("sort_order");

    if (data && data.length > 0) {
      return data.map((row) => ({
        id: row.id,
        tier: row.tier ?? "",
        size: row.size ?? 0,
        priceCents: row.price_cents ?? 0,
        stripePriceId: row.stripe_price_id ?? "price_TODO",
        label: row.label ?? "",
        bestValue: row.best_value ?? false,
      }));
    }
  } catch {
    // DB unavailable — fall through
  }

  return PROMPT_PACKS;
}

/** Read blog packs from DB, falling back to hardcoded array */
export async function getBlogPacks(): Promise<BlogPack[]> {
  try {
    const supabase = createServiceRoleClient();
    const { data } = await supabase
      .from("admin_pack_configs")
      .select("*")
      .eq("app", "blog_engine")
      .eq("is_active", true)
      .order("sort_order");

    if (data && data.length > 0) {
      return data.map((row) => ({
        id: row.id,
        tier: row.tier ?? "",
        frequency: row.frequency ?? 0,
        priceCents: row.price_cents ?? 0,
        stripePriceId: row.stripe_price_id ?? "price_TODO",
        label: row.label ?? "",
        bestValue: row.best_value ?? false,
      }));
    }
  } catch {
    // DB unavailable — fall through
  }

  return BLOG_PACKS;
}

/** Read radar packs from DB, falling back to hardcoded array */
export async function getRadarPacks(): Promise<RadarPack[]> {
  try {
    const supabase = createServiceRoleClient();
    const { data } = await supabase
      .from("admin_pack_configs")
      .select("*")
      .eq("app", "radar")
      .eq("is_active", true)
      .order("sort_order");

    if (data && data.length > 0) {
      return data.map((row) => ({
        id: row.id,
        tier: row.tier ?? "",
        queryLimit: row.query_limit ?? 25,
        manualChecksLimit: row.manual_checks_limit ?? 0,
        auditsLimit: row.audits_limit ?? 1,
        monitoringFrequency: row.monitoring_frequency ?? "monthly",
        priceCents: row.price_cents ?? 0,
        stripePriceId: row.stripe_price_id ?? "price_TODO",
        label: row.label ?? "",
        bestValue: row.best_value ?? false,
      }));
    }
  } catch {
    // DB unavailable — fall through
  }

  return RADAR_PACKS;
}

/** Read hyperlocal packs from DB, falling back to hardcoded array */
export async function getHyperlocalPacks(): Promise<HyperlocalPack[]> {
  try {
    const supabase = createServiceRoleClient();
    const { data } = await supabase
      .from("admin_pack_configs")
      .select("*")
      .eq("app", "hyperlocal")
      .eq("is_active", true)
      .order("sort_order");

    if (data && data.length > 0) {
      return data.map((row) => ({
        id: row.id,
        tier: row.tier ?? "",
        campaignsPerMonth: row.campaigns_limit ?? 4,
        segmentsPerCampaign: row.segments_limit ?? 5,
        // -1 stored in DB means "unlimited" — coerce via the UNLIMITED sentinel.
        mlsHistoryMonths:
          (row.mls_history_months ?? 6) === -1 ? UNLIMITED : (row.mls_history_months ?? 6),
        aiChatEditsPerDraft:
          (row.ai_edits_limit ?? 10) === -1 ? UNLIMITED : (row.ai_edits_limit ?? 10),
        priceCents: row.price_cents ?? 0,
        stripePriceId: row.stripe_price_id ?? "price_TODO",
        label: row.label ?? "",
        bestValue: row.best_value ?? false,
      }));
    }
  } catch {
    // DB unavailable — fall through
  }

  return HYPERLOCAL_PACKS;
}

/** Read listing-studio packs from DB, falling back to hardcoded array */
export async function getListingStudioPacks(): Promise<ListingStudioPack[]> {
  try {
    const supabase = createServiceRoleClient();
    const { data } = await supabase
      .from("admin_pack_configs")
      .select("*")
      .eq("app", "listing_studio")
      .eq("is_active", true)
      .order("sort_order");

    if (data && data.length > 0) {
      return data.map((row) => ({
        id: row.id,
        tier: row.tier ?? "",
        activeListingsPerMonth:
          (row.active_listings_limit ?? 1) === -1
            ? UNLIMITED
            : (row.active_listings_limit ?? 1),
        cmaSoftLimit:
          (row.cma_soft_limit ?? 10) === -1 ? UNLIMITED : (row.cma_soft_limit ?? 10),
        priceCents: row.price_cents ?? 0,
        stripePriceId: row.stripe_price_id ?? "price_TODO",
        label: row.label ?? "",
        bestValue: row.best_value ?? false,
      }));
    }
  } catch {
    // DB unavailable — fall through
  }

  return LISTING_STUDIO_PACKS;
}
