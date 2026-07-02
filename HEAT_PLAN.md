# Heat — Implementation Plan

## Overview

**Heat** is a demand-intelligence app for real estate professionals. An agent enters a ZIP code (or several) and a price band; Heat returns the **hottest listings in that area ranked by buyer demand** — not just "what's for sale" (Zillow already does that), but *which listings are pulling outsized attention*, using signals agents can't easily see aggregated: page views and saves/favorites.

It sits alongside Prompt Studio, Blog Engine, Radar, Hyperlocal, Listing Studio, and Tours as a Pro-tier app in the AiM platform. It reuses two things the platform already has: the **RapidAPI housing-data client** (`lib/hyperlocal/market-data/zillow.ts`, provider `us-housing-market-data1`) and the **Magic / Control Freak mode pattern** (`Mode = "magic" | "control"`, two-card launcher).

The moat is **velocity**: views/saves are a *flow*, not a *stock*. By snapshotting them daily from day one, Heat can show *momentum* ("+180 views, +12 saves this week") — which no consumer site surfaces. v1 ships on a single-pull intent-quality score; v2 re-weights toward velocity once snapshots mature. That's a config change, not a rebuild.

---

## Table of Contents

1. [Architecture Overview](#1-architecture-overview)
2. [The Heat Score](#2-the-heat-score)
3. [Data Sourcing & Rate-Limit Strategy](#3-data-sourcing--rate-limit-strategy)
4. [Phase 1: Foundation & Feature Flag](#4-phase-1-foundation--feature-flag)
5. [Phase 2: Database Schema](#5-phase-2-database-schema)
6. [Phase 3: Heat Data Library](#6-phase-3-heat-data-library)
7. [Phase 4: Magic / Control Launcher](#7-phase-4-magic--control-launcher)
8. [Phase 5: The Board (Hot Sheet UI)](#8-phase-5-the-board-hot-sheet-ui)
9. [Phase 6: Listing Detail & Gallery](#9-phase-6-listing-detail--gallery)
10. [Phase 7: Audience Toggle & AI Blurbs](#10-phase-7-audience-toggle--ai-blurbs)
11. [Phase 8: Daily Snapshot Cron & Velocity](#11-phase-8-daily-snapshot-cron--velocity)
12. [Phase 9: Usage, Tier Gating & Registration](#12-phase-9-usage-tier-gating--registration)
13. [API Cost Model](#13-api-cost-model)
14. [Environment Variables](#14-environment-variables)
15. [File Tree](#15-file-tree)
16. [Build Order & Milestones](#16-build-order--milestones)

---

## 1. Architecture Overview

### What's reused vs. new

| Concern | Reuse (exists today) | New for Heat |
|---|---|---|
| Housing API client | `lib/hyperlocal/market-data/zillow.ts` — `RAPIDAPI_KEY`, `propertyExtendedSearch`, 600ms rate limit, page-flatten | `/property` detail (views/saves) + `/images` fetchers |
| Magic/Control UX | `SphereModeLauncher.tsx`, `Mode = "magic" \| "control"` | `HeatModeLauncher` |
| AI narrative | `lib/openrouter.ts` (Opus via `PROFILE_MAGIC_MODEL`) | per-listing "why hot / talking points" prompt |
| App shell/header | `AppShell`, `ProductHeader` | `HeatHeader` (nav + accent gradient) |
| Feature flag | `lib/feature-flags.ts`, `lib/admin-config.server.ts` | `HEAT` flag |
| Cron | `vercel.json` hourly cron + `CRON_SECRET` | daily snapshot job |
| DB conventions | `{prefix}_*` tables + RLS | `heat_*` tables |

### Request flow

```
Agent (ZIP + price band + mode)
        │
        ▼
  POST /api/apps/heat/search ──▶ heat_searches row (params + status=running)
        │
        ▼
  Background fetch (Trigger.dev task):
    1. propertyExtendedSearch  → candidate listings (1 call/ZIP)
    2. /property per candidate  → pageViewCount, favoriteCount, priceHistory (N calls @600ms)
    3. compute Heat Score       → rank
    4. persist heat_listing_snapshots (today's views/saves)
        │
        ▼
  Board renders ranked cards (hero image from cached imgSrc / /images)
        │
        ▼
  Click → /apps/heat/listing/[zpid]: gallery + score breakdown + AI blurb
```

### Theme

Heat's identity is fire. Accent gradient **Fire Red → Burnt Orange** (`bg-gradient-to-br from-[#FF3B30] to-[#C2410C]`), used for the AppSwitcher/AppsShowcase icon (`iconClassName`), the `HeatHeader` accent, the Heat Score badge, and the flame icon. Heat Score badge shades hot→cold along the same ramp (deep red 100 → amber → muted at 0).

### Access model (matches platform)

| Account Type | Heat |
|---|---|
| Standalone | Locked (upgrade CTA → AiM) |
| AiM Member | Locked (upgrade CTA → AiM Pro) |
| AiM Pro | Enabled — N searches/week (quota TBD, mirrors Blog Engine usage pattern) |

---

## 2. The Heat Score

A listing's Heat Score is a 0–100 blend. **v1** runs entirely off a single data pull (no history required); **v2** adds velocity once snapshots exist.

### v1 components (single-pull, ships now)

| Component | Signal | Rationale |
|---|---|---|
| **Intent quality** (primary) | `favoriteCount / pageViewCount` (saves-to-views ratio) + normalized raw saves | Committed interest, not idle browsing. In sample data, 5157 Regent (5.5%) & 5437 Hill Rd (5.8%) genuinely lead. |
| **Traffic** | `pageViewCount / max(daysOnZillow, 1)` (views per day on market) | Normalizes for how long it's been listed. 827 Redwood: 1,030 views in 12 days = hot. |
| **Freshness bonus** | boost when `daysOnZillow` is low **and** engagement already high | New + already popular = about to move. |
| **Price-cut penalty** | subtract when `priceHistory` shows recent cuts / long DOM | Demotes stale-but-popular (4912 Trousdale: 1,244 views but 96 days + 2 cuts = *cold*). |

```
heatScore =
    w_intent   * norm(savesToViews) * saturate(saves)
  + w_traffic  * norm(viewsPerDay)
  + w_fresh    * freshnessBonus(daysOnMarket, engagement)
  - w_cut      * priceCutPenalty(priceHistory, daysOnMarket)
```

Default weights (v1): `w_intent 0.45, w_traffic 0.25, w_fresh 0.20, w_cut 0.10`.
All normalization is **relative to the current result set** (min-max within the ZIP/price band) so scores are comparable within a board.

### v2 component (velocity — needs snapshots)

| Component | Signal |
|---|---|
| **Save velocity** | Δsaves over trailing 7 days (from `heat_listing_snapshots`) |
| **View acceleration** | 2nd-difference of daily views (rising vs. plateauing) |

When ≥ ~14 days of snapshots exist, shift weights toward velocity (e.g. `w_velocity 0.40`, reduce intent/traffic). Exposed as a **Control-mode slider set**; Magic mode uses the recommended defaults.

### Badges (secondary, not the sort)

- 👀 **Deal Watch** — outsized attention relative to price/PPSF ("value vs. interest").
- 🔥 **Surging** — top-quartile save velocity (v2).
- 🆕 **Fresh & Hot** — new listing already over engagement threshold.

---

## 3. Data Sourcing & Rate-Limit Strategy

The provider hard-limits ~2 req/sec (`MIN_REQUEST_GAP_MS = 600` in the existing client). A board over a ZIP is **1 search call + N detail calls** (one per listing, for views/saves). For N=20 that's ~12s of serialized fetching — too slow to block a request synchronously.

**Strategy:**
- **Search** is cheap (1 call) → return candidate list fast.
- **Detail enrichment** (views/saves/priceHistory) runs as a **Trigger.dev task** (`triggers/heat-enrich.ts`, kicked via `tasks.trigger<typeof heatEnrichTask>("heat-enrich", …)` → `handle.id`), writing results into `heat_listing_snapshots` + a `heat_listings` cache keyed by `zpid`. Board polls search status (or streams run metadata like `profile-analyze`).
- **Cache-first**: if a `zpid` was enriched < 24h ago, reuse it — no re-fetch. Detail data only meaningfully changes daily.
- **Board polls** `GET /api/apps/heat/searches/[id]` for `status` (running → ready), same poll pattern Blog Engine uses (`/status`).
- **Known API quirks (verified 2026-07-01):** the raw REST `/property?zpid=N` and `/images?zpid=N` both work fine — the "Zpid is not valid" error only occurs through the MCP wrapper, not our direct `fetch`. Rate-limit errors return an explicit `"exceeded the rate limit per second"` message → back off and retry.

---

## 4. Phase 1: Foundation & Feature Flag

1. **`lib/feature-flags.ts`** — add to `FEATURES`:
   ```ts
   HEAT: process.env.NEXT_PUBLIC_ENABLE_HEAT === "true",
   ```
2. **`lib/admin-config.server.ts`** — add `HEAT` to `FEATURE_FLAG_DEFAULTS` so admins can toggle via `admin_settings`.
3. **`.env.local`** — `NEXT_PUBLIC_ENABLE_HEAT=true` for local dev.
4. **`app/apps/heat/layout.tsx`** — server gate: auth → `getFeatureFlag("HEAT")` → Pro-tier check → redirect if not eligible (copy `app/apps/blog-engine/layout.tsx`).
5. **`app/apps/heat/layout-client.tsx`** — wrap children in `AppShell` with `HeatHeader` + Heat accent theme.

---

## 5. Phase 2: Database Schema

**Migration:** `supabase/migrations/<timestamp>_heat_schema.sql` (naming: `YYYYMMDDHHMMSS_heat_schema.sql`). All tables `heat_` prefixed, RLS on, `auth.uid() = user_id`.

```sql
-- A saved search / board the agent ran
create table heat_searches (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  zips text[] not null,
  min_price int,
  max_price int,
  home_types text,                     -- Zillow vocabulary; null = default homes
  mode text not null check (mode in ('magic','control')),
  audience text not null default 'buyer' check (audience in ('buyer','listing')),
  weights jsonb,                        -- Control-mode Heat Score weight overrides
  status text not null default 'running' check (status in ('running','ready','error')),
  created_at timestamptz not null default now()
);

-- Per-listing cache (dedup by zpid, refreshed at most daily)
create table heat_listings (
  zpid text primary key,
  address text, city text, state text, zip text,
  price int, beds numeric, baths numeric, living_area int, days_on_market int,
  property_type text, img_src text, detail_url text,
  last_enriched_at timestamptz
);

-- Daily views/saves history — THE velocity source (write from day one)
create table heat_listing_snapshots (
  id bigint generated always as identity primary key,
  zpid text not null references heat_listings(zpid) on delete cascade,
  captured_on date not null,
  page_view_count int,
  favorite_count int,
  price int,
  unique (zpid, captured_on)
);

-- Results of a given search (score at time of run), links search → listings
create table heat_search_results (
  search_id uuid not null references heat_searches(id) on delete cascade,
  zpid text not null references heat_listings(zpid) on delete cascade,
  heat_score numeric,
  score_breakdown jsonb,               -- component values for the detail view
  badges text[],
  rank int,
  primary key (search_id, zpid)
);

-- Boards the agent explicitly saved to revisit
create table heat_saved_boards (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  search_id uuid not null references heat_searches(id) on delete cascade,
  name text,
  created_at timestamptz not null default now()
);
```

`heat_listings` / `heat_listing_snapshots` are shared/public-read (no per-user RLS on the cache itself — they're market data, not user data); user isolation lives on `heat_searches`, `heat_search_results`, `heat_saved_boards`.

> **CLAUDE.md:** run these migrations locally before calling the work done.

---

## 6. Phase 3: Heat Data Library

**`lib/heat/market-data.ts`** — extend the existing client pattern rather than fork it. Ideally refactor the shared `rateLimit()` + `fetch` core out of `lib/hyperlocal/market-data/zillow.ts` into a small shared `lib/housing/rapidapi-client.ts`, then both apps import it.

New functions:
- `searchListings(zip, { minPrice, maxPrice, homeTypes, status_type: "ForSale" })` → candidate `ZillowProp[]` (reuses `searchAll`).
- `fetchListingDetail(zpid)` → `{ pageViewCount, favoriteCount, priceHistory, resoFacts, ... }` (raw REST accepts `zpid` directly).
- `fetchListingImages(zpid | propertyUrl)` → hi-res gallery URLs (`images` endpoint).
- `enrichAndCache(props)` → cache-first detail pass; writes `heat_listings` + today's `heat_listing_snapshots`.

**`lib/heat/score.ts`** — pure, unit-testable Heat Score:
- `computeHeatScore(listing, context, weights)` → `{ score, breakdown, badges }`.
- `contextFromResultSet(listings)` → min/max for relative normalization.
- No I/O → **Vitest** covers it directly (no `--runInBand`).

---

## 7. Phase 4: Magic / Control Launcher

**`components/heat/HeatModeLauncher.tsx`** — mirror `SphereModeLauncher.tsx` two-card layout:

- **✨ AI Magic** — one input (ZIP, or auto-filled from the agent's profile farm area). Heat auto-derives the price band from local median (via the existing `fetchMarketMetricsForZip`), ranks with default weights, and (Phase 7) attaches Opus talking points. One field → a curated hot sheet.
- **🤓 Control Freak** — explicit ZIP list, exact `minPrice`/`maxPrice`, `home_types`, days-on-market, **and Heat Score weight sliders** (intent / traffic / freshness / cut-penalty; velocity once available). Full control over the ranking.

Mode persists on the `heat_searches` row (`mode` column). Default mode from profile like the onboarding flow does.

---

## 8. Phase 5: The Board (Hot Sheet UI)

**`app/apps/heat/board/board-client.tsx`** — ranked card grid:
- Hero image (`img_src`, upgraded to `/images` hi-res on enrichment).
- Heat Score badge (0–100) + rank, engagement chips (Views / Saves), price, beds/baths/sqft, DOM.
- Secondary badges (Deal Watch / Fresh & Hot / Surging).
- Sort control (Heat Score default; also Price, Views, Saves, Newest).
- Poll `GET /api/apps/heat/searches/[id]` until `status = ready`; show skeleton while the detail pass runs.

**API:**
- `POST /api/apps/heat/search` → create `heat_searches`, kick background enrichment, return `{ id }`.
- `GET /api/apps/heat/searches/[id]` → status + ranked `heat_search_results` joined to `heat_listings`.

---

## 9. Phase 6: Listing Detail & Gallery

**`app/apps/heat/listing/[zpid]/`**:
- Full-res image gallery (`/images` endpoint).
- **Score breakdown** — the `score_breakdown` jsonb rendered as a "why this is hot" bar chart (intent / traffic / freshness / − cut).
- Engagement trend sparkline (from `heat_listing_snapshots`; empty until history accrues, then the star of the page).
- Facts from `resoFacts` (schools, price history, HOA, etc.).
- Listing agent / brokerage contact (available in the detail payload).

---

## 10. Phase 7: Audience Toggle & AI Blurbs

**Audience toggle** (`buyer` | `listing`) on the board, defaulted from profile, stored on `heat_searches.audience`. Same data, two framings:
- **Buyer's agent** → urgency + Opus-written buyer talking points ("show them before it's gone"); cards lead with Views/velocity.
- **Listing agent** → competitive intel ("attention your comps are getting"); cards lead with save-rate vs. price.

**AI blurbs** — `lib/heat/blurb.ts` calls Opus via `lib/openrouter.ts` (reuse the `PROFILE_MAGIC_MODEL` wiring): given a listing's facts + score breakdown + audience, produce 2–3 sentence talking points. Generated lazily on detail-view open (or batched for the top N in Magic mode), cached on `heat_search_results`.

---

## 11. Phase 8: Daily Snapshot Cron & Velocity

**Build this from day one even though v1 doesn't rank on it** — you can't backfill flow data.

- **`app/api/cron/heat-snapshot/route.ts`** — protected by `CRON_SECRET`; add to `vercel.json` (daily). For every `zpid` seen in a `heat_searches` in the last ~30 days, re-fetch detail (cache-first, spaced 600ms) and upsert today's `heat_listing_snapshots` row.
- Once ≥ ~14 days of history exist, enable velocity components in `score.ts` and shift default weights. Surface **Surging** badge and the detail-view sparkline.

---

## 12. Phase 9: Usage, Tier Gating & Registration

1. **`lib/heat/usage.ts`** — weekly search quota per Pro user (mirror `lib/blog-engine/usage.ts`).
2. **`components/layout/AppSwitcher.tsx`** — add Heat entry (`id: "heat"`, deep route `/apps/heat/board`, flame icon, `requiresPro: true`, custom gradient `iconClassName`).
3. **`components/apps/AppsShowcase.tsx`** — add matching landing-grid entry (keep in sync).
4. **`components/heat/HeatHeader.tsx`** — wrap `ProductHeader` with Heat nav items + accent + usage badge.

---

## 13. API Cost Model

RapidAPI `us-housing-market-data1` is per-request. Cost drivers:
- Search: 1 req per ZIP per run (cheap).
- Detail enrichment: **N reqs per run** (biggest driver) — mitigated by 24h `heat_listings` cache and cache-first re-use across searches.
- Snapshot cron: 1 req per tracked `zpid` per day — bounded by trimming tracked zpids to recently-searched ones.

Opus blurbs: lazy + cached, top-N only in Magic mode → small.

**Cost-control levers:** cap `maxPages`, cap enriched listings per board (e.g. top 25 by cheap pre-score), TTL on cache, prune snapshot tracking to active searches.

---

## 14. Environment Variables

| Var | Purpose | Status |
|---|---|---|
| `NEXT_PUBLIC_ENABLE_HEAT` | Feature flag | new |
| `RAPIDAPI_KEY` | Housing data provider key | **exists** (hyperlocal) |
| `HYPERLOCAL_RAPIDAPI_HOST` | Provider host override | exists (rename to `HOUSING_RAPIDAPI_HOST` if de-coupling from hyperlocal) |
| `OPENROUTER_API_KEY` | Opus blurbs | **exists** |
| `PROFILE_MAGIC_MODEL` | Opus model id (reuse) | **exists** |
| `CRON_SECRET` | Protect snapshot cron | **exists** |

No new secrets required for the MVP — Heat rides existing keys.

---

## 15. File Tree

```
app/apps/heat/
  layout.tsx                      # auth + HEAT flag + Pro gate
  layout-client.tsx               # AppShell + HeatHeader
  page.tsx                        # → launcher or last board
  board/
    page.tsx
    board-client.tsx              # ranked hot-sheet grid + poll
  listing/[zpid]/
    page.tsx
    listing-client.tsx            # gallery + score breakdown + blurb
  launcher/
    page.tsx                      # Magic/Control mode picker host

app/api/apps/heat/
  search/route.ts                 # POST create + kick enrichment
  searches/[id]/route.ts          # GET status + ranked results
  listings/[zpid]/route.ts        # GET cached detail + gallery
  listings/[zpid]/blurb/route.ts  # POST generate AI talking points
app/api/cron/heat-snapshot/route.ts

triggers/heat-enrich.ts           # Trigger.dev: search → detail enrich → score → persist

lib/heat/
  market-data.ts                  # search + detail(by zpid) + images + enrichAndCache
  score.ts                        # pure Heat Score (Vitest-covered)
  blurb.ts                        # Opus talking points
  usage.ts                        # weekly quota
lib/housing/rapidapi-client.ts    # shared rate-limited client (refactored from zillow.ts)

components/heat/
  HeatHeader.tsx
  HeatModeLauncher.tsx            # ✨ Magic / 🤓 Control cards
  HeatCard.tsx                    # board card w/ score + engagement chips
  ScoreBreakdown.tsx
  EngagementSparkline.tsx
  AudienceToggle.tsx

supabase/migrations/<ts>_heat_schema.sql
tests/heat/score.test.ts          # Vitest
```

---

## 16. Build Order & Milestones

**Milestone A — Prove the score (no UI).**
`lib/heat/market-data.ts` (search + detail by url) + `lib/heat/score.ts` + a Vitest/script that pulls a real ZIP (e.g. 37220, $750k–$1M) and prints the ranked sheet. Validate the formula against reality *before* building screens.

**Milestone B — MVP board (Magic only).**
Flag + gating + schema + `POST /search` + enrichment + board grid + poll. Ship a clickable hot sheet for one ZIP + price band. Snapshot cron live from here so velocity starts accruing.

**Milestone C — Detail + audience + blurbs.**
Listing gallery, score breakdown, audience toggle, Opus talking points.

**Milestone D — Control Freak + velocity.**
Weight sliders, multi-ZIP, saved boards; enable velocity components once ~2 weeks of snapshots exist; Surging badge + sparkline.

**Milestone E — Polish.**
Usage/quota, AppSwitcher + AppsShowcase registration, first-run empty states, cost caps.
```
