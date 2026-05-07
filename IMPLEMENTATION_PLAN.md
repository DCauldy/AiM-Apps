# Prompt Studio — Standalone Signup + Prompt Packs Implementation Plan

## Summary of Decisions

| Decision | Choice |
|----------|--------|
| Standalone auth method | Email + password (Supabase Auth) |
| Signup fields | Email, password, full name |
| Bot protection | Cloudflare Turnstile on signup |
| Email verification | No (Turnstile is sufficient) |
| Auth pages | Combined /login page (sign-in + sign-up tabs) |
| Marketing route | /free redirects to /login?signup=true |
| AiM member login | "Sign in with AiM" button → Memberstack SDK auth → WP JWT token redirect |
| Free quota | 5 prompts/month (monthly reset, anniversary-based) |
| AiM member quota | Set via JWT from Memberstack (currently 15/month) |
| Nudge threshold | Soft warning at 80% usage, hard block at 100% |
| Prompt library access | Standalone: free-tagged AiM Library prompts only, no Community Prompts |
| Member-only prompts | Visible but locked (lock icon, can't open/run) |
| Saving/bookmarking | Standalone can save free prompts only |
| Account merge | Silent merge on email match when AiM token arrives (AiM token wins for identity data) |
| Prompt packs | AiM members only, in-app Stripe embedded checkout |
| Pack tiers | Multiple sizes (pricing TBD) |
| Pack credits | Never expire, carry over across months, consumed after monthly quota is exhausted |
| Upgrade CTA (standalone) | Links to AiM marketing/sales page |
| Upgrade CTA (AiM member at limit) | Shows prompt pack purchase option |

---

## Phase 1: Data Model Changes

### 1.1 — Update `profiles` table

```sql
-- Add account_type to distinguish standalone vs AiM members
-- Replaces the existing 'tier' column (currently 'trial'|'full')
ALTER TABLE profiles
  ADD COLUMN IF NOT EXISTS account_type TEXT NOT NULL DEFAULT 'standalone'
    CHECK (account_type IN ('standalone', 'aim_member'));

-- Bonus prompt credits (purchased packs, never expire)
ALTER TABLE profiles
  ADD COLUMN IF NOT EXISTS bonus_prompts INT NOT NULL DEFAULT 0;
```

**Note:** The existing `tier` column (`trial`/`full`) overlaps with this. We should migrate `tier = 'full'` → `account_type = 'aim_member'` and `tier = 'trial'` → `account_type = 'standalone'`, then drop `tier`.

### 1.2 — Add `access_tier` field to AiM Library prompts

Add a field to the prompts table (or wherever AiM Library prompts are stored) to flag which prompts are available to free users:

```sql
ALTER TABLE aim_prompts
  ADD COLUMN IF NOT EXISTS access_tier TEXT NOT NULL DEFAULT 'member'
    CHECK (access_tier IN ('free', 'member'));
```

Prompts tagged `'free'` are visible and runnable by standalone users. Prompts tagged `'member'` are visible but locked.

### 1.3 — Prompt packs purchase history (for receipts/audit)

```sql
CREATE TABLE IF NOT EXISTS public.prompt_pack_purchases (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID REFERENCES auth.users ON DELETE CASCADE NOT NULL,
  pack_size INT NOT NULL,           -- number of prompts purchased
  price_cents INT NOT NULL,         -- price paid in cents
  stripe_payment_id TEXT,           -- Stripe PaymentIntent ID
  created_at TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE prompt_pack_purchases ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users can view own purchases"
  ON prompt_pack_purchases FOR SELECT USING (auth.uid() = user_id);
```

---

## Phase 2: Auth System — Standalone Signup/Login

### 2.1 — Create `/login` page

**Route:** `app/(auth)/login/page.tsx`

Combined page with two tabs:
- **Sign In** tab: email + password fields
- **Create Account** tab: full name + email + password + Turnstile widget

UI notes:
- Below the form: "Already an AiM Member? **Sign in with AiM**" button
- Below that: link text "Member of AI Marketing Academy? Sign in with your AiM account"
- Matches existing app styling (dark sidebar theme, AiM branding)

### 2.2 — Create `/free` redirect

**Route:** `app/(auth)/free/page.tsx` (or route handler)

Simple redirect: `/free` → `/login?signup=true`

When `/login` receives `?signup=true`, it defaults to the "Create Account" tab.

### 2.3 — Signup API endpoint

**Route:** `app/api/auth/signup/route.ts`

1. Validate Turnstile token server-side
2. Create user in Supabase Auth (email + password)
3. Create profile row:
   - `account_type: 'standalone'`
   - `monthly_limit: 5`
   - `full_name: <from form>`
   - `email: <from form>`
   - `memberstack_id: NULL`
   - `bonus_prompts: 0`
4. Return session

### 2.4 — Login API endpoint

**Route:** `app/api/auth/login/route.ts`

1. Sign in via Supabase Auth (email + password)
2. Return session

### 2.5 — "Sign in with AiM" flow

On /login page, the "Sign in with AiM" button:

1. Opens Memberstack SDK login modal/form
2. On successful Memberstack auth, get member ID
3. Redirect to WordPress endpoint that generates the JWT token for this member
4. WordPress redirects back to `/aim-auth/start?token=<JWT>&redirect=/apps/prompt-studio/chat`
5. Existing aim-auth flow handles the rest (with merge logic from Phase 3)

**Requires:** WordPress endpoint that accepts a Memberstack member ID and returns/redirects with a signed JWT. This is a WordPress-side task.

### 2.6 — Update middleware.ts

Current: unauthenticated users on `/apps/*` → redirect to WordPress `/apps`

New logic:
```
/apps/* without session → redirect to /login
/ without session → redirect to /login
/login, /free, /aim-auth/* → public (no auth required)
```

---

## Phase 3: Account Merge (Silent)

### 3.1 — Update `loginWithAimPayload()` in `lib/aim-auth.ts`

When an AiM JWT arrives, before creating a new user:

1. Check `profiles` table for existing row with matching `email`
2. **If found (standalone user exists):**
   - Update their profile: `account_type → 'aim_member'`, `monthly_limit → <from JWT>`, `memberstack_id → <from JWT>`, `linked_at → now()`
   - Sign in as that existing Supabase user (preserves their UUID, all their data stays linked)
   - Do NOT create a new auth.users entry
3. **If not found:**
   - Create new user as currently done
   - Set `account_type: 'aim_member'`

**AiM token wins for:** email, full_name, memberstack_id, monthly_limit, account_type
**Preserved from standalone:** all saved prompts, usage history, threads, bookmarks (all tied to UUID)

---

## Phase 4: Prompt Library Access Control

### 4.1 — AiM Library filtering

**API changes** (`/api/apps/prompt-studio/aim-library/`):
- Include `access_tier` in prompt response
- For standalone users (`account_type = 'standalone'`): return all prompts but include `locked: true` for `access_tier = 'member'` prompts

**Frontend changes** (`components/library/AimLibraryPage.tsx`):
- Render locked prompts with a lock icon overlay
- Clicking a locked prompt shows a mini upgrade CTA ("Become an AiM Member to unlock this prompt")
- Locked prompts cannot be opened, run, or saved

### 4.2 — Community Prompts access

**Hide for standalone users:**
- Sidebar: conditionally hide "Community Prompts" nav item when `account_type = 'standalone'`
- API: return 403 if standalone user tries to access community prompt endpoints
- Optionally show a locked "Community Prompts" nav item with tooltip "Available with AiM Membership"

### 4.3 — Saving/bookmarking restriction

- Standalone users can save/bookmark prompts with `access_tier = 'free'` only
- API endpoint for saving should check the prompt's `access_tier` and the user's `account_type`
- Frontend: hide bookmark icon on locked prompts

---

## Phase 5: Usage Nudge System

### 5.1 — Soft nudge at 80% usage

**When:** `usage >= limit * 0.8 && usage < limit`

**Where:** Show a non-blocking banner/toast after a prompt run:
- Standalone: "You've used 4 of 5 prompts this month. [Become an AiM Member →]"
- AiM member: "You've used 12 of 15 prompts this month."

**Implementation:**
- After `incrementUsage()` in chat and refine-prompt routes, include `nudge: true` in the response when threshold is crossed
- Frontend: render a dismissible banner in the chat area or a toast

### 5.2 — Hard block at 100% (already exists, needs updates)

**Current behavior:** Returns 429 with `trial_limit_reached` error

**Changes needed:**
- **Standalone users at limit:** Show UpgradeModal with messaging "Upgrade to AiM Membership" → link to AiM marketing page
- **AiM members at limit with bonus_prompts > 0:** Allow the request, decrement `bonus_prompts` instead. Show toast: "Using bonus prompt credit (X remaining)"
- **AiM members at limit with bonus_prompts = 0:** Show UpgradeModal with prompt pack purchase option (Phase 6)

### 5.3 — Update usage logic in `lib/trial.ts`

```
getTrialStatus() should return:
{
  usage: number,
  limit: number,
  remaining: number,        // monthly remaining
  bonusRemaining: number,   // purchased credits remaining
  effectiveRemaining: number, // remaining + bonusRemaining
  resetDate: string,
  accountType: 'standalone' | 'aim_member'
}
```

**Enforcement order:**
1. If `monthly remaining > 0` → allow, increment normal usage
2. If `monthly remaining = 0 && bonusRemaining > 0` → allow, decrement `bonus_prompts`
3. If both are 0 → block

---

## Phase 6: Prompt Packs (Stripe Integration)

### 6.1 — Stripe setup

- Add `stripe` npm package
- Add env vars: `STRIPE_SECRET_KEY`, `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY`, `STRIPE_WEBHOOK_SECRET`
- Create Stripe products/prices for prompt pack tiers (sizes/pricing TBD)

### 6.2 — Purchase API

**Route:** `app/api/apps/prompt-studio/purchase-pack/route.ts`

1. Verify user is `account_type = 'aim_member'`
2. Create Stripe PaymentIntent for selected pack tier
3. Return client secret for embedded checkout

### 6.3 — Stripe webhook

**Route:** `app/api/webhooks/stripe/route.ts`

On `payment_intent.succeeded`:
1. Look up user from PaymentIntent metadata
2. Increment `profiles.bonus_prompts` by pack size
3. Insert row into `prompt_pack_purchases` for audit
4. Optionally send confirmation email

### 6.4 — Purchase UI

**Component:** `components/trial/PurchasePackModal.tsx`

- Shown to AiM members when they hit their monthly limit (instead of generic upgrade modal)
- Displays pack tiers with pricing
- Embedded Stripe Payment Element for checkout
- On success: close modal, update UI, user continues using the app

### 6.5 — Update UpgradeModal logic

The existing `UpgradeModal` needs to branch:

| User type | At limit? | Shows |
|-----------|-----------|-------|
| Standalone | Yes | "Become an AiM Member" → AiM marketing page |
| Standalone | No (CTA click) | Same upgrade messaging |
| AiM Member | Yes, has bonus | Auto-use bonus credit (no modal) |
| AiM Member | Yes, no bonus | PurchasePackModal (buy more prompts) |
| AiM Member | No (CTA click) | N/A (they're already a member) |

---

## Phase 7: WordPress/Memberstack Integration Tasks

These are **not in this codebase** but are required:

### 7.1 — Memberstack SDK integration
- Determine which Memberstack frontend SDK package to use
- Configure it with your Memberstack app ID
- Handle the auth flow: SDK login → get member token/ID → redirect to WP for JWT

### 7.2 — WordPress JWT endpoint for Memberstack SDK flow
- Create/update a WP endpoint that accepts a Memberstack member ID
- Verifies the member is valid via Memberstack API
- Generates and signs the JWT with the member's quotas
- Redirects back to Prompt Studio `/aim-auth/start?token=...`

### 7.3 — Verify Memberstack plan → monthlyLimit mapping
- Confirm how/where the `monthlyLimit: 15` value is set per plan in the JWT generation code
- Document the mapping for future tier changes

---

## Migration/Rollout Order

1. **Database migrations** (Phase 1) — add columns, no breaking changes
2. **Auth pages + middleware** (Phase 2.1–2.4, 2.6) — /login page, standalone signup
3. **Account merge logic** (Phase 3) — update aim-auth to handle existing users
4. **Library access control** (Phase 4) — tag prompts, add lock UI
5. **Usage nudge system** (Phase 5) — 80% warning, update limit logic for bonus credits
6. **"Sign in with AiM" button** (Phase 2.5 + 7) — requires WordPress-side work
7. **Stripe + prompt packs** (Phase 6) — separate deployment, requires Stripe account setup

Phases 1–5 can ship independently. Phase 6 (Stripe) and Phase 2.5/7 (Memberstack SDK) can follow.

---

## New Environment Variables Needed

```
# Cloudflare Turnstile
NEXT_PUBLIC_TURNSTILE_SITE_KEY=...
TURNSTILE_SECRET_KEY=...

# Stripe (Phase 6)
STRIPE_SECRET_KEY=...
NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY=...
STRIPE_WEBHOOK_SECRET=...

# Memberstack SDK (Phase 7)
NEXT_PUBLIC_MEMBERSTACK_APP_ID=...
```

---

## Open Questions

1. **Prompt pack pricing/tiers** — What sizes and prices? (e.g., 10/$5, 25/$10, 50/$15)
2. **AiM marketing page URL** — What URL should the standalone upgrade CTA link to?
3. **Which AiM Library prompts are "free"?** — Need to tag them in the database
4. **Memberstack SDK package** — Need to verify which SDK version and whether it supports the auth flow described
5. **WordPress JWT endpoint** — Does one exist for Memberstack-initiated auth, or does it need to be built?
