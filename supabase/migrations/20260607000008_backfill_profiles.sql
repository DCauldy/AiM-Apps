-- ============================================================
-- Phase 4 backfill — create platform_profiles rows for users with
-- pre-existing legacy data, mark default + active, and populate
-- profile_id on every app-scoped table.
--
-- Conflict resolution (per PROFILE_RESTRUCTURE_PLAN.md):
-- - Hyperlocal wins for contact/brand (phone, address, license,
--   colors, fonts, logos).
-- - Blog Engine wins for market/focus (state, metro, neighborhoods,
--   target clients, specializations, professional_type).
--
-- Idempotent: skips users who already have a platform_profile.
-- Reversible through every step before the legacy-table-drop migration
-- that ships separately.
-- ============================================================

DO $$
DECLARE
  u RECORD;
  new_profile_id UUID;
  has_user_profile BOOLEAN;
  has_sender_profile BOOLEAN;
  has_branding_profile BOOLEAN;
  has_radar_config BOOLEAN;
  sender_row platform_sender_profiles%ROWTYPE;
  branding_row platform_branding_profiles%ROWTYPE;
  bofu_row user_profiles%ROWTYPE;
BEGIN
  FOR u IN
    SELECT DISTINCT user_id
    FROM (
      SELECT user_id FROM user_profiles
      UNION
      SELECT user_id FROM platform_sender_profiles
      UNION
      SELECT user_id FROM platform_branding_profiles
      UNION
      SELECT user_id FROM radar_config
    ) AS u_all
    -- Skip users who already have a platform_profile (idempotency)
    WHERE NOT EXISTS (
      SELECT 1 FROM platform_profiles pp WHERE pp.user_id = u_all.user_id
    )
  LOOP
    SELECT EXISTS (SELECT 1 FROM user_profiles WHERE user_id = u.user_id) INTO has_user_profile;
    SELECT EXISTS (SELECT 1 FROM platform_sender_profiles WHERE user_id = u.user_id) INTO has_sender_profile;
    SELECT EXISTS (SELECT 1 FROM platform_branding_profiles WHERE user_id = u.user_id) INTO has_branding_profile;
    SELECT EXISTS (SELECT 1 FROM radar_config WHERE user_id = u.user_id) INTO has_radar_config;

    -- Load the rows we will stitch from
    IF has_user_profile THEN
      SELECT * INTO bofu_row FROM user_profiles WHERE user_id = u.user_id LIMIT 1;
    END IF;
    IF has_sender_profile THEN
      SELECT * INTO sender_row FROM platform_sender_profiles
        WHERE user_id = u.user_id
        ORDER BY is_default DESC, created_at ASC
        LIMIT 1;
    END IF;
    IF has_branding_profile THEN
      SELECT * INTO branding_row FROM platform_branding_profiles
        WHERE user_id = u.user_id
        ORDER BY is_default DESC, created_at ASC
        LIMIT 1;
    END IF;

    -- Stitch one platform_profile per user.
    INSERT INTO platform_profiles (
      user_id,
      display_name,
      is_default,
      full_name,
      title,
      professional_type,
      brokerage,
      bio,
      country,
      state,
      metro_area,
      counties,
      neighborhoods,
      target_clients,
      specializations,
      property_types,
      phone,
      reply_to_email,
      physical_address,
      sign_off,
      license_number,
      license_info,
      regulatory_body,
      compliance_notes,
      legal_disclaimer,
      website_url,
      blog_url,
      primary_color,
      secondary_color,
      accent_color,
      heading_font,
      body_font,
      motifs,
      corner_style,
      button_shape,
      density,
      header_treatment,
      header_image_url,
      metric_box_style,
      divider_style,
      logo_url,
      headshot_url,
      brokerage_badge_url,
      seo_keywords
    ) VALUES (
      u.user_id,
      -- display_name: prefer Hyperlocal sender brokerage, else Blog Engine business_name, else "My Profile"
      COALESCE(sender_row.brokerage, bofu_row.business_name, 'My Profile'),
      true,
      -- full_name: BE wins (richer source), else HL sender
      COALESCE(bofu_row.full_name, sender_row.full_name),
      -- title from HL sender
      sender_row.title,
      bofu_row.professional_type,
      -- brokerage: HL wins for contact/brand
      COALESCE(sender_row.brokerage, bofu_row.business_name),
      bofu_row.bio,
      COALESCE(bofu_row.country, 'United States'),
      bofu_row.state,
      bofu_row.metro_area,
      COALESCE(bofu_row.counties, '{}'),
      COALESCE(bofu_row.neighborhoods, '{}'),
      COALESCE(bofu_row.target_clients, '{}'),
      COALESCE(bofu_row.specializations, '{}'),
      COALESCE(bofu_row.property_types, '{}'),
      sender_row.phone,
      sender_row.reply_to_email,
      sender_row.physical_address,
      COALESCE(sender_row.sign_off, 'Talk soon,'),
      sender_row.license_number,
      bofu_row.license_info,
      bofu_row.regulatory_body,
      bofu_row.compliance_notes,
      branding_row.legal_disclaimer,
      bofu_row.website_url,
      bofu_row.blog_url,
      COALESCE(branding_row.primary_color, '#1B7FB5'),
      COALESCE(branding_row.secondary_color, '#17A697'),
      COALESCE(branding_row.accent_color, '#31DBA5'),
      COALESCE(branding_row.heading_font, 'Inter'),
      COALESCE(branding_row.body_font, 'Inter'),
      branding_row.motifs,
      COALESCE(branding_row.corner_style, 'soft'),
      COALESCE(branding_row.button_shape, 'rounded'),
      COALESCE(branding_row.density, 'standard'),
      COALESCE(branding_row.header_treatment, 'solid'),
      branding_row.header_image_url,
      COALESCE(branding_row.metric_box_style, 'card'),
      COALESCE(branding_row.divider_style, 'subtle'),
      COALESCE(branding_row.logo_url, bofu_row.logo_url),
      branding_row.headshot_url,
      branding_row.brokerage_badge_url,
      COALESCE(bofu_row.seo_keywords, '{}')
    ) RETURNING id INTO new_profile_id;

    -- Set as user's active profile
    UPDATE profiles
      SET active_profile_id = new_profile_id,
          updated_at = NOW()
      WHERE id = u.user_id;

    -- Backfill profile_id on every top-level app-scoped table for this user
    UPDATE bofu_cms_connections SET profile_id = new_profile_id WHERE user_id = u.user_id AND profile_id IS NULL;
    UPDATE bofu_schedules        SET profile_id = new_profile_id WHERE user_id = u.user_id AND profile_id IS NULL;
    UPDATE bofu_discovery_runs   SET profile_id = new_profile_id WHERE user_id = u.user_id AND profile_id IS NULL;
    UPDATE bofu_topics           SET profile_id = new_profile_id WHERE user_id = u.user_id AND profile_id IS NULL;
    UPDATE bofu_blogs            SET profile_id = new_profile_id WHERE user_id = u.user_id AND profile_id IS NULL;
    UPDATE bofu_usage            SET profile_id = new_profile_id WHERE user_id = u.user_id AND profile_id IS NULL;
    UPDATE bofu_pack_purchases   SET profile_id = new_profile_id WHERE user_id = u.user_id AND profile_id IS NULL;
    UPDATE bofu_onboarding_chats SET profile_id = new_profile_id WHERE user_id = u.user_id AND profile_id IS NULL;

    UPDATE radar_config          SET profile_id = new_profile_id WHERE user_id = u.user_id AND profile_id IS NULL;
    UPDATE radar_competitors     SET profile_id = new_profile_id WHERE user_id = u.user_id AND profile_id IS NULL;
    UPDATE radar_queries         SET profile_id = new_profile_id WHERE user_id = u.user_id AND profile_id IS NULL;
    UPDATE radar_checks          SET profile_id = new_profile_id WHERE user_id = u.user_id AND profile_id IS NULL;
    UPDATE radar_audits          SET profile_id = new_profile_id WHERE user_id = u.user_id AND profile_id IS NULL;
    UPDATE radar_usage           SET profile_id = new_profile_id WHERE user_id = u.user_id AND profile_id IS NULL;

    UPDATE hl_campaigns          SET profile_id = new_profile_id WHERE user_id = u.user_id AND profile_id IS NULL;
    UPDATE hl_crm_connections    SET profile_id = new_profile_id WHERE user_id = u.user_id AND profile_id IS NULL;
    UPDATE hl_email_connections  SET profile_id = new_profile_id WHERE user_id = u.user_id AND profile_id IS NULL;
    UPDATE hl_runs               SET profile_id = new_profile_id WHERE user_id = u.user_id AND profile_id IS NULL;
    UPDATE hl_suppressions       SET profile_id = new_profile_id WHERE user_id = u.user_id AND profile_id IS NULL;

    UPDATE public.threads               SET profile_id = new_profile_id WHERE user_id = u.user_id AND profile_id IS NULL;
    UPDATE public.saved_prompts         SET profile_id = new_profile_id WHERE user_id = u.user_id AND profile_id IS NULL;
    UPDATE public.prompt_studio_usage   SET profile_id = new_profile_id WHERE user_id = u.user_id AND profile_id IS NULL;
    UPDATE public.prompt_pack_purchases SET profile_id = new_profile_id WHERE user_id = u.user_id AND profile_id IS NULL;
  END LOOP;
END $$;

-- ============================================================
-- Verification queries (run by the engineer after migration applies)
--
-- Every user with legacy data has exactly one default profile:
--   SELECT user_id, COUNT(*) FROM platform_profiles
--     WHERE is_default AND archived_at IS NULL
--     GROUP BY user_id HAVING COUNT(*) != 1;
--
-- Every legacy row got a profile_id:
--   SELECT 'bofu_blogs' AS t, COUNT(*) FROM bofu_blogs WHERE profile_id IS NULL
--   UNION ALL SELECT 'bofu_topics', COUNT(*) FROM bofu_topics WHERE profile_id IS NULL
--   UNION ALL SELECT 'radar_config', COUNT(*) FROM radar_config WHERE profile_id IS NULL
--   UNION ALL SELECT 'hl_runs', COUNT(*) FROM hl_runs WHERE profile_id IS NULL;
-- ============================================================
