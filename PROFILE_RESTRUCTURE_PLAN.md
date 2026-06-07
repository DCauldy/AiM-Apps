# Profile Restructure Plan

> **Status:** Design locked. Awaiting implementation.
> **Branch:** `feature/profile-restructure` → eventually merges into `feature/blog-engine`.
> **Owner:** Derek Caldwell · Contributors: Josh Kennedy

---

## 1. Vision

Today each app (Prompt Studio, Blog Engine, Hyperlocal, Radar) has its own concept of "user profile" — a different table, a different onboarding flow, partly duplicated fields, no shared identity.

We're extracting a single concept: a **Profile = a complete company identity**. A user can own multiple profiles (e.g. their personal brand, their team, their brokerage, a separate business). The AiM Automations platform **conforms around the active profile**: Blog Engine writes for it, Hyperlocal sends as it, Radar tracks it, Prompt Studio personalizes for it.

Profiles are first-class:

- They show up as their own "App" in the AppSwitcher (`/apps/profile`).
- They have their own page-quota economics — each profile carries its own monthly prompt/blog/email quota.
- They are purchaseable as per-seat Stripe add-ons beyond the 1 included in the base AiM Automations subscription.
- Switching the active profile is a global context change visible everywhere via the AppSwitcher dropdown and a passive "Operating as ___" indicator in every app's `ProductHeader`.

---

## 2. Locked design decisions

| # | Decision |
|---|---|
| 1 | Profile = full company identity. Multi-tenant per user. Platform conforms around active profile. |
| 2 | Single unified `platform_profiles` table. Absorbs Hyperlocal's existing `platform_sender_profiles` + `platform_branding_profiles`. |
| 3 | Shared fields: identity, market, business focus, contact, compliance, brand visuals, SEO. App-specific tables keep app-mechanical config + gain `profile_id` FK. |
| 4 | Backfill existing data immediately at end of build (not deferred to later cutover). |
| 5 | Per-seat add-on pricing. Each profile has its own monthly resource quota. |
| 6 | Profile switcher lives inside AppSwitcher dropdown. Passive "Operating as ___" indicator in `ProductHeader`. Confirm switch when there's unsaved work. Consolidate to 2 global menus (AppSwitcher + UserMenu); delete `ProfileSection`. |
| 7 | Unified Profile setup chat triggers on first app entry. Per-app onboarding shrinks to app-mechanical config only. `/apps/profile/new` reuses the Profile chat for additional profiles. |
| 8 | Prompt Studio auto-personalizes via silent system context from the active profile. No template variables, no opt-in. |
| 9 | 1 profile included in base subscription. Downgrade triggers grace period through billing cycle renewal. If user doesn't archive on time, all apps blocked until they do. No silent auto-archive. |

---

## 3. Database schema

### 3.1 New table: `platform_profiles`

```sql
create table public.platform_profiles (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,

  -- Meta
  display_name text not null,                       -- "Smith Team — RE/MAX"
  is_default boolean not null default false,
  archived_at timestamptz,                          -- null = active
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  -- Identity
  full_name text,
  title text,                                       -- "Realtor", "Broker", "Team Lead"
  professional_type text,                           -- solo_agent | team_leader | team_agent | broker_owner | loan_officer | title_executive
  brokerage text,
  bio text,

  -- Market
  country text default 'US',
  state text,
  metro_area text,
  counties text[] default '{}',
  neighborhoods text[] default '{}',

  -- Business focus
  target_clients text[] default '{}',
  specializations text[] default '{}',
  property_types text[] default '{}',

  -- Contact / CAN-SPAM
  phone text,
  reply_to_email text,
  physical_address text,                            -- required for outbound email per CAN-SPAM
  sign_off text,                                    -- email closing block

  -- Compliance
  license_number text,
  license_info text,
  regulatory_body text,
  compliance_notes text,
  legal_disclaimer text,

  -- Web presence
  website_url text,
  blog_url text,

  -- Brand visuals
  primary_color text,
  secondary_color text,
  accent_color text,
  heading_font text,
  body_font text,
  motifs text[] default '{}',
  corner_style text,                                -- sharp | rounded | pill
  button_shape text,                                -- square | rounded | pill
  density text,                                     -- compact | comfortable | spacious
  header_treatment text,
  metric_box_style text,
  divider_style text,
  logo_url text,
  headshot_url text,
  brokerage_badge_url text,

  -- SEO
  seo_keywords text[] default '{}',

  constraint platform_profiles_one_default
    exclude (user_id with =) where (is_default and archived_at is null)
);

create index platform_profiles_user_id_idx on platform_profiles(user_id);
create index platform_profiles_active_idx on platform_profiles(user_id) where archived_at is null;

-- RLS: users see/write only their own profiles
alter table platform_profiles enable row level security;
create policy "users read own profiles" on platform_profiles for select using (auth.uid() = user_id);
create policy "users insert own profiles" on platform_profiles for insert with check (auth.uid() = user_id);
create policy "users update own profiles" on platform_profiles for update using (auth.uid() = user_id);
create policy "users delete own profiles" on platform_profiles for delete using (auth.uid() = user_id);

create trigger platform_profiles_updated_at
  before update on platform_profiles
  for each row execute function moddatetime(updated_at);
```

### 3.2 Global `profiles` table additions

```sql
alter table public.profiles
  add column active_profile_id uuid references platform_profiles(id) on delete set null,
  add column profile_slot_count int not null default 1,
  add column slot_grace_period_ends_at timestamptz;
```

- `active_profile_id` — which `platform_profile` the user is currently operating under. Session-readable.
- `profile_slot_count` — number of slots they've paid for (base 1 + Stripe add-ons). Updated by Stripe webhook.
- `slot_grace_period_ends_at` — set when their slot count drops below their active profile count; equals the end of the current Stripe billing period. Once past this date AND `count(profiles where archived_at is null) > profile_slot_count`, middleware blocks `/apps/*` except `/apps/profile` and `/account`.

### 3.3 `profile_id` FKs on app-specific tables

Nullable during transition, NOT NULL after backfill.

```sql
alter table bofu_schedules         add column profile_id uuid references platform_profiles(id) on delete cascade;
alter table bofu_cms_connections   add column profile_id uuid references platform_profiles(id) on delete cascade;
alter table bofu_topics            add column profile_id uuid references platform_profiles(id) on delete cascade;
alter table bofu_blogs             add column profile_id uuid references platform_profiles(id) on delete cascade;
alter table bofu_discovery_runs    add column profile_id uuid references platform_profiles(id) on delete cascade;
alter table bofu_pack_purchases    add column profile_id uuid references platform_profiles(id) on delete cascade;

alter table radar_config           add column profile_id uuid references platform_profiles(id) on delete cascade;
alter table radar_competitors      add column profile_id uuid references platform_profiles(id) on delete cascade;
alter table radar_queries          add column profile_id uuid references platform_profiles(id) on delete cascade;

alter table hl_crm_connections     add column profile_id uuid references platform_profiles(id) on delete cascade;
alter table hl_email_connections   add column profile_id uuid references platform_profiles(id) on delete cascade;
alter table hl_suppressions        add column profile_id uuid references platform_profiles(id) on delete cascade;
alter table hl_campaigns           add column profile_id uuid references platform_profiles(id) on delete cascade;
alter table hl_runs                add column profile_id uuid references platform_profiles(id) on delete cascade;
```

Add `(profile_id, …)` composite indexes where the existing `(user_id, …)` indexes live, so query patterns don't degrade.

### 3.4 Tables to drop (after backfill)

```sql
-- After successful backfill verification:
drop table if exists user_profiles cascade;                  -- bofu profile (Blog Engine)
drop table if exists platform_sender_profiles cascade;       -- absorbed
drop table if exists platform_branding_profiles cascade;     -- absorbed
```

Existing tables `bofu_schedules`, `bofu_cms_connections`, etc. stay. Their `user_id` column stays alongside `profile_id` for the foreseeable future (defense in depth and faster RLS scoping).

---

## 4. API surface

### 4.1 New routes

| Method | Route | Purpose |
|---|---|---|
| GET | `/api/profiles` | List the current user's profiles (active + archived). |
| POST | `/api/profiles` | Create a new profile. Slot-gated. |
| GET | `/api/profiles/[id]` | Fetch one profile. RLS-enforced. |
| PATCH | `/api/profiles/[id]` | Update profile fields. |
| POST | `/api/profiles/[id]/archive` | Soft archive (sets `archived_at`). Apps under this profile become read-only. |
| POST | `/api/profiles/[id]/restore` | Un-archive (slot-gated). |
| DELETE | `/api/profiles/[id]` | Hard delete (cascades app data). Requires `confirm=true` query param. |
| POST | `/api/profiles/[id]/activate` | Set as the user's `active_profile_id`. |
| POST | `/api/profiles/onboarding/chat` | Unified onboarding chat (shared `OnboardingChatPrimitives`). |
| POST | `/api/profiles/onboarding/finalize` | Persist the chat's extracted fields as a new profile + mark active. |

### 4.2 Routes that change

- **`/api/apps/blog-engine/profile`** — deprecated. Move to reading `platform_profiles` for shared fields and `bofu_schedules` + `bofu_cms_connections` for app-mechanical fields.
- **`/api/apps/blog-engine/onboarding/*`** — rewritten to capture only schedule + CMS connection (shared identity comes from the Profile chat that runs before it).
- **`/api/apps/hyperlocal/sender-profiles/*`** and **`/api/apps/hyperlocal/branding-profiles/*`** — removed. Those tabs in Hyperlocal settings are deleted (moved to Profile manager).
- **`/api/apps/hyperlocal/onboarding/*`** — shrinks to CRM + email connection capture.
- **`/api/apps/radar/onboarding/*`** — shrinks to brand_variations + competitors + engines.

### 4.3 Stripe webhook additions

`POST /api/webhooks/stripe` adds handling for:

- `customer.subscription.updated` with line item quantity change on the **Profile Slot** product:
  - If quantity ≥ active profile count → just update `profiles.profile_slot_count`.
  - If quantity < active profile count → set `slot_grace_period_ends_at = current_period_end`, update `profile_slot_count`.

---

## 5. UI changes

### 5.1 New surfaces

**`/apps/profile`** (the Profile app)

- **`page.tsx`** — list of profiles. Each card shows `display_name`, brokerage, color swatch, status (active / archived / default). Buttons: Set as default · Edit · Archive · Delete. "Add Profile" button at top (disabled if `archived_count + active_count >= profile_slot_count`).
- **`new/page.tsx`** — reuses the Profile setup chat for creating profile #2, #3, etc. Identical UX to first-time setup.
- **`[id]/page.tsx`** — edit a single profile. Form view of every field (8 sections matching the schema groups).
- **`onboarding/page.tsx`** — the first-time Profile setup chat. Triggered from middleware when `active_profile_id is null`.

**`/account`** (new, not under `/apps`)

- Plan / subscription tier
- Profile slot quantity + "buy/remove slot" controls (links to Stripe customer portal)
- Email / password / sign-in info
- Admin link (if `is_admin`)
- Sign out

### 5.2 Shared chrome changes

- **`AppSwitcher`** — add a "Profile" entry to `APPS` array (route `/apps/profile`, icon TBD). Inside the dropdown, add a "Switch profile" section above "Apps Dashboard" showing the active profile + a sub-menu listing other active profiles + "Manage profiles".
- **`ProductHeader`** — add a small `Operating as: {display_name}` line below the app title. Click → opens AppSwitcher dropdown scrolled to the switch-profile section.
- **`UserMenu` (header right)** — rename "Profile" → "Account & Billing", point to `/account`. Otherwise unchanged.
- **`ProfileSection` (bottom of sidebar)** — **deleted**. Update both `components/sidebar/Sidebar.tsx` and `components/sidebar/BlogEngineSidebar.tsx` (and any future ones) to drop the import.

### 5.3 Per-app changes

**Blog Engine**

- `/apps/blog-engine/settings` shrinks: keep blog schedule + CMS connections + `blog_tone` + `include_disclaimers`. Drop identity/market/business/CTA/colors/logo (now on profile, edit via `/apps/profile/[id]`).
- `/apps/blog-engine/onboarding` shrinks: only asks about schedule + CMS connection.
- `lib/blog-engine/run-pipeline.ts` — replace `supabase.from("user_profiles").select(…)` with `supabase.from("platform_profiles").select(…).eq("id", activeProfileId).single()`.
- `BofuProfile` type (in `types/blog-engine.ts`) — rename/replace with the union of `platform_profiles` shared fields + `bofu_schedules` + `bofu_cms_connections`, sourced as needed.

**Hyperlocal**

- `/apps/hyperlocal/settings` — drop "Sender profiles" and "Branding profiles" tabs. Keep "Email connections", "CRM connections", "Suppressions".
- `/apps/hyperlocal/onboarding` shrinks: only asks about email + CRM connections.
- `lib/hyperlocal/run-pipeline.ts` and email rendering code — sender + branding pulled from `platform_profiles`, not `platform_sender_profiles` / `platform_branding_profiles`.

**Radar**

- `/apps/radar/settings` stays roughly the same (its config IS app-mechanical). Onboarding form continues to capture `brand_variations`, engines, competitors only.
- `lib/radar/*` — wherever Radar reads brokerage / brand info, switch to `platform_profiles`.

**Prompt Studio**

- No settings change.
- `lib/openrouter.ts` (or wherever prompts are built) — inject silent system context from active profile: *"You are helping {full_name} at {brokerage}, a {professional_type} serving {metro_area}. Their specializations: {specializations.join(', ')}. Brand voice: professional, on-message for their target clients: {target_clients.join(', ')}."*
- `ChatInput.tsx` and `ChatWindowAIElements.tsx` — add the "Operating as ___" indicator at the top of the chat surface for consistency with `ProductHeader`.

### 5.4 Middleware

```ts
// pseudocode in middleware.ts
const { data: { user } } = await supabase.auth.getUser();
if (!user) return next();

if (pathname.startsWith("/apps/") && !pathname.startsWith("/apps/profile/onboarding")) {
  const { active_profile_id, profile_slot_count, slot_grace_period_ends_at } =
    await getProfileMeta(user.id);

  // No profile yet → force onboarding
  if (!active_profile_id) {
    return NextResponse.redirect(new URL("/apps/profile/onboarding", request.url));
  }

  // Slot grace expired → block until they archive
  if (slot_grace_period_ends_at && Date.now() > slot_grace_period_ends_at.valueOf()) {
    const activeCount = await countActiveProfiles(user.id);
    if (activeCount > profile_slot_count) {
      if (!pathname.startsWith("/apps/profile") && !pathname.startsWith("/account")) {
        return NextResponse.redirect(new URL("/apps/profile?slot_overrun=1", request.url));
      }
    }
  }
}
```

---

## 6. Onboarding flow

### 6.1 First-time setup

1. New user signs in (Supabase email/password or WP JWT).
2. Middleware sees `active_profile_id is null` → redirects to `/apps/profile/onboarding`.
3. The Profile setup chat (built on `OnboardingChatPrimitives`) walks them through 7 sections:
   - **Identity** — `display_name`, `full_name`, `title`, `professional_type`, `brokerage`, `bio`
   - **Market** — `country`, `state`, `metro_area`, `counties`, `neighborhoods`
   - **Business focus** — `target_clients`, `specializations`, `property_types`
   - **Contact** — `phone`, `reply_to_email`, `physical_address`, `sign_off`
   - **Compliance** — `license_number`, `regulatory_body`, `compliance_notes`, `legal_disclaimer`
   - **Web presence** — `website_url`, `blog_url`, `seo_keywords`
   - **Brand visuals** — colors, fonts, logo upload, headshot upload (optional, can defer to /apps/profile/[id] edit)
4. On finalize: insert `platform_profiles` row, set `is_default = true`, set `profiles.active_profile_id` to the new id.
5. Redirect to the app they originally tried to open (preserved via query param on the onboarding URL).

### 6.2 WP JWT first-login special case

If the user signs in via AiM Academy WordPress JWT, auto-create a starter profile from the JWT claims:

- `display_name = wp_name || email_local_part`
- `full_name = wp_name`
- `brokerage = wp_brokerage` (if present)

Marked `is_default = true`, `active_profile_id` set. User skips the Profile chat unless they later open `/apps/profile/[id]` to flesh it out. This avoids gating AiM members behind a long setup flow.

### 6.3 Per-app onboarding (post-profile)

Each app keeps its own much smaller onboarding flow for the app-mechanical fields the profile doesn't cover:

- **Blog Engine**: blog frequency, active days, timezone, preferred time, CMS connection (WP / Squarespace / webhook).
- **Hyperlocal**: email sending connection (Gmail OAuth / Microsoft OAuth / Resend), CRM connection (one of the eight platforms).
- **Radar**: `brand_variations`, monitored engines, competitors list, optional audit URL.
- **Prompt Studio**: no onboarding.

These flows are entered the first time the user opens the app under a given profile. Their data is keyed by `(user_id, profile_id)`.

### 6.4 Subsequent profiles

`/apps/profile/new` reuses the same Profile setup chat — no separate flow. Each new profile is independent: needs its own per-app onboarding the first time the user enters an app under it.

---

## 7. Billing & slot enforcement

### 7.1 Stripe setup

- Create a recurring product **AiM Automations Profile Slot** at $X/mo (TBD).
- The base AiM Automations Pro subscription continues unchanged (priced at current Pro price).
- Stripe customer portal exposes the slot quantity slider.

### 7.2 Slot count flow

1. User clicks "Add Profile" in `/apps/profile` when at slot limit → modal: "You're at your slot limit. Upgrade to add another profile." → opens Stripe portal.
2. User increases slot quantity to N+1 in portal.
3. Stripe webhook `customer.subscription.updated` arrives → updates `profiles.profile_slot_count = N+1`.
4. UI revalidates → "Add Profile" button now enabled.

### 7.3 Slot reduction flow (grace period)

1. User decreases slot quantity to N-1 in portal (they currently have N active profiles).
2. Webhook arrives → sets `profiles.profile_slot_count = N-1`, `slot_grace_period_ends_at = current_period_end`.
3. UI shows banner on `/apps/profile`: "You have one extra profile beyond your slot count. Archive one before {date} to keep using the platform."
4. If user archives one → banner clears, `slot_grace_period_ends_at = null`.
5. If `current_period_end` passes without archive → middleware redirects all `/apps/*` (except `/apps/profile` and `/account`) to `/apps/profile?slot_overrun=1`. User must archive to continue.

### 7.4 Per-profile resource quotas

Each profile has its own monthly quota for its app's resources:

- Prompt Studio: 25 prompts/mo (matches today's member/pro tier limit). Reset on the 1st.
- Blog Engine: 3 blogs/week (existing default). Reset Monday.
- Hyperlocal: TBD send limit per profile (existing `hyperlocal_run_counters` table).
- Radar: TBD query/audit limit per profile.

Existing tables (`trial_usage` for prompts, `bofu_usage`, etc.) get a `profile_id` column so usage is scoped per profile. The migration is mechanical — existing rows backfill `profile_id` from the user's default profile.

---

## 8. Backfill plan

Run as one transaction at the end of the build, before merging back to `feature/blog-engine`.

### 8.1 Order of operations

1. **Phase A — create profiles.** For each user with any pre-existing app data, create one or more `platform_profiles` rows.
   - **If user has ≥1 `platform_sender_profiles`** → for each sender profile, create a `platform_profiles` row stitched from that sender + the user's matching branding profile (by `is_default` first, otherwise by `created_at` proximity).
   - **Else if user has a `user_profiles` (Blog Engine) row** → create a single `platform_profiles` row from that.
   - **Else if user has only a `radar_config` row** → create a stub `platform_profiles` row with `display_name = email_local_part` and Radar-relevant fields only.
   - **Else** → skip; the user will see the onboarding flow next time they sign in.

2. **Phase B — resolve conflicts on the user's primary profile.** For users with overlapping data across apps:
   - Hyperlocal sender/branding values win for `phone`, `reply_to_email`, `physical_address`, `sign_off`, `license_number`, `primary_color`, `secondary_color`, `accent_color`, fonts, logos.
   - Blog Engine `user_profiles` values win for `metro_area`, `state`, `neighborhoods`, `counties`, `target_clients`, `specializations`, `property_types`, `professional_type`, `brokerage` (when not set in Hyperlocal), `bio`, `website_url`, `blog_url`, `seo_keywords`, `license_info`, `regulatory_body`, `compliance_notes`.
   - Where both have a value: Hyperlocal wins for contact/brand, Blog Engine wins for market/focus.

3. **Phase C — set defaults.** Mark one profile per user as `is_default = true`. Prefer the one created from Hyperlocal sender's `is_default`, falling back to oldest by `created_at`.

4. **Phase D — set `active_profile_id`.** `update profiles set active_profile_id = (their default platform_profile id)`.

5. **Phase E — backfill `profile_id` on app-specific tables.**
   - `bofu_*` tables → set `profile_id` to user's default platform_profile id.
   - `radar_*` tables → same.
   - `hl_*` tables → for each row, prefer matching by the original Hyperlocal sender/branding profile id (if recorded), otherwise default profile id.

6. **Phase F — set NOT NULL on profile_id columns.** After verification, mark all FK columns NOT NULL.

7. **Phase G — drop legacy tables.** `user_profiles`, `platform_sender_profiles`, `platform_branding_profiles`.

8. **Phase H — set `profile_slot_count = 1` for everyone.** Existing users have 1 slot to start; if they have multiple profiles from Hyperlocal, they're immediately in grace period and must either upgrade or archive.

### 8.2 Verification

After Phase E, run sanity queries:

```sql
-- Every user has exactly one default
select user_id, count(*) from platform_profiles where is_default and archived_at is null group by user_id having count(*) != 1;
-- Every existing app row has a profile_id
select count(*) from bofu_blogs where profile_id is null;
select count(*) from radar_config where profile_id is null;
-- etc.
```

If any check returns > 0, halt and investigate.

### 8.3 Rollback strategy

The backfill migration is reversible only before Phase G (table drops). If a problem surfaces mid-backfill:

1. Roll back the active SQL transaction.
2. Delete `platform_profiles` rows by `created_at > <migration start>`.
3. Null out `profile_id` columns on app tables.
4. Reset `active_profile_id` to null on `profiles`.

After Phase G, rollback requires a database restore. Take a backup before Phase G.

---

## 9. Rollout / PR breakdown

Four PRs land sequentially on `feature/profile-restructure`. None merge into `feature/blog-engine` until all four are green.

### PR 1 — `derek/profile-schema`

- `supabase/migrations/<ts>_platform_profiles.sql` — new table, RLS, indexes.
- `supabase/migrations/<ts>_profiles_active_and_slots.sql` — add `active_profile_id`, `profile_slot_count`, `slot_grace_period_ends_at` to global `profiles`.
- `supabase/migrations/<ts>_app_tables_profile_id.sql` — add nullable `profile_id` to all listed app tables.
- `types/platform-profile.ts` — TypeScript types matching the schema.
- No UI, no API changes. Schema-only.

### PR 2 — `derek/profile-app`

- `/apps/profile/{page,new,[id],onboarding}/...` — full Profile app shell.
- `/api/profiles/...` — full REST surface.
- `AppSwitcher` modifications: Profile entry + Switch-profile section in dropdown.
- `ProductHeader` "Operating as ___" indicator.
- `UserMenu` rename + repoint to `/account`.
- Delete `ProfileSection`; update both sidebars.
- `/account/page.tsx` shell.
- New users only — middleware redirects to `/apps/profile/onboarding` when `active_profile_id is null`.

### PR 3 — `derek/profile-app-rewiring`

- Per-app rewiring to read `platform_profiles` instead of legacy tables.
- Per-app onboarding flows shrunk to mechanical-only fields.
- Per-app settings pages shrunk.
- Prompt Studio silent system-context injection.
- Per-app usage tables get `profile_id` column and quota logic.

### PR 4 — `derek/profile-backfill-and-billing`

- Backfill SQL migration (Phases A–H).
- Stripe Profile Slot product wiring + webhook handling.
- Middleware slot enforcement.
- Grace-period banner + slot-overrun redirect.
- Legacy table drops (last commit in the PR, after verification queries pass in staging).

When PR 4 lands green in staging (Supabase staging project + Vercel preview), `feature/profile-restructure` merges back into `feature/blog-engine`.

---

## 10. Deferred decisions

These do not block the build. Sensible defaults are noted; revisit during the PR that touches them.

| Item | Default | Revisit during |
|---|---|---|
| Asset upload storage (logos, headshots, brokerage badges) | Per-profile path inside the existing Hyperlocal storage bucket: `profile-assets/{profile_id}/{filename}` | PR 2 (Profile app file uploads) |
| WP JWT auto-profile fields beyond `display_name` | Only `full_name` + `brokerage` from JWT claims; everything else captured in the profile editor as user fills it in | PR 2 |
| Admin impersonation profile picker | Impersonated user's default profile is what admin sees. Defer multi-profile picker until impersonation feature itself ships | When admin-impersonation feature lands |
| Profile-level webhook events for Inngest pipelines | `event.data.profile_id` carried through every Inngest event | PR 3 |
| Profile slot pricing ($X/mo) | TBD with Derek before PR 4 | PR 4 |
| Per-profile quota numbers (prompts, blogs, sends, queries) | Match existing per-user defaults: 25 prompts/mo, 3 blogs/wk | PR 3 |

---

## 11. Out of scope (for this restructure)

- Team / multi-user collaboration on a single profile. Profiles are owned by exactly one user.
- Profile templating ("clone this profile to bootstrap a new one"). Useful future feature, not part of this work.
- Profile-level audit log. Add later if compliance requires.
- AI-suggested profile fields ("based on your brokerage, here are likely target clients"). Nice-to-have, not foundational.

---

## 12. Open questions to revisit

- **Profile archive limits.** Should there be a cap on archived profiles? Today there's no reason to cap, but a user with 50 archived profiles cluttering `/apps/profile` would be ugly. Probably not a real concern until it happens.
- **Profile export.** Should users be able to export a profile's data (for portability)? Not required, deferred unless requested.
- **Profile-level subscription cancellation.** If a user cancels their Pro subscription, do profiles archive immediately or stay? Likely: stay (data preserved), apps blocked. Confirm during PR 4.
