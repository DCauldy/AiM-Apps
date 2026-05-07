import "server-only";

import { createServiceRoleClient } from "@/lib/supabase/server";
import { FEATURES } from "@/lib/feature-flags";
import { PROMPT_PACKS, type PromptPack } from "@/lib/prompt-packs";
import { BLOG_PACKS, type BlogPack } from "@/lib/blog-packs";
import { RADAR_PACKS, type RadarPack } from "@/lib/radar-packs";

/** Read a single feature flag from admin_settings, falling back to env var */
export async function getFeatureFlag(key: string): Promise<boolean> {
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
  return false;
}

/** Bulk read all feature flags from admin_settings */
export async function getFeatureFlags(): Promise<Record<string, boolean>> {
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
  };
}

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
