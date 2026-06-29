# Radar — Implementation Plan

> AI Search Visibility Monitoring for Real Estate Professionals

## Overview

Radar is the third app in the AiM Pro platform, alongside Prompt Studio and Blog Engine. It monitors how real estate agents appear across AI-powered search engines, discovers what queries buyers/sellers ask, and audits websites for AI-readiness.

**Target audience:** Real estate professionals (same as Blog Engine)
**Access:** Pro tier only (same gate as Blog Engine)
**Color palette:** `#e0a458` (amber primary), `#1c4c8a` (deep blue secondary)
**Feature flag:** `RADAR` / `NEXT_PUBLIC_ENABLE_RADAR`

---

## Core Pillars

### 1. Monitor
Track brand visibility across 8 AI search engines. See if you show up when homebuyers ask AI about your market, and how you compare to competitors.

### 2. Research
Discover what queries people ask AI engines about your market. Generate trackable queries from your profile, surface competitive insights, and identify gaps where competitors appear but you don't.

### 3. Optimize
Audit your website for AI-readiness. Crawl pages, score them on signals that make AI engines cite your content, and get actionable recommendations.

---

## AI Search Engines (8)

| Engine | Method | Notes |
|--------|--------|-------|
| ChatGPT | API (OpenRouter) | GPT-4o, largest consumer AI |
| Google AI Overviews | Scraping (Browserless) | Embedded in Google Search |
| Perplexity | API (OpenRouter) | Citation-heavy, growing fast |
| Google Gemini | API (OpenRouter) | Google's standalone AI chat |
| Google AI Mode | Scraping (Browserless) | Rolling out in Google Search |
| Microsoft Copilot | Scraping (Browserless) | Bing-integrated AI |
| Claude | API (OpenRouter) | Anthropic's consumer AI |
| Grok | API (OpenRouter) | xAI, integrated with X/Twitter |

**Architecture:** Unified `EngineConnector` interface per engine. API-based engines use OpenRouter with direct API fallback. Scraping engines use Browserless.io.

**Analyzer:** A centralized LLM analyzer extracts structured data (brand mention, position, sentiment, competitors, citations) from each raw engine response. Connectors stay thin — they only send/receive.

---

## Subscription Tiers & Packs

| Resource | Pro (included) | Silver ($29/mo) | Gold ($99/mo) | Platinum ($149/mo) |
|----------|---------------|-----------------|---------------|-------------------|
| Tracked queries | 25 | 50 | 100 | 200 |
| Monitoring frequency | Monthly | Monthly | Weekly | Weekly |
| Manual checks/mo | 0 | 5 | 15 | 50 |
| Website audits/mo | 1 | 2 | 5 | 10 |

- Each tier is a Stripe subscription upgrade — one active tier at a time, higher replaces lower
- Pack definitions stored in `admin_pack_configs` with `app = 'radar'`
- Pricing and limits are admin-adjustable without code changes
- Manual checks are purchased (none included at Pro baseline)

### Cost Analysis

**Per-query cost across all 8 engines + LLM analysis: ~$0.05**

| Tier | Realistic Cost/Mo | Price | Gross Margin |
|------|-------------------|-------|-------------|
| Pro | ~$1.33 | Included in Pro sub | Absorbed |
| Silver | ~$6.25 | $29/mo | ~78% |
| Gold | ~$44.00 | $99/mo | ~56% |
| Platinum | ~$58.00 | $149/mo | ~61% |

### Infrastructure: Browserless.io

Phased plan based on user count:

| Phase | Browserless Plan | Cost/Mo | Users Supported |
|-------|-----------------|---------|-----------------|
| Launch | Prototyping | $25 | ~26 |
| Growth | Starter | $140 | ~240 |
| Scale | Scale | $350 | ~666 |

---

## Data Model

### Shared Table (Renamed)

**`user_profiles`** (renamed from `bofu_profiles`)
- Full rename via migration + code sweep across Blog Engine
- All existing `bofu_profiles` fields remain unchanged
- Radar and future apps read/write core identity and market data here
- Blog Engine-specific tables (`bofu_topics`, `bofu_blogs`, etc.) keep their prefix

### Radar Tables (9)

#### `radar_config`
Per-user Radar settings and state.

| Column | Type | Notes |
|--------|------|-------|
| id | UUID PK | |
| user_id | UUID UNIQUE FK | References auth.users |
| brand_variations | TEXT[] | Alternate business/personal names |
| monitored_engines | TEXT[] | Which of 8 engines to check |
| monitoring_frequency | TEXT | `monthly` \| `weekly` |
| tier | TEXT | `pro` \| `silver` \| `gold` \| `platinum` |
| query_limit | INT | Current max tracked queries (25 default) |
| manual_checks_limit | INT | Monthly manual check allowance |
| audits_limit | INT | Monthly audit allowance |
| stripe_subscription_id | TEXT | Radar-specific Stripe sub |
| stripe_customer_id | TEXT | |
| onboarding_completed | BOOLEAN | Default false |
| last_check_at | TIMESTAMPTZ | |
| next_check_at | TIMESTAMPTZ | |
| created_at | TIMESTAMPTZ | |
| updated_at | TIMESTAMPTZ | |

#### `radar_competitors`
Tracked competitors for SOV comparison.

| Column | Type | Notes |
|--------|------|-------|
| id | UUID PK | |
| user_id | UUID FK | |
| name | TEXT | Competitor business/agent name |
| website_url | TEXT | Optional |
| created_at | TIMESTAMPTZ | |

#### `radar_queries`
Tracked search queries for monitoring.

| Column | Type | Notes |
|--------|------|-------|
| id | UUID PK | |
| user_id | UUID FK | |
| query_text | TEXT | The actual prompt/question |
| category | TEXT | Optional grouping label |
| source | TEXT | `ai_generated` \| `manual` \| `competitor_discovery` |
| is_active | BOOLEAN | Included in monitoring checks |
| created_at | TIMESTAMPTZ | |

#### `radar_query_suggestions`
AI-generated query suggestions (persistent between sessions).

| Column | Type | Notes |
|--------|------|-------|
| id | UUID PK | |
| user_id | UUID FK | |
| query_text | TEXT | Suggested prompt |
| category | TEXT | Auto-categorized |
| status | TEXT | `suggested` \| `added` \| `dismissed` |
| created_at | TIMESTAMPTZ | |

#### `radar_checks`
One row per monitoring run.

| Column | Type | Notes |
|--------|------|-------|
| id | UUID PK | |
| user_id | UUID FK | |
| trigger | TEXT | `scheduled` \| `manual` |
| status | TEXT | `pending` \| `running` \| `completed` \| `completed_partial` \| `failed` |
| engines_checked | TEXT[] | Engine IDs included |
| engines_failed | TEXT[] | Engines that errored (for partial) |
| queries_checked | INT | |
| visibility_score | NUMERIC | Aggregate score at time of check |
| started_at | TIMESTAMPTZ | |
| completed_at | TIMESTAMPTZ | |
| created_at | TIMESTAMPTZ | |

#### `radar_results`
One row per query per engine per check.

| Column | Type | Notes |
|--------|------|-------|
| id | UUID PK | |
| check_id | UUID FK | References radar_checks |
| user_id | UUID FK | |
| query_id | UUID FK | References radar_queries |
| engine | TEXT | `chatgpt` \| `perplexity` \| `gemini` \| `google_aio` \| `google_ai_mode` \| `copilot` \| `claude` \| `grok` |
| brand_mentioned | BOOLEAN | |
| position | INT | Null if not mentioned |
| sentiment | TEXT | `positive` \| `neutral` \| `negative` \| null |
| competitors_mentioned | JSONB | Array of names found |
| citations | JSONB | Array of URLs referenced |
| response_text | TEXT | Full AI response |
| quality_score | NUMERIC | 0–10 per scoring rubric |
| created_at | TIMESTAMPTZ | |

#### `radar_alerts`
In-app alert notifications.

| Column | Type | Notes |
|--------|------|-------|
| id | UUID PK | |
| user_id | UUID FK | |
| check_id | UUID FK | Which check triggered it |
| type | TEXT | See alert types below |
| severity | TEXT | `positive` \| `negative` \| `info` |
| title | TEXT | Short headline |
| message | TEXT | Detail text |
| metadata | JSONB | Query ID, engine, competitor, etc. |
| read | BOOLEAN | Default false |
| created_at | TIMESTAMPTZ | |

**Alert types:**

| Type | Trigger | Severity |
|------|---------|----------|
| `brand_appeared` | Not mentioned previously, now mentioned | `positive` |
| `brand_disappeared` | Was mentioned, now not | `negative` |
| `position_improved` | Position moved up | `positive` |
| `position_declined` | Position moved down | `negative` |
| `new_competitor` | Untracked name appears in results | `info` |
| `competitor_overtook` | Tracked competitor moved above you | `negative` |
| `citation_gained` | Engine started citing your URL | `positive` |
| `citation_lost` | Engine stopped citing your URL | `negative` |
| `audit_score_changed` | Overall audit score changed by >10 pts | `info` |

#### `radar_audits`
One row per website audit run.

| Column | Type | Notes |
|--------|------|-------|
| id | UUID PK | |
| user_id | UUID FK | |
| url_crawled | TEXT | Starting URL |
| status | TEXT | `pending` \| `crawling` \| `analyzing` \| `completed` \| `failed` |
| pages_found | INT | Total pages discovered |
| pages_analyzed | INT | Pages scored |
| overall_score | NUMERIC | Aggregate AI-readiness (0–100) |
| started_at | TIMESTAMPTZ | |
| completed_at | TIMESTAMPTZ | |
| created_at | TIMESTAMPTZ | |

#### `radar_audit_pages`
One row per page analyzed in an audit.

| Column | Type | Notes |
|--------|------|-------|
| id | UUID PK | |
| audit_id | UUID FK | References radar_audits |
| user_id | UUID FK | |
| url | TEXT | Page URL |
| page_type | TEXT | `homepage` \| `service` \| `about` \| `neighborhood` \| `blog` \| `listing` \| `other` |
| title | TEXT | Page title |
| score | NUMERIC | AI-readiness score (0–100) |
| scoring_breakdown | JSONB | Per-signal scores |
| recommendations | JSONB | Actionable suggestion array |
| is_blog | BOOLEAN | For sort prioritization |
| created_at | TIMESTAMPTZ | |

**Scoring breakdown signals (6):**
1. `structured_data` — Schema.org markup (LocalBusiness, RealEstateAgent, FAQPage, Article)
2. `content_depth` — Word count, topical coverage, question-answering quality
3. `authority_signals` — Author info, credentials, E-E-A-T indicators
4. `crawlability` — robots.txt, meta tags, JS rendering accessibility
5. `citation_potential` — Quotable facts, specific data, market stats
6. `internal_linking` — Page connectivity within the site

---

## Visibility Score Formula

### Per-Result Quality Score (0–10)

| Scenario | Points |
|----------|--------|
| Not mentioned | 0 |
| Mentioned negatively | 1 |
| Mentioned neutrally, no clear position | 3 |
| Mentioned positively, no clear position | 4 |
| Mentioned positively, position 4+ | 5 |
| Mentioned positively, position 2–3 | 7 |
| Mentioned positively, position 1 | 8 |
| Mentioned positively, position 1 + citation to your URL | 10 |

### Engine Weight Tiers (stored in `admin_settings`, adjustable)

| Tier | Weight | Engines |
|------|--------|---------|
| Tier 1 (high impact) | 1.5x | Google AI Overviews, ChatGPT, Perplexity |
| Tier 2 (medium impact) | 1.0x | Gemini, Google AI Mode, Claude |
| Tier 3 (emerging) | 0.7x | Copilot, Grok |

### Formula

```
Per engine score = sum(result quality scores) / max possible points for that engine
Weighted engine score = per engine score × engine weight
Visibility Score = sum(weighted engine scores) / sum(engine weights) × 100
```

### Share of Voice

```
Your SOV = your weighted points / (your points + all tracked competitors' points) × 100
```

Calculated per engine and aggregate. Uses same quality-weighted scoring — a #1 recommendation with citation counts more than a 5th-place negative mention.

---

## Pipeline & Background Jobs

### Monitoring Check Pipeline (Inngest)

1. Create `radar_checks` row (status: `running`)
2. Fan out: for each active query × each enabled engine → call connector
3. Run LLM analyzer on each response → extract structured data
4. Write `radar_results` rows with quality scores
5. Compare against previous check → generate `radar_alerts`
6. Compute visibility score → update `radar_checks`
7. Mark check `completed` (or `completed_partial` if engines failed)

**Partial failure:** If some engines fail, save successful results, mark failed engines in `engines_failed`, set status to `completed_partial`, flag in UI.

### Website Audit Pipeline (Inngest)

1. Create `radar_audits` row (status: `crawling`)
2. BFS crawl from homepage using Browserless (up to 50 pages)
3. Classify each page by type
4. Rule-based signal extraction from HTML (schema markup, word count, author tags, robots meta, internal links)
5. Pass extracted signals to LLM (1–2 calls) for scoring and recommendations
6. Write `radar_audit_pages` rows
7. Compute overall score → update `radar_audits`
8. Mark audit `completed`

**Page priority:** Non-blog pages sorted first (homepage, service, about, neighborhood), blogs second.

### Scheduling (Vercel Cron)

- Separate cron endpoint: `/api/cron/radar-checks`
- Hourly check: determines which users have a monitoring check due based on their frequency tier
- Triggers Inngest function for each due user

### Data Retention

- Keep 12 months of `radar_results`
- Scheduled cleanup job archives/deletes older data
- `radar_checks` summary rows kept indefinitely (lightweight)

---

## Onboarding

### Path A: Profile Exists (from Blog Engine)
Guided 3-step form:

1. **Brand Variations** — pre-filled from `user_profiles.full_name` and `business_name`, user adds alternates
2. **Competitors** — text inputs for 3–5 competitor names/businesses
3. **Initial Queries** — AI generates ~20–30 suggestions from profile, user selects which to track

### Path B: No Profile
Chat-based onboarding (same pattern as Blog Engine):

1. Collect core profile data (professional type, market, business focus, website, identity) → writes to `user_profiles`
2. Then the 3 Radar-specific steps from Path A as guided form

### Post-Onboarding
- Auto-queue first monitoring check so dashboard isn't empty on first visit
- Set `radar_config.onboarding_completed = true`
- Redirect to dashboard

---

## UI Structure

### Navigation (5 tabs)

1. **Dashboard** — Visibility score, engine breakdown, recent alerts, quick actions
2. **Monitor** — Detailed check results (query-first default, engine toggle)
3. **Research** — Three sub-tabs: Discover Queries, Competitor Leaderboard, Gap Analysis
4. **Optimize** — Audit summary + page-by-page scores/recommendations
5. **Settings** — Brand variations, competitors, engines, preferences, subscription

### Dashboard (4 sections)

1. **Visibility Score** — Headline number (0–100), trend arrow since last check
2. **Engine Breakdown** — Row of 8 engine cards showing per-engine visibility
3. **Recent Alerts** — Notable changes since last check with severity indicators
4. **Quick Actions** — Run Check, Discover Queries, Run Audit buttons + usage stats (all tracked resource counts)

### Header

`RadarHeader` component — same pattern as `BlogEngineHeader`:
- Logo + "Radar" title
- 5 nav tabs (center)
- Usage badge: query count "15 / 25 queries" (primary limit only)
- Help icon → `RadarHelpModal`
- App switcher
- User menu
- Mobile hamburger menu

### Monitor Page

- **Default view:** Query-first — list of tracked queries, click to expand per-engine results
- **Toggle:** Engine-first — group results by engine
- Historical trend data per query
- Competitor SOV comparison per query

### Research Page (3 sub-tabs)

1. **Discover Queries** — AI-generated suggestions with add/dismiss, manual entry, "Research Query" one-off action (costs manual check credit)
2. **Competitor Leaderboard** — Ranked by visibility score, SOV percentages, engine dominance, trend direction
3. **Gap Analysis** — Queries where competitors appear but you don't, grouped by engine

### Optimize Page

- **Top:** Audit summary — overall score (0–100), comparison to previous audit, signal breakdown chart, metadata
- **Below:** Page list sorted by priority (non-blogs first), grouped by page_type
- Each page row: URL, title, score, worst signal
- Expandable: full signal breakdown + specific recommendations
- "Run New Audit" button with remaining count

---

## File Structure

### Routes

```
app/apps/radar/
  layout.tsx                      — server gate (auth, flag, tier)
  layout-client.tsx               — client wrapper (RadarHeader, ToastProvider)
  page.tsx                        — entry/redirect (check onboarding)
  onboarding/page.tsx             — onboarding flow
  dashboard/page.tsx              — main dashboard
  monitor/page.tsx                — monitoring results
  research/page.tsx               — query discovery + competitive insights
  optimize/page.tsx               — audit results
  settings/page.tsx               — config + subscription
```

### API Routes

```
app/api/apps/radar/
  status/route.ts                 — polling endpoint (check running?)
  checks/route.ts                 — trigger + list monitoring checks
  results/route.ts                — query results for a check
  queries/route.ts                — CRUD tracked queries
  queries/discover/route.ts       — AI query suggestion generation
  competitors/route.ts            — CRUD competitors
  audits/route.ts                 — trigger + list website audits
  alerts/route.ts                 — list + mark read
  config/route.ts                 — radar config read/update
  subscribe/route.ts              — Stripe checkout session
  manage-subscription/route.ts    — Stripe customer portal
  usage/route.ts                  — usage stats
  onboarding/chat/route.ts        — streaming onboarding chat (Path B)
```

### Cron

```
app/api/cron/radar-checks/route.ts  — hourly, determines due checks, triggers Inngest
```

### Components

```
components/radar/
  RadarHeader.tsx                 — app header with nav, usage badge, help
  RadarHelpModal.tsx              — help documentation modal
  RadarUpgradeModal.tsx           — tier selection + Stripe checkout
  dashboard/
    DashboardClient.tsx           — main dashboard orchestrator
    VisibilityScore.tsx           — headline score with trend
    EngineBreakdown.tsx           — per-engine cards
    AlertsFeed.tsx                — recent alerts list
    QuickActions.tsx              — action buttons + usage stats
  monitor/
    MonitorClient.tsx             — query-first / engine-toggle views
    QueryResultCard.tsx           — per-query expandable results
    EngineResultBadge.tsx         — per-engine status indicator
  research/
    ResearchClient.tsx            — sub-tab container
    DiscoverQueries.tsx           — suggestions + manual entry
    CompetitorLeaderboard.tsx     — ranked competitor list
    GapAnalysis.tsx               — missing coverage view
  optimize/
    OptimizeClient.tsx            — audit orchestrator
    AuditSummary.tsx              — overall score + signal chart
    PageList.tsx                  — sortable page results
    PageDetail.tsx                — expandable signal breakdown
  onboarding/
    OnboardingChat.tsx            — Path B: full chat onboarding
    RadarSetupForm.tsx            — Path A: 3-step guided form
  settings/
    SettingsClient.tsx            — config, competitors, engines, subscription
```

### Library

```
lib/radar/
  usage.ts                        — usage tracking (monthly period)
  scoring.ts                      — visibility score + SOV calculation
  prompts.ts                      — query discovery + analyzer prompts
  analyzer.ts                     — LLM result extraction from responses
  crawler.ts                      — website audit BFS crawler
  audit-analyzer.ts               — rule-based extraction + LLM scoring
  connectors/
    index.ts                      — EngineConnector interface + registry
    chatgpt.ts                    — OpenRouter GPT-4o
    claude.ts                     — OpenRouter Claude Sonnet
    perplexity.ts                 — OpenRouter Sonar
    gemini.ts                     — OpenRouter Gemini
    grok.ts                       — OpenRouter Grok
    google-aio.ts                 — Browserless scraper
    google-ai-mode.ts             — Browserless scraper
    copilot.ts                    — Browserless scraper
```

### Inngest Functions

```
lib/inngest/
  radar-check.ts                  — monitoring check pipeline (fan-out)
  radar-audit.ts                  — website audit pipeline
  radar-cleanup.ts                — 12-month data retention cleanup
```

### Types

```
types/radar.ts                    — all Radar type definitions
```

### Migrations

```
supabase/migrations/
  YYYYMMDD000001_rename_bofu_profiles.sql     — bofu_profiles → user_profiles + update FKs/policies
  YYYYMMDD000002_radar_schema.sql             — all 9 radar tables + RLS policies
  YYYYMMDD000003_radar_admin_seed.sql         — admin_settings RADAR flag + pack configs
  YYYYMMDD000004_radar_engine_weights.sql     — engine weight tiers in admin_settings
  YYYYMMDD000005_radar_usage_functions.sql    — RPC increment functions for usage tracking
```

---

## Integration Points

### Existing Code Changes

1. **`lib/feature-flags.ts`** — add `RADAR` flag
2. **`lib/admin-config.server.ts`** — add `getRadarPacks()`, add RADAR to `getFeatureFlags()` fallback
3. **`components/apps/AppsLandingGrid.tsx`** — add Radar to APPS array
4. **`components/layout/AppSwitcher.tsx`** — add Radar to APPS array
5. **`app/apps/page.tsx`** — add Radar usage stats
6. **`app/api/webhooks/stripe/route.ts`** — add Radar subscription event handling
7. **`app/api/app-availability/route.ts`** — add Radar to availability response
8. **`middleware.ts`** — add `/apps/radar` routes (should be covered by existing `/apps/*` pattern)
9. **`vercel.json`** — add radar cron schedule
10. **`env.example`** — add `NEXT_PUBLIC_ENABLE_RADAR`, `BROWSERLESS_API_KEY`
11. **All Blog Engine references to `bofu_profiles`** — update to `user_profiles`

### New Environment Variables

| Variable | Purpose |
|----------|---------|
| `NEXT_PUBLIC_ENABLE_RADAR` | Feature flag (default: false) |
| `BROWSERLESS_API_KEY` | Browserless.io API key |
| `BROWSERLESS_API_URL` | Browserless endpoint URL |

OpenRouter key (`OPENROUTER_API_KEY`) is already configured for Blog Engine.

---

## App Registration

### Feature Flag
- Key: `RADAR`
- Env: `NEXT_PUBLIC_ENABLE_RADAR`
- Default: `false`

### AppsLandingGrid Entry
```
id: "radar"
name: "Radar"
description: "AI search visibility monitoring"
route: "/apps/radar"
icon: <Radar /> (lucide-react)
flagKey: "RADAR"
requiresPro: true
hasUpgrade: true
```

### AppSwitcher Entry
```
id: "radar"
name: "Radar"
route: "/apps/radar"
icon: Radar (lucide-react)
requiresPro: true
```

### Admin Settings Seed
```sql
INSERT INTO admin_settings (key, value) VALUES ('RADAR', 'false');
```

---

## Future Enhancements (Post-v1)

- **Email notifications** — alerts via email (SendGrid/Resend)
- **Slack/webhook notifications** — push alerts to external channels
- **Custom engine weighting** — let users adjust engine importance
- **Matrix view** — queries × engines table for power users
- **Export/reporting** — PDF/CSV stakeholder reports
- **Expanded audit page limit** — beyond 50 pages for larger sites
- **API access** — programmatic access to Radar data for integrations
