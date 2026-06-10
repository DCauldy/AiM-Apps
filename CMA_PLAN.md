# CMA — Product Plan (v2, slimmed)

> **Pivot from the original Listing Studio scope.** Previously: 5 marketing outputs per listing (CMA, description, photos, HTML email, etc.). Now: **automated quarterly CMA delivery to past clients sourced from the agent's CRM.** Replaces the manual workflow of "CMA a Day" tooling that exists in the industry today.
>
> Long-term vision: a standalone product (separate from AiM Apps) that becomes the modern client-value-tracking platform for real estate agents.

---

## 1. Positioning

**Past-client nurture engine driven by automated CMAs.** An agent connects their CRM, the system pulls past clients who have a known property address, and a fresh CMA is delivered to each client on a configurable cadence (default 90 days).

The agent gets:
- Top-of-mind awareness with past clients → more repeat + referral business
- Per-client engagement signals (opens, clicks) → warm-lead flags worth a phone call
- Tracked value history per client → narrative threading ("your home is up 4.2% since our last CMA in March")
- Zero per-client manual work after the initial CRM connection

The past client gets:
- A genuinely useful, well-designed quarterly home valuation
- Sent FROM the agent who closed their deal (relationship maintenance, not cold marketing)
- Mobile-friendly landing page with adjustment-grid math, comp visuals, and market trends

**Industry context:** "CMA a Day" is an existing category (Cloud CMA Live, HomeBeat, RPR). All current players are clunky, PDF-centric, or expensive. We win on:
- Modern, well-designed presentation (the hero map + glass card + comp cards we already built)
- AI narrative that reads personal, not boilerplate
- Mobile-first landing page (not PDF attachments)
- Adjustment-grid CMA math (not a Zestimate copy-paste)

---

## 2. Goals + Non-Goals

**v2 goals:**
1. Single output type — the CMA, delivered as email + landing page
2. CRM-sourced client list (FUB, Lofty, Sierra, BoldTrail — match Hyperlocal's CRM scope)
3. Agent-configurable global cadence (default 90 days) with per-client overrides
4. Email inline summary with CTA → full mobile-responsive landing page
5. Per-client CMA history (for "vs your last CMA" comparisons)
6. Engagement tracking (opens, clicks → warm-lead surface)
7. Pack billing — same Bronze/Silver/Gold/Diamond pattern, capped by active clients on cadence

**Explicit non-goals (was in v1, dropped in v2):**
- ❌ Listing-marketing outputs (description, photos, HTML just-listed email)
- ❌ Lifecycle stages (prospect / active / archived) — every record is a "client"
- ❌ Manual address entry as the primary flow (still allowed for one-off clients, but secondary)
- ❌ Long-term photo hosting / vision processing for property photos
- ❌ MLS direct integration / Public Remarks generation
- ❌ DOTW emails (was already cut)
- ❌ Per-listing workspace with 5 tabs

**Future maybe-not-now:**
- SMS delivery alongside email
- Branded PDF export for client-requested copies
- Quarterly anniversary touch (separate from CMA — "5 years in your home today")
- Reverse contact enrichment (look up past clients NOT in CRM via title records)
- Property-watcher mode for prospective buyers (CMA on homes they didn't buy yet)

---

## 3. User Journey

**One-time setup (~10 min):**
1. Agent connects their CRM (OAuth or API key, same UX as Hyperlocal)
2. App pulls all contacts with a stored address + a closing-related tag (configurable per CRM)
3. Agent reviews + selects which past clients to enroll (could be all-by-default with deselect)
4. Agent confirms cadence default (90 days), sender profile (uses platform_profiles), email connection (Mailchimp / ActiveCampaign / Resend / etc. — borrow Hyperlocal email connections)
5. App schedules the first CMA delivery batch — staggered over 1-2 weeks so the agent isn't blasting all clients at once

**Ongoing (zero work per client):**
- Cadence scheduler fires on each client's due date
- CMA is auto-generated (RapidAPI property + comps + trends → adjustment grid → AI narrative)
- Email goes out with inline summary + landing-page link
- Per-delivery row saved to `cma_client_deliveries` with sent timestamp, comp count, recommended price
- Opens / clicks tracked via ESP webhooks (already wired in Hyperlocal)

**Agent-facing dashboard:**
- Client list with last-CMA date, next-due date, last-known value, engagement state (cold / opened / clicked)
- Per-client view: full CMA history with values plotted over time, all engagement events
- Bulk actions: pause client, change cadence, force-deliver now

---

## 4. The One Output — Recurring CMA Delivery

**Same CMA we already built, repackaged for delivery:**

The CMA pipeline + adjustment grid + AI narrative + hero map + comp cards we've already polished stay. They become the **landing page** that the past client opens. The agent never sees the "Generate CMA" button — it fires automatically on cadence.

**Email body (inline summary):**
- Greeting personalized to the client (`Hi {first_name},`)
- One-line headline: "Your home at {address} is now valued around ${recommended_price}"
- Hero image (Mapbox map thumbnail or the Zillow photo)
- Three big stats: estimated value, vs-last-CMA delta, recent neighborhood activity count
- CTA button: "See your full report" → landing page
- Signature from the agent (pulled from `platform_profiles`)
- Compliance footer (license, Equal Housing, unsubscribe — Hyperlocal pattern)

**Landing page (full CMA):**
- Same hero + cards we already built
- "Vs your last CMA" panel when prior delivery exists (delta + spark)
- "Talk to {agent_name}" CTA → phone link, calendly link, or email reply
- Mobile-responsive (already is via Tailwind)
- No login required — accessed via signed token in the URL

---

## 5. Pack Ladder (revised for new model)

Billing meter is **clients on active cadence** (not "active listings" anymore).

| Tier | Active clients | Price |
|---|---|---|
| Pro base | 25 | included |
| Bronze | 100 | $49/mo |
| Silver | 250 | $99/mo |
| Gold (best value) | 500 | $179/mo |
| Diamond | unlimited (fair use) | $299/mo |

**Cost model assumptions:** Each client costs roughly 1 RapidAPI property lookup + 1 comps call + 1 trends call + 2 Claude calls (narrative + memo) every 90 days. So a 250-client agent ≈ 830 client-CMAs / year ≈ 3,300 API calls + 1,700 Claude calls / year. Manageable.

**Soft caps everyone gets:**
- 50 manual "send now" overrides per month
- 7-day minimum cadence (can't spam past clients daily)

---

## 6. Data Model (revised)

**Naming convention:** new tables get the `cma_*` prefix (cleaner than continuing `ls_*` for a product that's no longer "Listing Studio"). Existing `ls_cma_runs` keeps its name — it's the CMA-execution table the new pipeline still uses.

**Tables to keep:**
- `ls_cma_runs` → keep as-is. Becomes the per-delivery CMA-execution record.
- `ls_user_packs` → keep (or rename to `cma_user_packs` for cleanliness; functionally unchanged).

**Tables to drop:**
- `ls_listings` → replaced by `cma_clients`
- `ls_outputs` → not needed (no description / captions / emails as separate outputs)
- `ls_photos` → not needed
- `ls_comps_uploads` → drop (manual CSV not part of v2; auto-pipeline only)

**New tables:**

```sql
cma_crm_connections          -- mirrors hl_crm_connections (FUB, Lofty, etc.)
  id, user_id, profile_id, platform, label, is_active,
  credentials (encrypted), last_synced_at, last_error,
  created_at, updated_at

cma_email_connections        -- mirrors hl_email_connections (Mailchimp, AC, Resend)
  id, user_id, profile_id, provider, email_address, display_name,
  is_default, is_active, …provider-specific fields,
  created_at, updated_at

cma_clients                  -- past clients pulled from CRM (or manual)
  id, user_id, profile_id, crm_connection_id (nullable for manual),
  crm_contact_id (nullable),
  first_name, last_name, email, phone, address, address_normalized,
  property_facts (jsonb — zpid, lat/lon, sqft, beds, baths, etc.),
  source (crm / manual),
  enrolled BOOLEAN,         -- agent opted them in; false = ignored
  cadence_days INT,         -- per-client override; NULL = use agent default
  next_due_at TIMESTAMPTZ,
  paused BOOLEAN,
  last_delivered_at TIMESTAMPTZ,
  delivered_count INT DEFAULT 0,
  created_at, updated_at

cma_client_deliveries        -- per-delivery record (1 row per cadence cycle)
  id, client_id, cma_run_id (FK → ls_cma_runs),
  delivered_at TIMESTAMPTZ,
  email_subject TEXT, email_html TEXT, landing_page_token TEXT (unique),
  -- engagement
  opened_at, opened_count INT,
  clicked_at, clicked_count INT,
  replied_at,
  -- value snapshot for "vs last CMA" math
  recommended_price_cents, estimated_value_cents, marketable_value_cents,
  created_at

cma_agent_settings           -- global per-agent prefs
  user_id PK,
  default_cadence_days INT DEFAULT 90,
  default_email_connection_id,
  reminder_lead_days INT DEFAULT 7,            -- pre-send draft notification
  manual_review_required BOOLEAN DEFAULT FALSE, -- block auto-send until agent approves
  updated_at
```

**Atomic operations:**
- Reserve a client slot when enrolling — same `try_reserve_active_listing_slot` pattern, renamed to `try_reserve_client_slot`
- The cadence cron just selects from `cma_clients` where `enrolled AND NOT paused AND next_due_at <= now()` — no contention, fire-and-forget per row

---

## 7. Route Surface (revised)

**Path naming:** the internal slug stays `listing-studio` (already in DB references, file paths, AppSwitcher entries, Stripe webhook branches — pure renaming churn for no functional gain), but every user-facing label says **"CMA"**. App is "CMA" in the AppSwitcher, in `/apps`, in the header chip, in marketing. If we ever need a fully clean rebrand, we can do a single big rename PR later.

| URL | Purpose |
|---|---|
| `/apps/listing-studio` | Redirect to dashboard |
| `/apps/listing-studio/onboarding` | First-run: connect CRM → connect ESP → review clients → confirm cadence |
| `/apps/listing-studio/dashboard` | Overview: client count, deliveries this month, engagement metrics, next 10 due |
| `/apps/listing-studio/clients` | Client list (filter: enrolled / paused / cold / warm) |
| `/apps/listing-studio/clients/[id]` | Per-client view: CMA history, engagement events, manual send, pause, edit address/cadence |
| `/apps/listing-studio/settings` | Cadence default, ESP, CRM, Upgrade tab |
| `/cma/[token]` | Public landing page (no auth — the URL the past client clicks from email) |

**API:**

```
GET    /api/apps/listing-studio/clients                 list w/ filters
POST   /api/apps/listing-studio/clients                 create manual client
GET    /api/apps/listing-studio/clients/[id]            single + history
PATCH  /api/apps/listing-studio/clients/[id]            enrollment, cadence, paused, edits
POST   /api/apps/listing-studio/clients/[id]/send-now   force one delivery off-cadence

POST   /api/apps/listing-studio/crm-connections         add CRM (OAuth callback / API key)
POST   /api/apps/listing-studio/crm-connections/[id]/sync   pull / refresh contacts

POST   /api/apps/listing-studio/email-connections       borrow Hyperlocal connectors verbatim
DELETE /api/apps/listing-studio/email-connections/[id]

POST   /api/apps/listing-studio/settings                update agent defaults

GET    /cma/[token]                                     public landing page (server component)
POST   /api/cma/[token]/event                           open/click webhook target
```

---

## 8. Inngest Functions

| Function | Trigger | What it does |
|---|---|---|
| `cma-cadence-tick` | Vercel cron, hourly | SELECT clients due in next hour → for each: enqueue `cma-deliver` event |
| `cma-deliver` | Event from cadence-tick OR send-now route | Run CMA pipeline → render email + landing page token → send via agent's ESP → write `cma_client_deliveries` row → bump `next_due_at` |
| `cma-crm-sync` | Cron daily OR manual button | Refresh contacts from each connected CRM. New contacts → auto-create `cma_clients` (NOT auto-enrolled — agent reviews). |
| (reused) `listing-studio-cma` | Internal step inside `cma-deliver` | The CMA pipeline we already built |

---

## 9. Compliance Posture (preserved)

Same Fair Housing / RESPA / MLS / no-school-ratings / no-demographics guardrails baked into the AI narrative prompts. Same two-layer (system preamble + Haiku validator) approach. The CMA narrative becomes consumer-facing (sent to past clients) so this matters more, not less.

Unsubscribe links in every email (CAN-SPAM compliance). Honor unsubscribes by setting `paused=true` on the client and storing in a suppression list (or shared platform suppression).

---

## 10. Build Order (revised)

Existing CMA pipeline is the centerpiece. Most work is around it.

### Wave 1 — Schema rip + reseed
- Migration: DROP `ls_listings`, `ls_outputs`, `ls_photos`, `ls_comps_uploads`
- Migration: CREATE `cma_clients`, `cma_client_deliveries`, `cma_crm_connections`, `cma_email_connections`, `cma_agent_settings`
- Update `try_reserve_active_listing_slot` → `try_reserve_client_slot` (semantic rename)
- Update `lib/listing-studio-packs.ts` to new meter names (active clients, not active listings)

### Wave 2 — CRM + email connection plumbing
- Copy Hyperlocal `hl_crm_connections` patterns → `cma_crm_connections`
- Copy Hyperlocal `hl_email_connections` patterns → `cma_email_connections`
- New `lib/listing-studio/crm/{fub,lofty,sierra,boldtrail}.ts` connectors (thin wrappers over the Hyperlocal versions)

### Wave 3 — Client list + per-client view
- `/clients` dashboard with filter tabs
- `/clients/[id]` workspace (keeps the CMA hero + comp cards from current Listing Studio — that visual surface carries forward)
- Bulk enroll / pause / cadence-set actions

### Wave 4 — Cadence + delivery
- Cron + Inngest `cma-cadence-tick` + `cma-deliver` functions
- Email template (inline summary)
- Landing page route `/cma/[token]` (server component, no auth)
- Per-delivery row in `cma_client_deliveries`

### Wave 5 — Engagement tracking
- Webhook endpoints for ESP open/click events
- Surface engagement on the per-client view + dashboard (warm flag)

### Wave 6 — Onboarding + settings + polish
- `/onboarding`: CRM connect → ESP connect → review clients → confirm cadence
- `/settings` with Cadence, ESP, CRM, Upgrade tabs
- Header chip (clients-on-cadence usage)

---

## 11. What We Already Have That Carries Forward

- ✅ CMA pipeline (RapidAPI + adjustment grid + AI narrative)
- ✅ Adjustment-grid math (`lib/listing-studio/cma/adjustment-grid.ts`)
- ✅ Subject hero (Mapbox dark map + glass card with chips + Zillow link)
- ✅ Comp cards with hover-expand adjustment math
- ✅ Single-column narrative + memo cards w/ icons
- ✅ Compliance preamble + Haiku validator
- ✅ Pack tier + atomic reservation pattern
- ✅ Stripe webhook + billing
- ✅ Property prefill + lat/lon + image normalization

About 40% of the existing Listing Studio code carries forward unchanged.

---

## 12. What Gets Deleted

- `app/apps/listing-studio/listings/new/` (manual create flow becomes secondary, not primary)
- `app/api/apps/listing-studio/listings/[id]/promote/` (no stage lifecycle)
- `app/api/apps/listing-studio/listings/[id]/description/` + `…/photos/` + `…/html-email/`
- `components/listing-studio/description/` + `photos/` + `emails/`
- `lib/listing-studio/photos/` (storage, prompts, pipeline)
- `lib/inngest/functions/listing-studio-photos.ts`
- DB tables: `ls_outputs`, `ls_photos`, `ls_comps_uploads`, `ls_listings` (replaced)

---

## 13. Open Questions for Future Sessions

- Per-client cadence configurability — global default with overrides confirmed; UI surface for the override?
- Landing page domain — `apps.aimarketingacademy.com/cma/...` or a custom domain per agent (white-label down the road)?
- Reply handling — if a past client replies to the CMA email, where does it land? The agent's inbox (via reply-to), or a unified inbox in the app?
- Pause vs unsubscribe — distinct user actions (pause = temporary, unsubscribe = honored CAN-SPAM), or merge?
- New construction handling — properties Zillow doesn't have a record for. Agent fallback to manual entry?
- Standalone billing — keeping pack-tier inside AiM Apps for now, or splitting Stripe products from day one in anticipation of the standalone product?
- Branding — display name is "CMA" everywhere user-facing. Internal slug stays `listing-studio` (zero migration churn). If/when we spin out as a standalone product, do a single big rename PR.
