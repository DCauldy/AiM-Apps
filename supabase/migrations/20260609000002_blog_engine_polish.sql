-- Blog Engine polish pass:
--   1. Atomic check-and-increment of weekly blog usage to close the
--      race condition where two concurrent /runs POSTs could both pass
--      the limit check before either had incremented.
--   2. pipeline_error column on bofu_blogs so the UI can surface which
--      pipeline step failed instead of a bare "failed" status.

-- ---------------------------------------------------------------------------
-- 1. Atomic blog-slot reservation
--
-- Returns JSONB so call sites can branch on:
--   { reserved: true,  blogs_generated, blogs_limit, bonus_blogs, used_bonus }
--   { reserved: false, blogs_generated, blogs_limit, bonus_blogs }
--
-- Mechanics:
--   - SELECT … FOR UPDATE on bofu_usage row locks it for the duration
--     of this transaction. Concurrent callers serialize behind it.
--   - We prefer to spend the weekly quota first, then bonus blogs,
--     matching the existing accounting in incrementBofuUsage.
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION try_reserve_blog_slot(
  p_user_id UUID,
  p_week_start DATE
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_blogs_generated INT;
  v_blogs_limit INT;
  v_bonus_blogs INT;
  v_schedule_freq INT;
  v_used_bonus BOOLEAN := FALSE;
BEGIN
  -- Lock the usage row for the rest of the transaction. If no row yet,
  -- insert with the user's current scheduled frequency as the limit.
  SELECT blogs_generated, blogs_limit, bonus_blogs
    INTO v_blogs_generated, v_blogs_limit, v_bonus_blogs
    FROM bofu_usage
   WHERE user_id = p_user_id
     AND week_start = p_week_start
     FOR UPDATE;

  IF NOT FOUND THEN
    SELECT COALESCE(frequency, 3) INTO v_schedule_freq
      FROM bofu_schedules
     WHERE user_id = p_user_id;
    v_schedule_freq := COALESCE(v_schedule_freq, 3);

    INSERT INTO bofu_usage (user_id, week_start, blogs_generated, blogs_limit, bonus_blogs)
    VALUES (p_user_id, p_week_start, 0, v_schedule_freq, 0)
    ON CONFLICT (user_id, week_start) DO NOTHING;

    SELECT blogs_generated, blogs_limit, bonus_blogs
      INTO v_blogs_generated, v_blogs_limit, v_bonus_blogs
      FROM bofu_usage
     WHERE user_id = p_user_id
       AND week_start = p_week_start
       FOR UPDATE;
  END IF;

  -- Re-read the schedule limit on every call. Mid-week tier upgrades take
  -- effect immediately; mid-week downgrades won't claw back already-spent
  -- slots but will cap new ones at the new limit.
  SELECT COALESCE(frequency, v_blogs_limit) INTO v_schedule_freq
    FROM bofu_schedules
   WHERE user_id = p_user_id;
  v_blogs_limit := COALESCE(v_schedule_freq, v_blogs_limit, 3);

  IF v_blogs_generated < v_blogs_limit THEN
    UPDATE bofu_usage
       SET blogs_generated = blogs_generated + 1,
           blogs_limit = v_blogs_limit
     WHERE user_id = p_user_id
       AND week_start = p_week_start;
    v_blogs_generated := v_blogs_generated + 1;
  ELSIF v_bonus_blogs > 0 THEN
    UPDATE bofu_usage
       SET bonus_blogs = bonus_blogs - 1,
           blogs_limit = v_blogs_limit
     WHERE user_id = p_user_id
       AND week_start = p_week_start;
    v_bonus_blogs := v_bonus_blogs - 1;
    v_used_bonus := TRUE;
  ELSE
    RETURN jsonb_build_object(
      'reserved', FALSE,
      'blogs_generated', v_blogs_generated,
      'blogs_limit', v_blogs_limit,
      'bonus_blogs', v_bonus_blogs
    );
  END IF;

  RETURN jsonb_build_object(
    'reserved', TRUE,
    'blogs_generated', v_blogs_generated,
    'blogs_limit', v_blogs_limit,
    'bonus_blogs', v_bonus_blogs,
    'used_bonus', v_used_bonus
  );
END;
$$;

-- ---------------------------------------------------------------------------
-- 2. pipeline_error column for surfaced error messages on failed blogs
--
-- Stored alongside the existing status column. Convention: "{step}: {message}"
-- so the UI can render "Research: Perplexity 429 rate limit" or
-- "Writing: Claude refused — content policy". NULL while pipeline is healthy.
-- ---------------------------------------------------------------------------

ALTER TABLE bofu_blogs
  ADD COLUMN IF NOT EXISTS pipeline_error TEXT;
