import { createClient, createServiceRoleClient } from "@/lib/supabase/server";
import { encrypt } from "@/lib/blog-engine/encryption";
import { NextRequest } from "next/server";

export const dynamic = "force-dynamic";

/** Valid user_profiles column names. */
const VALID_COLUMNS = new Set([
  "professional_type", "full_name", "business_name", "bio",
  "country", "state", "metro_area", "counties", "neighborhoods",
  "target_clients", "property_types", "specializations",
  "website_url", "blog_url", "seo_keywords", "brand_colors", "logo_url",
  "cta_primary", "cta_link", "cta_secondary", "cta_secondary_link",
  "license_info", "regulatory_body", "compliance_notes",
  "blog_tone", "include_disclaimers",
  "onboarding_completed", "onboarding_chat_thread_id",
]);

/**
 * Map human-readable field names from AI-generated confirmation cards
 * to actual database column names on user_profiles.
 */
const FIELD_NAME_MAP: Record<string, string> = {
  // Professional Type section
  "professional type": "professional_type",
  "business name": "business_name",
  "business/company name": "business_name",
  "company name": "business_name",
  "brokerage": "business_name",
  "brokerage/firm": "business_name",
  "firm": "business_name",

  // Market & Location section
  "country": "country",
  "state": "state",
  "states": "state",
  "state(s)": "state",
  "metro area": "metro_area",
  "metropolitan area": "metro_area",
  "metro": "metro_area",
  "city": "metro_area",
  "counties": "counties",
  "county": "counties",
  "neighborhoods": "neighborhoods",
  "neighborhood": "neighborhoods",
  "areas": "neighborhoods",
  "service areas": "neighborhoods",
  "key neighborhoods": "neighborhoods",
  "key neighborhoods/cities": "neighborhoods",
  "target neighborhoods": "neighborhoods",
  "cities": "neighborhoods",

  // Business Focus section
  "target clients": "target_clients",
  "target audience": "target_clients",
  "ideal clients": "target_clients",
  "client types": "target_clients",
  "primary clients": "target_clients",
  "clients": "target_clients",
  "property types": "property_types",
  "specializations": "specializations",
  "specialties": "specializations",
  "niche": "specializations",

  // Website & Blog section
  "website url": "website_url",
  "website": "website_url",
  "site url": "website_url",
  "main website url": "website_url",
  "main website": "website_url",
  "blog url": "blog_url",
  "blog": "blog_url",

  // Identity & SEO section
  "full name": "full_name",
  "name": "full_name",
  "author name": "full_name",
  "author": "full_name",
  "bio": "bio",
  "about": "bio",
  "seo keywords": "seo_keywords",
  "keywords": "seo_keywords",
  "target seo keywords": "seo_keywords",
  "brand colors": "brand_colors",
  "colors": "brand_colors",
  "primary brand color": "brand_colors",
  "logo url": "logo_url",
  "logo": "logo_url",

  // CTAs & Compliance section
  "primary cta": "cta_primary",
  "cta": "cta_primary",
  "cta text": "cta_primary",
  "call to action": "cta_primary",
  "preferred cta": "cta_primary",
  "preferred ctas": "cta_primary",
  "cta link": "cta_link",
  "cta url": "cta_link",
  "contact page url": "cta_link",
  "contact url": "cta_link",
  "secondary cta": "cta_secondary",
  "secondary cta link": "cta_secondary_link",
  "home valuation url": "cta_secondary_link",
  "license info": "license_info",
  "license": "license_info",
  "license number": "license_info",
  "regulatory body": "regulatory_body",
  "compliance notes": "compliance_notes",
  "compliance": "compliance_notes",
  "compliance requirements": "compliance_notes",
  "regulatory compliance": "compliance_notes",

  // Preferences
  "blog tone": "blog_tone",
  "tone": "blog_tone",
  "writing tone": "blog_tone",
  "include disclaimers": "include_disclaimers",
  "disclaimers": "include_disclaimers",
};

/**
 * Normalize enum values from AI-generated display text to database snake_case.
 * e.g. "Team Leader" → "team_leader", "Solo Agent" → "solo_agent"
 */
const ENUM_VALUES: Record<string, Record<string, string>> = {
  professional_type: {
    "solo agent": "solo_agent",
    "team leader": "team_leader",
    "team agent": "team_agent",
    "broker / owner": "broker_owner",
    "broker/owner": "broker_owner",
    "broker owner": "broker_owner",
    "loan officer": "loan_officer",
    "title executive": "title_executive",
  },
};

/** Fields with database CHECK constraints — map to default if value is invalid. */
const ENUM_DEFAULTS: Record<string, { valid: Set<string>; fallback: string }> = {
  professional_type: {
    valid: new Set(["solo_agent", "team_leader", "team_agent", "broker_owner", "loan_officer", "title_executive"]),
    fallback: "solo_agent",
  },
  blog_tone: {
    valid: new Set(["professional", "conversational", "authoritative"]),
    fallback: "professional",
  },
};

/**
 * Map AI-generated CMS field names to bofu_cms_connections columns.
 * The AI chat produces flat keys like "WordPress URL" or "App Password"
 * that don't match any user_profiles column — they need to be routed
 * to bofu_cms_connections instead.
 */
const CMS_FIELD_MAP: Record<string, string> = {
  "wordpress url": "wp_site_url",
  "wordpress site url": "wp_site_url",
  "wp site url": "wp_site_url",
  "wp url": "wp_site_url",
  "blog url": "wp_site_url",

  "wordpress username": "wp_username",
  "wp username": "wp_username",
  "username": "wp_username",

  "app password": "wp_app_password",
  "wordpress app password": "wp_app_password",
  "wp app password": "wp_app_password",
  "application password": "wp_app_password",

  "default post status": "wp_default_status",
  "post status": "wp_default_status",
  "default status": "wp_default_status",
  "publish status": "wp_default_status",

  "default category": "wp_default_category",
  "category": "wp_default_category",
  "wp category": "wp_default_category",

  "seo plugin": "wp_seo_plugin",
  "wordpress seo plugin": "wp_seo_plugin",
  "wp seo plugin": "wp_seo_plugin",
};

/**
 * Map AI-generated schedule field names to bofu_schedules columns.
 */
const SCHEDULE_FIELD_MAP: Record<string, string> = {
  "frequency": "frequency",
  "blogs per week": "frequency",
  "weekly frequency": "frequency",

  "active days": "active_days",
  "days": "active_days",
  "publish days": "active_days",
  "blog days": "active_days",
  "scheduled days": "active_days",

  "preferred time": "preferred_time",
  "time": "preferred_time",
  "publish time": "preferred_time",
  "time of day": "preferred_time",

  "timezone": "timezone",
  "time zone": "timezone",
};

/**
 * Extract CMS-related fields from the raw AI-generated data before
 * mapFieldsToColumns runs (which would silently drop them).
 * Returns { cmsFields, remainingFields }.
 */
function extractCmsFields(fields: Record<string, unknown>, section?: string): {
  cmsFields: Record<string, string>;
  remainingFields: Record<string, unknown>;
} {
  const cmsFields: Record<string, string> = {};
  const remainingFields: Record<string, unknown> = {};

  // Only extract CMS fields when processing the cms_connection section
  const isCmsSection = section === "cms_connection";

  for (const [key, value] of Object.entries(fields)) {
    const lowerKey = key.toLowerCase();
    const cmsColumn = isCmsSection ? CMS_FIELD_MAP[lowerKey] : undefined;
    if (cmsColumn && value != null && String(value).trim() !== "") {
      cmsFields[cmsColumn] = String(value).trim();
    } else {
      remainingFields[key] = value;
    }
  }

  return { cmsFields, remainingFields };
}

/**
 * Extract schedule-related fields from the raw AI-generated data before
 * mapFieldsToColumns runs (which would silently drop them).
 */
function extractScheduleFields(fields: Record<string, unknown>, section?: string): {
  scheduleFields: Record<string, unknown>;
  remainingFields: Record<string, unknown>;
} {
  const scheduleFields: Record<string, unknown> = {};
  const remainingFields: Record<string, unknown> = {};

  const isScheduleSection = section === "schedule";

  for (const [key, value] of Object.entries(fields)) {
    const lowerKey = key.toLowerCase();
    const scheduleColumn = isScheduleSection ? SCHEDULE_FIELD_MAP[lowerKey] : undefined;
    if (scheduleColumn && value != null) {
      scheduleFields[scheduleColumn] = value;
    } else {
      remainingFields[key] = value;
    }
  }

  return { scheduleFields, remainingFields };
}

/**
 * Normalize schedule field values from AI-generated text to database format.
 */
function normalizeScheduleFields(fields: Record<string, unknown>): Record<string, unknown> {
  const normalized: Record<string, unknown> = {};

  // Frequency: parse to number
  if (fields.frequency != null) {
    const freq = typeof fields.frequency === "number"
      ? fields.frequency
      : parseInt(String(fields.frequency), 10);
    normalized.frequency = isNaN(freq) ? 3 : freq;
  }

  // Active days: normalize to lowercase day names
  if (fields.active_days != null) {
    const validDays = new Set(["monday", "tuesday", "wednesday", "thursday", "friday", "saturday", "sunday"]);
    let days: string[];
    if (Array.isArray(fields.active_days)) {
      days = fields.active_days.map((d: unknown) => String(d).toLowerCase().trim());
    } else {
      days = String(fields.active_days).split(",").map((d) => d.toLowerCase().trim());
    }
    normalized.active_days = days.filter((d) => validDays.has(d));
    if ((normalized.active_days as string[]).length === 0) {
      normalized.active_days = ["monday", "wednesday", "friday"];
    }
  }

  // Preferred time: normalize to HH:MM
  if (fields.preferred_time != null) {
    const timeStr = String(fields.preferred_time).trim();
    // Match HH:MM, HH:MM AM/PM, or similar
    const match24 = timeStr.match(/^(\d{1,2}):(\d{2})$/);
    const matchAmPm = timeStr.match(/^(\d{1,2}):(\d{2})\s*(am|pm)$/i);
    if (match24) {
      normalized.preferred_time = timeStr;
    } else if (matchAmPm) {
      let hours = parseInt(matchAmPm[1], 10);
      const mins = matchAmPm[2];
      const period = matchAmPm[3].toLowerCase();
      if (period === "pm" && hours !== 12) hours += 12;
      if (period === "am" && hours === 12) hours = 0;
      normalized.preferred_time = `${String(hours).padStart(2, "0")}:${mins}`;
    } else {
      normalized.preferred_time = "08:00";
    }
  }

  // Timezone: pass through or default
  if (fields.timezone != null) {
    normalized.timezone = String(fields.timezone).trim();
  }

  return normalized;
}

/**
 * Calculate the next scheduled run time.
 */
function calculateNextRun(
  activeDays: string[],
  preferredTime: string,
): Date {
  const dayMap: Record<string, number> = {
    sunday: 0, monday: 1, tuesday: 2, wednesday: 3,
    thursday: 4, friday: 5, saturday: 6,
  };

  const [hours, minutes] = preferredTime.split(":").map(Number);
  const now = new Date();

  for (let offset = 0; offset < 7; offset++) {
    const candidate = new Date(now);
    candidate.setDate(candidate.getDate() + offset);

    const dayName = Object.entries(dayMap).find(
      ([, num]) => num === candidate.getDay()
    )?.[0];

    if (dayName && activeDays.includes(dayName)) {
      candidate.setHours(hours, minutes, 0, 0);
      if (candidate > now) {
        return candidate;
      }
    }
  }

  const fallback = new Date(now);
  fallback.setDate(fallback.getDate() + 1);
  fallback.setHours(hours, minutes, 0, 0);
  return fallback;
}

function normalizeValue(column: string, value: unknown): unknown {
  if (typeof value !== "string") return value;

  // Try explicit enum mapping first
  const enumMap = ENUM_VALUES[column];
  if (enumMap) {
    const mapped = enumMap[value.toLowerCase()];
    if (mapped) return mapped;
  }

  // For columns with CHECK constraints, normalize to snake_case
  const constraint = ENUM_DEFAULTS[column];
  if (constraint) {
    const normalized = value.toLowerCase().replace(/[\s/]+/g, "_");
    if (constraint.valid.has(normalized)) return normalized;
    // Try partial match (e.g. "professional and conversational" → "professional")
    const match = [...constraint.valid].find((v) => normalized.includes(v));
    return match || constraint.fallback;
  }

  // Free-text fields: preserve original value as-is
  return value;
}

/** Convert human-readable field names to database column names and normalize enum values.
 *  Drops any fields that don't resolve to a valid user_profiles column. */
function mapFieldsToColumns(fields: Record<string, unknown>): Record<string, unknown> {
  const mapped: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(fields)) {
    const lowerKey = key.toLowerCase();
    // Try explicit mapping first, then snake_case conversion, then raw key
    const columnName = FIELD_NAME_MAP[lowerKey]
      || (VALID_COLUMNS.has(lowerKey) ? lowerKey : null)
      || (VALID_COLUMNS.has(lowerKey.replace(/[\s/]+/g, "_")) ? lowerKey.replace(/[\s/]+/g, "_") : null);

    if (columnName) {
      mapped[columnName] = normalizeValue(columnName, value);
    } else {
      console.warn(`[profile] Skipping unknown field: "${key}"`);
    }
  }
  return mapped;
}

/**
 * Columns that belong on bofu_schedules (Blog Engine app-specific config),
 * not on the shared platform_profiles identity.
 */
const SCHEDULE_APP_COLUMNS = new Set([
  "cta_primary",
  "cta_link",
  "cta_secondary",
  "cta_secondary_link",
  "blog_tone",
  "include_disclaimers",
  "onboarding_completed",
  "onboarding_chat_thread_id",
]);

/**
 * Splits a fields object into per-destination updates. Also translates legacy
 * Blog Engine field names to their platform_profiles equivalents:
 *   business_name → brokerage
 *   brand_colors  → primary_color/secondary_color/accent_color
 */
function splitFieldsByTable(fields: Record<string, unknown>): {
  profileFields: Record<string, unknown>;
  scheduleAppFields: Record<string, unknown>;
} {
  const profileFields: Record<string, unknown> = {};
  const scheduleAppFields: Record<string, unknown> = {};

  for (const [key, value] of Object.entries(fields)) {
    if (SCHEDULE_APP_COLUMNS.has(key)) {
      scheduleAppFields[key] = value;
      continue;
    }
    if (key === "business_name") {
      profileFields.brokerage = value;
      continue;
    }
    if (key === "brand_colors") {
      const colors = value as { primary?: string; secondary?: string; accent?: string } | null | undefined;
      if (colors?.primary) profileFields.primary_color = colors.primary;
      if (colors?.secondary) profileFields.secondary_color = colors.secondary;
      if (colors?.accent) profileFields.accent_color = colors.accent;
      continue;
    }
    profileFields[key] = value;
  }

  return { profileFields, scheduleAppFields };
}

/**
 * GET /api/apps/blog-engine/profile
 *
 * Returns a unified Blog Engine profile shape stitching platform_profiles
 * (shared identity) + bofu_schedules (Blog Engine app-specific extras).
 * Maintains the legacy response shape so existing settings UI keeps working.
 */
export async function GET() {
  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return Response.json({ error: "Unauthorized" }, { status: 401 });

    const { data: meta } = await supabase
      .from("profiles")
      .select("active_profile_id")
      .eq("id", user.id)
      .single();

    const [{ data: profileRow }, { data: schedule }] = await Promise.all([
      meta?.active_profile_id
        ? supabase
            .from("platform_profiles")
            .select("*")
            .eq("id", meta.active_profile_id)
            .maybeSingle()
        : Promise.resolve({ data: null }),
      supabase
        .from("bofu_schedules")
        .select("cta_primary, cta_link, cta_secondary, cta_secondary_link, blog_tone, include_disclaimers, onboarding_completed, onboarding_chat_thread_id")
        .eq("user_id", user.id)
        .maybeSingle(),
    ]);

    const profile = profileRow
      ? {
          ...profileRow,
          // Translate platform_profiles fields back to the legacy shape so
          // existing UI code reading `business_name` and `brand_colors` still works.
          business_name: profileRow.brokerage,
          brand_colors: {
            primary: profileRow.primary_color,
            secondary: profileRow.secondary_color,
            accent: profileRow.accent_color,
          },
          // Overlay the Blog Engine app-specific extras.
          cta_primary: schedule?.cta_primary ?? null,
          cta_link: schedule?.cta_link ?? null,
          cta_secondary: schedule?.cta_secondary ?? null,
          cta_secondary_link: schedule?.cta_secondary_link ?? null,
          blog_tone: schedule?.blog_tone ?? "professional",
          include_disclaimers: schedule?.include_disclaimers ?? true,
          onboarding_completed: schedule?.onboarding_completed ?? false,
          onboarding_chat_thread_id: schedule?.onboarding_chat_thread_id ?? null,
        }
      : null;

    return Response.json({ profile });
  } catch (error: unknown) {
    const message =
      error instanceof Error ? error.message : "Internal server error";
    return Response.json({ error: message }, { status: 500 });
  }
}

/**
 * POST /api/apps/blog-engine/profile
 * Create or update the Blog Engine profile (upsert).
 * Used during onboarding to save confirmed section data.
 */
export async function POST(req: NextRequest) {
  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return Response.json({ error: "Unauthorized" }, { status: 401 });

    const body = await req.json();
    const { section, complete } = body;

    // Extract CMS and schedule fields before mapping — mapFieldsToColumns would drop them
    const { cmsFields, remainingFields: afterCms } = extractCmsFields(body.fields || {}, section);
    const { scheduleFields, remainingFields } = extractScheduleFields(afterCms, section);
    const fields = mapFieldsToColumns(remainingFields);

    const serviceClient = createServiceRoleClient();

    // Find the user's active platform_profile — required before chat onboarding
    // can write anything. The Profile-first guard on /apps/blog-engine/onboarding
    // ensures this exists.
    const { data: userMeta } = await serviceClient
      .from("profiles")
      .select("active_profile_id")
      .eq("id", user.id)
      .single();

    if (!userMeta?.active_profile_id) {
      return Response.json(
        { error: "No active Profile. Create one at /apps/profile/new first." },
        { status: 400 }
      );
    }

    const { profileFields, scheduleAppFields } = splitFieldsByTable(fields);
    if (complete) scheduleAppFields.onboarding_completed = true;

    // Update platform_profiles with the shared identity fields, if any
    if (Object.keys(profileFields).length > 0) {
      const { error: profileError } = await serviceClient
        .from("platform_profiles")
        .update({ ...profileFields, updated_at: new Date().toISOString() })
        .eq("id", userMeta.active_profile_id);

      if (profileError) {
        console.error("Failed to update platform_profile:", profileError);
        return Response.json(
          { error: "Failed to update profile", details: profileError.message },
          { status: 500 }
        );
      }
    }

    // Upsert bofu_schedules with the Blog Engine app-specific extras.
    // We always upsert (not update) so a chat onboarding write before the
    // schedule section bootstraps the row with sane defaults.
    if (Object.keys(scheduleAppFields).length > 0) {
      const { error: scheduleAppError } = await serviceClient
        .from("bofu_schedules")
        .upsert(
          {
            user_id: user.id,
            profile_id: userMeta.active_profile_id,
            ...scheduleAppFields,
            updated_at: new Date().toISOString(),
          },
          { onConflict: "user_id" }
        );

      if (scheduleAppError) {
        console.error("Failed to upsert Blog Engine extras on bofu_schedules:", scheduleAppError);
        return Response.json(
          { error: "Failed to update Blog Engine extras", details: scheduleAppError.message },
          { status: 500 }
        );
      }
    }

    // If CMS fields were extracted (either from flat AI fields or section marker),
    // insert into bofu_cms_connections with encryption.
    if (section === "cms_connection" && Object.keys(cmsFields).length > 0 && cmsFields.wp_site_url) {
      const connectionData: Record<string, unknown> = {
        user_id: user.id,
        platform: "wordpress",
        wp_site_url: cmsFields.wp_site_url,
        wp_username: cmsFields.wp_username || null,
        wp_app_password_encrypted: cmsFields.wp_app_password
          ? encrypt(cmsFields.wp_app_password)
          : null,
        wp_default_status: cmsFields.wp_default_status || "draft",
        wp_default_category: cmsFields.wp_default_category || null,
        wp_seo_plugin: cmsFields.wp_seo_plugin || "none",
      };

      const { error: cmsError } = await serviceClient
        .from("bofu_cms_connections")
        .insert(connectionData);

      if (cmsError) {
        console.error("Failed to save CMS connection:", cmsError);
      }
    }

    // If this was the schedule section, save to bofu_schedules
    if (section === "schedule" && Object.keys(scheduleFields).length > 0) {
      const normalized = normalizeScheduleFields(scheduleFields);
      const activeDays = (normalized.active_days as string[]) || ["monday", "wednesday", "friday"];
      const preferredTime = (normalized.preferred_time as string) || "08:00";
      const nextRunAt = calculateNextRun(activeDays, preferredTime);

      const { error: scheduleError } = await serviceClient
        .from("bofu_schedules")
        .upsert(
          {
            user_id: user.id,
            frequency: normalized.frequency || 3,
            active_days: activeDays,
            preferred_time: preferredTime,
            timezone: (normalized.timezone as string) || "America/New_York",
            is_active: true,
            next_run_at: nextRunAt.toISOString(),
            updated_at: new Date().toISOString(),
          },
          { onConflict: "user_id" }
        );

      if (scheduleError) {
        console.error("Failed to save schedule:", scheduleError);
      }
    }

    return Response.json({ success: true, section });
  } catch (error: unknown) {
    const message =
      error instanceof Error ? error.message : "Internal server error";
    return Response.json({ error: message }, { status: 500 });
  }
}

/**
 * PUT /api/apps/blog-engine/profile
 *
 * Full profile update from the Blog Engine settings page. Splits the body
 * into platform_profiles updates (shared identity) + bofu_schedules updates
 * (CTAs, blog_tone, include_disclaimers) and writes both in parallel.
 */
export async function PUT(req: NextRequest) {
  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return Response.json({ error: "Unauthorized" }, { status: 401 });

    const body = await req.json();
    const serviceClient = createServiceRoleClient();

    const { data: userMeta } = await serviceClient
      .from("profiles")
      .select("active_profile_id")
      .eq("id", user.id)
      .single();

    if (!userMeta?.active_profile_id) {
      return Response.json(
        { error: "No active Profile. Create one at /apps/profile/new first." },
        { status: 400 }
      );
    }

    const { profileFields, scheduleAppFields } = splitFieldsByTable(body);

    const [profileResult, scheduleResult] = await Promise.all([
      Object.keys(profileFields).length > 0
        ? serviceClient
            .from("platform_profiles")
            .update({ ...profileFields, updated_at: new Date().toISOString() })
            .eq("id", userMeta.active_profile_id)
        : Promise.resolve({ error: null }),
      Object.keys(scheduleAppFields).length > 0
        ? serviceClient
            .from("bofu_schedules")
            .upsert(
              {
                user_id: user.id,
                profile_id: userMeta.active_profile_id,
                ...scheduleAppFields,
                updated_at: new Date().toISOString(),
              },
              { onConflict: "user_id" }
            )
        : Promise.resolve({ error: null }),
    ]);

    const error = profileResult.error || scheduleResult.error;

    if (error) {
      return Response.json(
        { error: "Failed to update profile", details: error.message },
        { status: 500 }
      );
    }

    return Response.json({ success: true });
  } catch (error: unknown) {
    const message =
      error instanceof Error ? error.message : "Internal server error";
    return Response.json({ error: message }, { status: 500 });
  }
}
