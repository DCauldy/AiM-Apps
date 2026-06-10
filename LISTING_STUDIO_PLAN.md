# Listing Studio — Product Plan

> The fifth app on the AiM Apps platform. Turns a single property address into
> a complete listing launch kit: CMA, MLS description, photo prep, and
> launch emails. Replaces the manual workflow of the Cowork-based "Listing
> Command Center" agent and broadens it to any US market via RapidAPI.

---

## 1. Positioning

Listing Studio is the **listing-side** app on the platform, complementing
Hyperlocal (sphere-of-influence email campaigns) and Blog Engine (top-of-funnel
content). It enters the workflow at the moment an agent has a lead with a
property and either needs to win the listing (CMA) or has won it and needs to
launch it (the other five outputs).

Differentiators vs. the Cowork "Listing Command Center" agent:

- **Web app, not desktop-only** — works from any browser, on mobile too via
  Dispatch-equivalent flow if needed later
- **Per-listing project model** with stage tracking (prospect → active →
  archived) so the agent's pipeline is visible at a glance
- **Hosted photo processing** — vision-AI captioning + ordering without the
  agent having to install Claude Desktop or maintain a folder schema
- **Nationwide data** via RapidAPI rather than relying on agent-uploaded
  comps for every CMA
- **Profile reuse** — pulls identity, brokerage, brand colors, license, and
  legal disclaimer from the same `platform_profiles` row Hyperlocal and Blog
  Engine already share

---

## 2. Goals + Non-Goals

**v1 goals:**

1. Ship all six Cowork outputs (CMA, listing description, photo ordering,
   photo captions, DOTW email, HTML email) as a coherent web experience
2. Per-listing stateful workspace with lifecycle stages
3. RapidAPI-powered property prefill + sold-comps pull, with optional CSV
   override when the agent has a richer pull from their MLS
4. Atomic billing — agents only consume an "active listing" slot when they
   promote a prospect; a soft monthly cap on prospect CMAs protects against
   abuse
5. Compliance: Fair Housing + RESPA + MLS-rule guardrails baked into prompts
   AND post-generation validator pass
6. Pack tier ladder mirroring Hyperlocal's pattern (Bronze/Silver/Gold/Diamond)

**Non-goals (v1):**

- MLS-direct integration (RapidAPI suffices for solds + market data; active
  listing inventory is a future feature)
- Long-term photo hosting — photos are processed and discarded; user
  uploads to their ESP's media library for ongoing use
- PDF parsing of MLS reports for subject property facts (form-based with API
  prefill is the v1 path; PDF parsing is deferred — see §13)
- Direct publishing to MLS (every output is a draft the agent reviews and
  pastes manually into their MLS or ESP)
- Photo *editing* (rotate, crop, color-correct) — we accept whatever the
  agent uploads and don't transform pixels
- Auto-recurring schedules — Listing Studio is on-demand, triggered per
  listing. No cron jobs.

---

## 3. User Journey

### The two entry points

**A. Prospect CMA workflow:**

1. Agent has a lead — homeowner considering selling
2. Creates a new listing in Listing Studio, types the address
3. App calls RapidAPI to prefill property facts (beds/baths/sqft/year/lot)
4. Agent reviews + edits the form
5. App fetches sold comps from RapidAPI; agent can upload a comps CSV to
   merge or override
6. CMA runs: adjustment grid + appraised value + marketable value +
   recommended price + seller-facing narrative + internal pricing memo
7. Agent uses the seller-facing narrative in their listing presentation
8. If they win the listing → click **Promote to Active Listing** (consumes
   one monthly slot)
9. If they don't win → listing stays at `prospect` indefinitely (archived
   automatically after 90 days of inactivity)

**B. Active listing launch (after Promote):**

1. With listing now `active`, all six output types unlock
2. Agent generates listing description (Public Remarks)
3. Uploads photos → AI orders + captions them → agent downloads the renamed
   zip + captions text
4. Generates DOTW email (2 variants) for sphere-of-influence outreach
5. Generates HTML email — picks **Announcement** or **With Pricing Context**
   variant
6. Each output is a draft; agent reviews, tweaks, pastes into MLS/ESP

### What never happens

- The app never auto-publishes anything
- The app never modifies the agent's MLS data directly
- The app never sends emails directly (use Hyperlocal for that — or paste
  the HTML into the agent's ESP)

---

## 4. The Six Outputs

### 4.1 CMA (Pricing Analysis)

The heaviest output. Drives the price recommendation.

**Inputs:**

- Subject property facts (form, API-prefilled)
- Sold comps (RapidAPI by default, agent CSV optional)
- Optional market context (RapidAPI market trends by ZIP)

**Pipeline:**

1. Pull/merge comps from RapidAPI + CSV
2. Filter comps by user-configurable radius/recency/property type
3. Deterministic adjustment grid (JS math) — $/sqft, lot, beds/baths,
   garage, condition deltas
4. Compute appraised value (raw grid average), marketable value (top
   tertile of grid), recommended list price (bridges the two with
   strategic adjustment)
5. Claude writes **seller-facing narrative** (`cma-seller-facing.md`) —
   conversational, justifies the price with the comps
6. Claude writes **internal memo** (`cma-internal-memo.md`) — terse,
   pricing rationale + risks the agent should know

**Outputs stored on `ls_cma_runs`:**

- `comps` JSONB — final merged comp set with adjustments
- `adjustment_grid` JSONB — the math, for transparency
- `appraised_value`, `marketable_value`, `recommended_price` (cents)
- `seller_narrative_md`, `internal_memo_md`

### 4.2 Listing Description (MLS Public Remarks)

**Inputs:** subject property facts + (optional) any agent-provided notes

**Pipeline:** single Claude call with the Cowork `listing-remarks-writer`
prompt — noun-dense, feature-rich, compliant, capped at the agent's MLS
character limit (default 1000)

**Output:** `description` row in `ls_outputs` — markdown body

### 4.3 Photo Ordering

**Inputs:** uploaded photos (jpg/png/heic)

**Pipeline:**

1. Upload to Supabase Storage (temporary bucket, 1hr TTL)
2. Vision model (Claude Sonnet) sees all photos at once
3. Returns suggested display order: front exterior first, logical
   walkthrough flow, outdoor + garage last
4. Agent downloads a zip with photos renamed `01-front-exterior.jpg`,
   `02-foyer.jpg`, etc.
5. Photos auto-deleted from storage after zip is downloaded or 1hr elapses

**Output:** `ls_photos` rows with `suggested_order`; downloadable zip
served from the API route

### 4.4 Photo Captions

**Inputs:** same photos (typically run together with ordering)

**Pipeline:** vision model generates one MLS-ready caption per photo in
display order

**Output:** caption text per photo on `ls_photos.caption`, exported as a
combined `photo-captions.md` document the agent pastes into their MLS

### 4.5 DOTW Email (Deal of the Week)

Plain-text email for the agent's sphere-of-influence list. Reads like a
personal note, not a marketing blast.

**Inputs:** listing + agent profile + voice notes

**Pipeline:** Claude generates **two variants** so the agent picks the
one that fits the tone of the week (question-led vs. numbered-reasons)

**Output:** `dotw_email` row in `ls_outputs`, two variants with subject
lines + preheaders

### 4.6 HTML Email (Just Listed)

Branded campaign email built in the agent's colors and fonts. Pasted
into their ESP's code editor.

**Inputs:** listing + agent profile + hosted image URLs (agent provides
the URLs after uploading photos to their ESP) + variant choice

**Two variants (agent picks):**

- **Announcement** — clean "Just Listed in {neighborhood}", key facts,
  CTA. Works for any listing.
- **With Pricing Context** — adds a "Why this price" block pulled from
  the CMA (recommended price, comp positioning, 1 market-trend line).
  Only offered when a CMA exists for the listing.

**Output:** `html_email` row in `ls_outputs` with full inline-styled HTML

---

## 5. Pack Ladder + Pricing

**Pro base (included):** 1 active listing/mo, 10 prospect CMAs/mo

| Tier | Active listings/mo | Prospect CMAs/mo | Price |
|---|---|---|---|
| Bronze | 3 | 20 | $49/mo |
| Silver | 6 | 30 | $99/mo |
| Gold (best value) | 10 | 30 | $179/mo |
| Diamond | unlimited (fair use) | 30 | $299/mo |

**One billing meter (active listings)** — promoting a prospect to active
consumes the slot. Refund on pipeline failure, matching the Blog Engine
pattern.

**Soft cap on prospect CMAs across all tiers** — 30/mo even on Diamond.
Prevents "run a CMA for every house in the MLS" abuse.

Pricing mirrors Hyperlocal's curve roughly: Bronze slightly higher
($49 vs. Hyperlocal's $39) reflecting the heavier per-listing AI work
(vision model on photos + structured CMA + 6 outputs).

---

## 6. Data Model

All tables prefixed `ls_*`. RLS scoped by `user_id`.

```sql
ls_listings
  id UUID PK
  user_id UUID FK → auth.users
  profile_id UUID FK → platform_profiles
  address TEXT, address_normalized TEXT
  property_facts JSONB        -- beds, baths, sqft, year_built, lot_sqft, parking, etc.
  prefilled_from_api BOOLEAN  -- audit: was the form prefilled or fully manual?
  stage TEXT CHECK (stage IN ('prospect', 'active', 'archived'))
  promoted_at TIMESTAMPTZ     -- when stage flipped to active (consumes slot)
  archived_at TIMESTAMPTZ
  notes TEXT                  -- agent's freeform notes
  created_at, updated_at

ls_cma_runs
  id UUID PK
  listing_id UUID FK → ls_listings
  comps_source TEXT           -- 'rapidapi', 'csv', 'both'
  comps JSONB                 -- final merged set with adjustments
  adjustment_grid JSONB       -- math breakdown
  appraised_value_cents BIGINT
  marketable_value_cents BIGINT
  recommended_price_cents BIGINT
  seller_narrative_md TEXT
  internal_memo_md TEXT
  pipeline_error TEXT
  generated_at TIMESTAMPTZ

ls_outputs                    -- description, dotw_email, html_email, captions_doc
  id UUID PK
  listing_id UUID FK → ls_listings
  type TEXT CHECK (type IN ('description', 'captions_doc', 'dotw_email', 'html_email'))
  variant TEXT                -- for dotw: 'a' or 'b'; for html: 'announcement' or 'pricing'
  content TEXT
  status TEXT                 -- 'draft', 'finalized'
  compliance_warning TEXT     -- set by validator pass; user can override
  pipeline_error TEXT
  generated_at TIMESTAMPTZ

ls_photos                     -- temporary, 1hr TTL
  id UUID PK
  listing_id UUID FK → ls_listings
  original_filename TEXT
  suggested_order INT         -- AI-determined display order
  caption TEXT
  storage_path TEXT           -- Supabase Storage key
  expires_at TIMESTAMPTZ      -- 1hr after upload
  processed_at TIMESTAMPTZ
  created_at

ls_comps_uploads              -- optional CSV override
  id UUID PK
  listing_id UUID FK → ls_listings
  raw_csv TEXT
  parsed_rows JSONB
  uploaded_at TIMESTAMPTZ

ls_user_packs                 -- mirrors hl_user_packs
  user_id UUID PK FK
  pack_id TEXT
  tier TEXT
  stripe_subscription_id TEXT
  stripe_customer_id TEXT
  status TEXT
  created_at, updated_at

ls_usage                      -- monthly meter
  user_id UUID
  month_start DATE
  active_listings_promoted INT  DEFAULT 0
  cma_runs_count INT            DEFAULT 0
  PRIMARY KEY (user_id, month_start)
```

**Atomic reservation RPC** (mirrors Blog Engine's `try_reserve_blog_slot`):

```sql
try_reserve_active_listing_slot(p_user_id UUID, p_month_start DATE) RETURNS JSONB
-- Returns { reserved, active_listings_promoted, active_listings_limit }
-- Used on "Promote to Active Listing" action
```

Photo retention enforced by a Postgres trigger + scheduled cleanup function
that deletes `ls_photos` rows + Supabase Storage objects where
`expires_at < now()`.

---

## 7. Route Surface

### UI routes

| URL | Purpose |
|---|---|
| `/apps/listing-studio` | Redirect to `/listings` |
| `/apps/listing-studio/onboarding` | First-run setup (profile check, RapidAPI confirmation) |
| `/apps/listing-studio/listings` | Listing dashboard with Active / Prospect / Archived tabs |
| `/apps/listing-studio/listings/new` | Create flow: address → API prefill → form review |
| `/apps/listing-studio/listings/[id]` | Workspace, tabs: Overview · CMA · Description · Photos · DOTW · HTML Email |
| `/apps/listing-studio/settings` | Pack mgmt, profile link, default preferences, upgrade |

### API routes

```
POST   /api/apps/listing-studio/listings                 Create new listing (prospect)
GET    /api/apps/listing-studio/listings                 List w/ stage filter
GET    /api/apps/listing-studio/listings/[id]            Single listing
PATCH  /api/apps/listing-studio/listings/[id]            Edit (facts, notes, archive)
POST   /api/apps/listing-studio/listings/[id]/promote    Prospect → Active (consumes slot)
POST   /api/apps/listing-studio/listings/[id]/cma        Generate CMA
POST   /api/apps/listing-studio/listings/[id]/description Generate description
POST   /api/apps/listing-studio/listings/[id]/photos     Upload + AI process
GET    /api/apps/listing-studio/listings/[id]/photos/zip Download renamed zip
POST   /api/apps/listing-studio/listings/[id]/dotw       Generate DOTW (2 variants)
POST   /api/apps/listing-studio/listings/[id]/html-email Generate HTML email (variant param)
POST   /api/apps/listing-studio/listings/[id]/comps-upload Upload CSV override

POST   /api/apps/listing-studio/property-lookup          RapidAPI: address → property facts
POST   /api/apps/listing-studio/comps-lookup             RapidAPI: solds in radius

POST   /api/apps/listing-studio/subscribe                Stripe Checkout for pack
POST   /api/apps/listing-studio/manage-subscription      Stripe Billing Portal
GET    /api/apps/listing-studio/usage                    Header chip data
```

---

## 8. AI Pipeline Architecture

### Sync vs. Inngest split

| Output | Sync (route) | Inngest |
|---|---|---|
| Property lookup | ✓ | — |
| Description | ✓ (dev), ✓ (prod) | — (fast, single Claude call) |
| DOTW email | ✓ (dev), ✓ (prod) | — |
| HTML email | ✓ (dev), ✓ (prod) | — |
| CMA | ✓ (dev) | ✓ (prod, multi-step) |
| Photo processing | ✓ (dev) | ✓ (prod, vision is slow) |

Matches Blog Engine's pattern: lighter outputs run inline, heavier
multi-step or vision-AI outputs go through Inngest with retry + observability.

### Models (via OpenRouter)

- **Property lookup** — no AI, direct RapidAPI call
- **CMA grid math** — deterministic JS, no AI
- **CMA narrative** — Claude Sonnet
- **Description** — Claude Sonnet
- **Photo ordering + captions** — Claude Sonnet (vision)
- **DOTW email** — Claude Sonnet
- **HTML email copy blocks** — Claude Sonnet
- **Compliance validator pass** — Claude Haiku (cheap, fast)

All model selection lives in `lib/openrouter.ts` helpers, same pattern as
Blog Engine.

---

## 9. Photo Handling Strategy

The single biggest architecture decision. Chosen: **process-then-discard**.

### Flow

1. Agent drag-drops photos in browser
2. Browser uploads directly to a per-listing Supabase Storage prefix
3. API route triggers vision-AI pipeline:
   - Reads each photo (signed URLs valid for 1hr)
   - Determines display order
   - Generates per-photo caption
   - Writes `suggested_order` + `caption` to `ls_photos` rows
4. UI shows agent the proposed order + captions; agent can edit/reorder
5. Agent clicks **Download Renamed Zip** — backend streams a zip with
   files renamed per order + a `captions.md` companion
6. After download (or 1hr from upload, whichever first), Supabase Storage
   objects are deleted by a scheduled cleanup function

### What we never do

- Store photos for the long term
- Serve photos at email send time (zero email-render bandwidth on our side)
- Modify photo pixels (no rotation/crop/color)

### Storage cost ceiling

At any moment we're holding ~1hr of active processing photos. For 100 agents
each processing 30 photos × 5MB = 15GB peak rolling. Supabase Storage at
$0.021/GB/mo ≈ negligible. Egress is the only cost driver, and we limit
egress to the agent downloading their own zip once.

---

## 10. RapidAPI Integration

**Endpoint provider:** `us-housing-market-data1` via RapidAPI.

**Wrapper:** `lib/listing-studio/rapidapi.ts` exporting:

```ts
lookupProperty(address: string): Promise<PropertyFacts>
fetchSoldComps(criteria: CompsCriteria): Promise<RawComp[]>
fetchMarketTrends(zip: string): Promise<MarketTrends>
```

**Env var:** `RAPIDAPI_KEY`

**Caching:** per-listing cache (write API responses to `ls_listings.property_facts`
or a sub-table) so repeat operations on the same listing don't re-hit the
API. Especially important for CMA — comp pulls can be expensive depending
on RapidAPI's per-call pricing tier.

**Failure modes:**

- API down → property prefill falls back to fully manual form, CMA falls
  back to CSV-only mode (with a clear warning)
- API returns sparse data → user gets a banner explaining the gaps and
  asking them to fill missing fields

---

## 11. Compliance: Two-Layer

Real estate has hard legal lines: Fair Housing (no discrimination on
protected classes), RESPA (no kickback-like language with lenders), MLS
rules (no agent contact info in Public Remarks in many markets).

**Layer 1 — system-prompt guardrails:**

Every Claude prompt includes the same compliance preamble pulled from
`lib/listing-studio/compliance.ts`:

- No school quality ratings (use neighborhood proximity, not ratings)
- No demographic descriptors ("family-friendly", "good neighborhood", etc.
  are forbidden)
- No steering language
- No lender or financing recommendations
- No agent contact details in Public Remarks
- Always include relevant license + Equal Housing in HTML email footer

**Layer 2 — post-generation validator:**

Every output passes through a Haiku-class "compliance check" call before
saving:

```ts
checkCompliance(content: string, outputType: string): {
  passed: boolean
  warning: string | null
  flagged_phrases: string[]
}
```

If `passed: false`, the output is still saved with `compliance_warning` set;
the UI surfaces a banner with the flagged phrases + an **"I've reviewed this"**
override the agent can click. We don't block usage — agents are licensed
professionals responsible for their own output — but we make the risk visible.

---

## 12. Build Order

Each chunk is a PR-sized commit. Dependency-ordered.

### Slice 1 — Schema + billing infra

- Migration: all `ls_*` tables, RLS policies, `try_reserve_active_listing_slot` RPC, photo TTL cleanup function
- `lib/listing-studio-packs.ts` — pack ladder, helpers
- `lib/listing-studio/usage.ts` — monthly meter
- `lib/listing-studio/rapidapi.ts` — wrapper with env-key auth
- Pack seeds in `admin_pack_configs`

### Slice 2 — Listings CRUD + create flow

- `/api/apps/listing-studio/listings` GET/POST/PATCH
- `/api/apps/listing-studio/property-lookup`
- `/apps/listing-studio/listings/new` UI
- `/apps/listing-studio/listings` dashboard with Active/Prospect/Archived tabs
- Promote-to-active endpoint with atomic slot reservation

### Slice 3 — CMA pipeline

- `lib/listing-studio/cma/` — adjustment grid, comp filtering, narrative + memo prompts
- `lib/inngest/functions/listing-studio-cma.ts` — Inngest function for the heavy path
- `/api/apps/listing-studio/listings/[id]/cma` POST
- `/api/apps/listing-studio/comps-lookup` for RapidAPI solds
- `/api/apps/listing-studio/listings/[id]/comps-upload` for CSV
- CMA tab UI in the workspace

### Slice 4 — Description + compliance validator

- `lib/listing-studio/compliance.ts` — guardrails + Haiku validator
- `lib/listing-studio/prompts/description.ts`
- `/api/apps/listing-studio/listings/[id]/description`
- Description tab UI with compliance-warning surface

### Slice 5 — Photo upload + vision processing

- Supabase Storage bucket + RLS
- Photo upload route with signed-URL generation
- `lib/inngest/functions/listing-studio-photos.ts` — vision pipeline
- Zip download endpoint
- Photos tab UI: drag-drop, AI suggestion grid, reorder, download

### Slice 6 — DOTW + HTML email outputs

- Prompts + templates for both
- HTML email render layer reusing the platform's brand tokens
- Routes + UI tabs

### Slice 7 — Header chip, header nav, AppSwitcher entry

- `LISTING_STUDIO_PACKS` referenced in `getListingStudioPacks` admin-config helper
- `ListingStudioHeader.tsx` with usage chip + upgrade modal trigger
- AppsShowcase entry on `/apps`
- AppSwitcher entry

### Slice 8 — Stripe webhook + manage subscription

- Add `listing_studio_*` branches to all 3 Stripe webhook event types
- `/api/apps/listing-studio/subscribe` + `/api/apps/listing-studio/manage-subscription`
- Settings tab: Subscription mgmt (mirrors Hyperlocal pattern)

### Slice 9 — Onboarding + settings + polish

- `/apps/listing-studio/onboarding` — profile check, RapidAPI key reminder,
  "create your first listing" CTA
- Settings tabs: Defaults (CMA radius/recency, photo preferences), Upgrade
- Loading skeletons
- Dashboard health rail (CMA cache status, RapidAPI quota awareness)
- `LISTING_STUDIO` feature flag wiring in `lib/feature-flags.ts` + admin

---

## 13. Future Enhancements (Deferred from v1)

Captured here so they don't get lost:

- **MLS PDF upload + parse** for subject property facts. Multi-format
  parser is painful but agents already have these exports. Diamond-tier
  perk.
- **Direct ESP photo upload** — instead of agent downloading zip + uploading
  to Mailchimp/ActiveCampaign, push photos straight to their ESP's media
  library via API. Gold/Diamond perk.
- **Active comp inventory** — RapidAPI doesn't reliably give current active
  MLS listings. Future integration with an MLS aggregator (Spark API,
  Bridge Interactive) for true "actives + pending + solds" comp set.
- **Multi-MLS exports** — agents licensed in multiple metros currently
  re-create comp pulls per region. Cross-region comp normalization.
- **Auto-promote after Stripe checkout** — when an agent buys a higher
  pack, automatically clear any stuck prospects waiting for slot.
- **Listing presentation export** — combine the CMA seller narrative +
  a few comp visuals into a PDF the agent emails to the seller before
  the listing meeting.
- **Photo enhancement** — rotation, color correction, sky replacement.
  Different product category; likely never.
- **Co-listing agent support** — share a listing across two agents (slot
  consumed against one; both can edit). Currently single-owner.
- **Cron auto-archive** of `prospect` listings idle for 90 days, with
  optional pre-archive email to the agent.

---

## 14. Open Questions (Resolve Before Building)

None currently — all design decisions locked as of plan finalization.
Pricing can be adjusted post-MVP based on conversion data without code
changes (Stripe Price IDs are admin-editable per the existing pack flow).

---

## 15. Glossary

- **CMA** — Comparative Market Analysis. The pricing analysis output.
- **Comps** — Comparable properties used to estimate a subject's value.
- **DOTW** — Deal of the Week. A weekly plain-text email to the agent's
  sphere-of-influence list highlighting a featured listing.
- **MLS** — Multiple Listing Service. Regional databases of listings.
- **Public Remarks** — The MLS-facing listing description, visible to
  consumers on Zillow/Redfin/etc.
- **Pack** — A purchasable subscription tier on top of Pro membership.
  Mirrors the same word used by Hyperlocal, Blog Engine, Radar.
- **Slot** — One billable unit of capacity. For Listing Studio, one
  active-listing slot = one monthly listing promotion.
- **Stage** — The lifecycle status of a listing. Prospect → Active →
  Archived.
