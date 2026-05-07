# Blog Engine — Implementation Plan

## Overview

Blog Engine is an automated BOFU (Bottom of Funnel) blog generation app for real estate professionals. It sits alongside Prompt Studio as the second app in the AiM platform, available exclusively to AiM Pro subscribers. The app automates topic discovery, blog writing, image generation, and CMS publishing — delivering SEO/AEO-optimized blog posts on a user-defined schedule.

---

## Table of Contents

1. [Architecture Overview](#1-architecture-overview)
2. [Phase 1: Foundation & Shared Infrastructure](#2-phase-1-foundation--shared-infrastructure)
3. [Phase 2: Database Schema](#3-phase-2-database-schema)
4. [Phase 3: Onboarding Chat](#4-phase-3-onboarding-chat)
5. [Phase 4: Blog Pipeline (Inngest)](#5-phase-4-blog-pipeline-inngest)
6. [Phase 5: Blog Dashboard & Management](#6-phase-5-blog-dashboard--management)
7. [Phase 6: Refinement Chat](#7-phase-6-refinement-chat)
8. [Phase 7: CMS Publishing](#8-phase-7-cms-publishing)
9. [Phase 8: Scheduling & Automation](#9-phase-8-scheduling--automation)
10. [Phase 9: Usage Tracking & Stripe](#10-phase-9-usage-tracking--stripe)
11. [Phase 10: Polish & First-Run Experience](#11-phase-10-polish--first-run-experience)
12. [API Cost Model](#12-api-cost-model)
13. [Environment Variables](#13-environment-variables)
14. [File Tree](#14-file-tree)

---

## 1. Architecture Overview

### Tech Stack Additions
- **OpenRouter** — unified API gateway for all LLM calls (replaces direct OpenAI)
- **Perplexity API** (via OpenRouter) — topic research/discovery
- **OpenAI GPT-4o** (via OpenRouter) — BOFU scoring
- **Claude Sonnet** (via OpenRouter) — blog writing
- **OpenAI gpt-image-2** (via OpenRouter) — featured image generation
- **Inngest** — background job orchestration for the blog pipeline
- **Supabase pgvector** — semantic deduplication via embeddings

### Three-Model Pipeline

```
┌─────────────┐    ┌─────────────┐    ┌─────────────┐    ┌─────────────┐
│  Perplexity  │───▸│  OpenAI     │───▸│   Claude    │───▸│  gpt-image-2│
│  (Research)  │    │  (Scoring)  │    │  (Writing)  │    │  (Image)    │
└─────────────┘    └─────────────┘    └─────────────┘    └─────────────┘
      │                   │                  │                   │
      ▼                   ▼                  ▼                   ▼
  Topic Discovery    BOFU Scoring      Blog Content        Featured Image
  230+ queries       Top 7-10 topics   HTML + Schema       Auto-styled
```

### Access Model

| Account Type | Prompt Studio | Blog Engine |
|-------------|---------------|-------------|
| Standalone  | 5 prompts/mo  | Locked (upgrade CTA → AiM) |
| AiM Member  | 25 prompts/mo | Locked (upgrade CTA → AiM Pro) |
| AiM Pro     | 25 prompts/mo | 3 blogs/week (upgradeable via Stripe) |

---

## 2. Phase 1: Foundation & Shared Infrastructure

### 1a. Migrate to OpenRouter

Replace direct OpenAI calls with OpenRouter for unified billing and model routing.

**New file: `lib/openrouter.ts`**
```typescript
import { createOpenAI } from '@ai-sdk/openai';

// OpenRouter client configured as OpenAI-compatible provider
const openrouter = createOpenAI({
  apiKey: process.env.OPENROUTER_API_KEY,
  baseURL: 'https://openrouter.ai/api/v1',
});

// Model helpers — each returns a model instance with appropriate OpenRouter headers
export function getResearchModel() {
  return openrouter('perplexity/sonar-pro', {
    headers: { 'X-Title': 'AiM Blog Engine', 'HTTP-Referer': process.env.NEXT_PUBLIC_APP_URL },
  });
}

export function getScoringModel() {
  return openrouter('openai/gpt-4o', {
    headers: { 'X-Title': 'AiM Blog Engine', 'HTTP-Referer': process.env.NEXT_PUBLIC_APP_URL },
  });
}

export function getWritingModel() {
  return openrouter('anthropic/claude-sonnet-4', {
    headers: { 'X-Title': 'AiM Blog Engine', 'HTTP-Referer': process.env.NEXT_PUBLIC_APP_URL },
  });
}

export function getImageModel() {
  return openrouter('openai/gpt-5.4-image-2', {
    headers: { 'X-Title': 'AiM Blog Engine', 'HTTP-Referer': process.env.NEXT_PUBLIC_APP_URL },
  });
}

// Prompt Studio model (migration from direct OpenAI)
export function getPromptStudioModel() {
  return openrouter(process.env.OPENAI_MODEL || 'openai/gpt-4o', {
    headers: { 'X-Title': 'AiM Prompt Studio', 'HTTP-Referer': process.env.NEXT_PUBLIC_APP_URL },
  });
}
```

**Update `lib/openai.ts`** — keep as a thin wrapper that imports from openrouter.ts for backward compatibility during migration.

### 1b. Add AiM Pro Tier to Auth System

**Update JWT payload type in `lib/aim-auth.ts`:**
```typescript
type AimJwtPayload = {
  email: string;
  name: string;
  memberstackId: string;
  planId: string;
  tier: 'member' | 'pro';  // NEW — from Memberstack plan
  apps: {
    "prompt-studio"?: { monthlyLimit: number };
    "blog-engine"?: { weeklyLimit: number };  // NEW
    [key: string]: { monthlyLimit?: number; weeklyLimit?: number } | undefined;
  };
};
```

**Update `profiles` table** — add `subscription_tier` column:
- `'standalone'` — free signup
- `'member'` — AiM Academy member
- `'pro'` — AiM Pro subscriber

**Update `loginWithAimPayload`** in `lib/aim-auth.ts` to read `tier` from JWT and set `subscription_tier` on profile.

### 1c. App Switcher Component

**New file: `components/layout/AppSwitcher.tsx`**

A dropdown/popover at the top of the sidebar that shows:
- Prompt Studio (icon + name) — always accessible
- Blog Engine (icon + name) — locked with lock icon for non-Pro, active for Pro
- Future apps — same lock pattern
- Divider
- "Return to AiM" → `https://aimarketingacademy.com/dashboard/`

**Behavior:**
- Current app is highlighted
- Locked apps show a tooltip: "Available with AiM Pro"
- Clicking a locked app opens a modal with value prop + "Learn about AiM Pro" link
- Clicking an accessible app navigates to that app's root route

### 1d. Refactor Sidebar & MainLayout

The current `Sidebar.tsx` and `MainLayout.tsx` are Prompt Studio-specific (thread list, prompt usage, etc.). We need to make them app-agnostic.

**Approach:**
1. Create a shared `AppShell` component that provides: sidebar container, header, main content area, mobile overlay
2. Each app provides its own sidebar content via a render prop or slot
3. `AppSwitcher` is always at the top of every app's sidebar
4. Profile section at the bottom is shared across all apps

**New files:**
- `components/layout/AppShell.tsx` — shared app shell (sidebar frame, header, content area)
- `components/layout/AppSwitcher.tsx` — app navigation dropdown
- `components/layout/ProfileSection.tsx` — extracted from current Sidebar.tsx bottom section

**Refactor:**
- `components/sidebar/Sidebar.tsx` → becomes `components/sidebar/PromptStudioSidebar.tsx` (Prompt Studio-specific nav + thread list)
- New `components/sidebar/BlogEngineSidebar.tsx` — Blog Engine-specific nav

### 1e. Update Feature Flags

**Update `lib/feature-flags.ts`:**
```typescript
export const FEATURES = {
  PROMPT_PACKS: process.env.NEXT_PUBLIC_ENABLE_PROMPT_PACKS === "true",
  BLOG_ENGINE: process.env.NEXT_PUBLIC_ENABLE_BLOG_ENGINE === "true",  // NEW
} as const;
```

### 1f. Install Dependencies

```bash
npm install inngest @ai-sdk/openai
# pgvector extension enabled in Supabase dashboard
```

---

## 3. Phase 2: Database Schema

### New Migration: `supabase/migrations/YYYYMMDD_blog_engine_schema.sql`

```sql
-- Enable pgvector extension
CREATE EXTENSION IF NOT EXISTS vector;

-- ============================================================
-- PROFILE UPDATES
-- ============================================================

-- Add subscription tier to profiles
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS subscription_tier TEXT
  DEFAULT 'member'
  CHECK (subscription_tier IN ('standalone', 'member', 'pro'));

-- Backfill from account_type
UPDATE profiles SET subscription_tier = CASE
  WHEN account_type = 'standalone' THEN 'standalone'
  ELSE 'member'
END WHERE subscription_tier IS NULL;

-- ============================================================
-- BOFU PROFILES (onboarding data)
-- ============================================================

CREATE TABLE bofu_profiles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,

  -- Professional identity
  professional_type TEXT NOT NULL CHECK (professional_type IN (
    'solo_agent', 'team_leader', 'team_agent', 'broker_owner', 'loan_officer', 'title_executive'
  )),
  full_name TEXT NOT NULL,
  business_name TEXT,          -- brokerage, lending company, title company
  bio TEXT,

  -- Market
  country TEXT NOT NULL DEFAULT 'United States',
  state TEXT NOT NULL,
  metro_area TEXT NOT NULL,
  counties TEXT[] DEFAULT '{}',
  neighborhoods TEXT[] DEFAULT '{}',

  -- Focus
  target_clients TEXT[] DEFAULT '{}',     -- e.g., ['buyers', 'sellers', 'investors']
  property_types TEXT[] DEFAULT '{}',     -- e.g., ['single_family', 'condo', 'luxury']
  specializations TEXT[] DEFAULT '{}',    -- e.g., ['first_time_buyers', 'relocation']

  -- SEO & Content
  website_url TEXT,
  blog_url TEXT,                           -- if different from website
  seo_keywords TEXT[] DEFAULT '{}',
  brand_colors JSONB DEFAULT '{}',        -- { primary: '#hex', secondary: '#hex' }
  logo_url TEXT,

  -- CTAs
  cta_primary TEXT,                        -- e.g., 'Schedule a consultation'
  cta_link TEXT,                           -- e.g., calendly URL, email, phone
  cta_secondary TEXT,
  cta_secondary_link TEXT,

  -- Compliance
  license_info TEXT,                       -- e.g., 'TN License #12345'
  regulatory_body TEXT,                    -- e.g., 'Tennessee Real Estate Commission'
  compliance_notes TEXT,                   -- additional guardrails

  -- Preferences
  blog_tone TEXT DEFAULT 'professional',   -- professional, conversational, authoritative
  include_disclaimers BOOLEAN DEFAULT true,

  -- Onboarding
  onboarding_completed BOOLEAN DEFAULT false,
  onboarding_chat_thread_id UUID,

  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),

  UNIQUE(user_id)
);

-- ============================================================
-- CMS CONNECTIONS
-- ============================================================

CREATE TABLE bofu_cms_connections (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,

  platform TEXT NOT NULL CHECK (platform IN ('wordpress', 'squarespace', 'webhook')),
  label TEXT,                              -- user-friendly name, e.g., "My Main Blog"

  -- WordPress
  wp_site_url TEXT,
  wp_username TEXT,
  wp_app_password_encrypted TEXT,          -- encrypted at rest
  wp_default_status TEXT DEFAULT 'draft',  -- draft or publish
  wp_default_category TEXT,
  wp_seo_plugin TEXT,                      -- 'yoast', 'rankmath', 'none'

  -- Squarespace
  sq_site_id TEXT,
  sq_api_key_encrypted TEXT,
  sq_collection_id TEXT,                   -- which blog collection

  -- Webhook (Zapier/Make)
  webhook_url TEXT,
  webhook_secret TEXT,

  -- Status
  is_active BOOLEAN DEFAULT true,
  last_publish_at TIMESTAMPTZ,
  last_error TEXT,

  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- ============================================================
-- DISCOVERY RUNS
-- ============================================================

CREATE TABLE bofu_discovery_runs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,

  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN (
    'pending', 'researching', 'scoring', 'completed', 'failed'
  )),

  queries_generated INT DEFAULT 0,
  topics_scored INT DEFAULT 0,
  topics_selected INT DEFAULT 0,

  research_summary JSONB,                  -- raw research findings
  error_message TEXT,

  started_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- ============================================================
-- TOPICS
-- ============================================================

CREATE TABLE bofu_topics (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  discovery_run_id UUID REFERENCES bofu_discovery_runs(id) ON DELETE SET NULL,

  -- Topic details
  title TEXT NOT NULL,
  description TEXT,
  search_queries TEXT[] DEFAULT '{}',      -- queries that surfaced this topic
  inquiry_type TEXT CHECK (inquiry_type IN ('property', 'process', 'professional')),

  -- Scoring
  bofu_score NUMERIC(5,2),                 -- 0-100
  scoring_breakdown JSONB,                 -- { intent: 85, relevance: 90, competition: 70, ... }
  rank INT,                                -- position in discovery run (1 = top)

  -- Deduplication
  embedding vector(1536),                  -- for semantic similarity search

  -- Status
  status TEXT NOT NULL DEFAULT 'unused' CHECK (status IN (
    'unused', 'writing', 'written', 'skipped', 'expired'
  )),
  written_at TIMESTAMPTZ,
  expires_at TIMESTAMPTZ,                  -- 90 days after written_at

  created_at TIMESTAMPTZ DEFAULT now()
);

-- Index for vector similarity search
CREATE INDEX ON bofu_topics USING ivfflat (embedding vector_cosine_ops) WITH (lists = 100);

-- Index for finding unused topics per user
CREATE INDEX ON bofu_topics (user_id, status, bofu_score DESC);

-- ============================================================
-- BLOGS
-- ============================================================

CREATE TABLE bofu_blogs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  topic_id UUID REFERENCES bofu_topics(id) ON DELETE SET NULL,

  -- Content
  title TEXT NOT NULL,
  slug TEXT,
  content_html TEXT NOT NULL,
  content_markdown TEXT,
  excerpt TEXT,
  answer_capsule TEXT,                     -- 40-60 word direct answer

  -- SEO Metadata
  meta_title TEXT,                         -- optimized title tag (< 60 chars)
  meta_description TEXT,                   -- optimized meta desc (< 160 chars)
  og_title TEXT,
  og_description TEXT,
  canonical_url TEXT,

  -- Schema Markup (JSON-LD)
  schema_article JSONB,
  schema_faq JSONB,
  schema_local_business JSONB,
  schema_breadcrumb JSONB,

  -- Image
  featured_image_url TEXT,                 -- stored image URL (Supabase Storage or external)
  featured_image_alt TEXT,
  featured_image_style TEXT CHECK (featured_image_style IN ('location', 'branded')),
  image_regenerations_used INT DEFAULT 0,
  image_regenerations_limit INT DEFAULT 3,

  -- WordPress / CMS specific
  wp_categories TEXT[] DEFAULT '{}',
  wp_tags TEXT[] DEFAULT '{}',
  seo_plugin_fields JSONB,                -- Yoast/RankMath specific fields

  -- Internal linking
  internal_links JSONB DEFAULT '[]',       -- [{url, anchor_text, context}]
  external_citations JSONB DEFAULT '[]',   -- [{url, title, context}]

  -- Publishing
  publish_status TEXT NOT NULL DEFAULT 'draft' CHECK (publish_status IN (
    'generating', 'draft', 'review', 'published', 'failed'
  )),
  cms_connection_id UUID REFERENCES bofu_cms_connections(id),
  cms_post_id TEXT,                        -- remote post ID after publishing
  cms_post_url TEXT,                       -- remote URL after publishing
  published_at TIMESTAMPTZ,

  -- Refinement chat
  refinements_used INT DEFAULT 0,
  refinements_limit INT DEFAULT 5,

  -- Pipeline tracking
  pipeline_run_id TEXT,                    -- Inngest run ID
  generation_cost_cents INT,               -- estimated API cost tracking

  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- ============================================================
-- BLOG VERSIONS (refinement history)
-- ============================================================

CREATE TABLE bofu_blog_versions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  blog_id UUID NOT NULL REFERENCES bofu_blogs(id) ON DELETE CASCADE,

  version_number INT NOT NULL,
  content_html TEXT NOT NULL,
  content_markdown TEXT,
  change_description TEXT,                 -- what the user asked for

  created_at TIMESTAMPTZ DEFAULT now()
);

-- ============================================================
-- BLOG CHAT MESSAGES (refinement chat)
-- ============================================================

CREATE TABLE bofu_blog_chats (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  blog_id UUID NOT NULL REFERENCES bofu_blogs(id) ON DELETE CASCADE,

  role TEXT NOT NULL CHECK (role IN ('user', 'assistant')),
  content TEXT NOT NULL,

  created_at TIMESTAMPTZ DEFAULT now()
);

-- ============================================================
-- SCHEDULING
-- ============================================================

CREATE TABLE bofu_schedules (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,

  frequency INT NOT NULL DEFAULT 3,        -- blogs per week
  active_days TEXT[] DEFAULT '{monday,wednesday,friday}',
  preferred_time TIME DEFAULT '08:00',     -- user's preferred generation time
  timezone TEXT DEFAULT 'America/New_York',

  is_active BOOLEAN DEFAULT true,
  last_run_at TIMESTAMPTZ,
  next_run_at TIMESTAMPTZ,

  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),

  UNIQUE(user_id)
);

-- ============================================================
-- USAGE TRACKING
-- ============================================================

CREATE TABLE bofu_usage (
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  week_start DATE NOT NULL,                -- Monday of the week
  blogs_generated INT DEFAULT 0,
  blogs_limit INT DEFAULT 3,

  PRIMARY KEY (user_id, week_start)
);

-- Increment function
CREATE OR REPLACE FUNCTION increment_bofu_usage(p_user_id UUID, p_week_start DATE)
RETURNS void AS $$
BEGIN
  INSERT INTO bofu_usage (user_id, week_start, blogs_generated, blogs_limit)
  VALUES (p_user_id, p_week_start, 1, 3)
  ON CONFLICT (user_id, week_start)
  DO UPDATE SET blogs_generated = bofu_usage.blogs_generated + 1;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ============================================================
-- BONUS BLOG PURCHASES
-- ============================================================

CREATE TABLE bofu_pack_purchases (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  pack_size INT NOT NULL,
  price_cents INT NOT NULL,
  stripe_payment_id TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Add bonus blogs column to profiles or separate table
ALTER TABLE bofu_usage ADD COLUMN bonus_blogs INT DEFAULT 0;

-- ============================================================
-- ONBOARDING CHAT
-- ============================================================

CREATE TABLE bofu_onboarding_chats (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,

  role TEXT NOT NULL CHECK (role IN ('user', 'assistant')),
  content TEXT NOT NULL,

  -- Structured data extracted from this message
  extracted_data JSONB,                    -- partial profile data from this exchange
  section TEXT,                            -- which onboarding section this belongs to

  created_at TIMESTAMPTZ DEFAULT now()
);

-- ============================================================
-- ROW LEVEL SECURITY
-- ============================================================

ALTER TABLE bofu_profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE bofu_cms_connections ENABLE ROW LEVEL SECURITY;
ALTER TABLE bofu_discovery_runs ENABLE ROW LEVEL SECURITY;
ALTER TABLE bofu_topics ENABLE ROW LEVEL SECURITY;
ALTER TABLE bofu_blogs ENABLE ROW LEVEL SECURITY;
ALTER TABLE bofu_blog_versions ENABLE ROW LEVEL SECURITY;
ALTER TABLE bofu_blog_chats ENABLE ROW LEVEL SECURITY;
ALTER TABLE bofu_schedules ENABLE ROW LEVEL SECURITY;
ALTER TABLE bofu_usage ENABLE ROW LEVEL SECURITY;
ALTER TABLE bofu_pack_purchases ENABLE ROW LEVEL SECURITY;
ALTER TABLE bofu_onboarding_chats ENABLE ROW LEVEL SECURITY;

-- Users can only access their own data
CREATE POLICY "Users access own data" ON bofu_profiles FOR ALL USING (auth.uid() = user_id);
CREATE POLICY "Users access own data" ON bofu_cms_connections FOR ALL USING (auth.uid() = user_id);
CREATE POLICY "Users access own data" ON bofu_discovery_runs FOR ALL USING (auth.uid() = user_id);
CREATE POLICY "Users access own data" ON bofu_topics FOR ALL USING (auth.uid() = user_id);
CREATE POLICY "Users access own data" ON bofu_blogs FOR ALL USING (auth.uid() = user_id);
CREATE POLICY "Users access own data" ON bofu_blog_versions FOR ALL
  USING (blog_id IN (SELECT id FROM bofu_blogs WHERE user_id = auth.uid()));
CREATE POLICY "Users access own data" ON bofu_blog_chats FOR ALL
  USING (blog_id IN (SELECT id FROM bofu_blogs WHERE user_id = auth.uid()));
CREATE POLICY "Users access own data" ON bofu_schedules FOR ALL USING (auth.uid() = user_id);
CREATE POLICY "Users access own data" ON bofu_usage FOR ALL USING (auth.uid() = user_id);
CREATE POLICY "Users access own data" ON bofu_pack_purchases FOR ALL USING (auth.uid() = user_id);
CREATE POLICY "Users access own data" ON bofu_onboarding_chats FOR ALL USING (auth.uid() = user_id);
```

---

## 4. Phase 3: Onboarding Chat

### Conversational intake with confirmation cards

**Route:** `/apps/blog-engine/onboarding`

**Components:**
- `components/blog-engine/onboarding/OnboardingChat.tsx` — main chat interface
- `components/blog-engine/onboarding/ConfirmationCard.tsx` — structured data card with edit/confirm buttons
- `components/blog-engine/onboarding/OnboardingProgress.tsx` — section progress indicator

**API Route:** `/api/apps/blog-engine/onboarding/chat/route.ts`
- Streaming endpoint using Claude (via OpenRouter) for natural conversation
- System prompt drives the 8-section interview flow
- After each section, AI returns structured JSON alongside conversational response
- Frontend renders the JSON as a `ConfirmationCard`
- On confirm, data writes to `bofu_profiles` and `bofu_onboarding_chats`

**Onboarding Sections:**

| # | Section | Fields Populated |
|---|---------|-----------------|
| 1 | Professional Type | professional_type, business_name |
| 2 | Market & Location | country, state, metro_area, counties, neighborhoods |
| 3 | Business Focus | target_clients, property_types, specializations |
| 4 | Website & Blog | website_url, blog_url (AI scans site for context) |
| 5 | Identity & SEO | full_name, bio, seo_keywords, brand_colors |
| 6 | CTAs & Compliance | cta_primary, cta_link, license_info, regulatory_body |
| 7 | CMS Connection | Creates bofu_cms_connections record (WordPress/Squarespace/webhook/skip) |
| 8 | Schedule | Creates bofu_schedules record (frequency, active_days, timezone) |

**System Prompt Structure:**

The onboarding system prompt will:
1. Greet the user and explain what Blog Engine does
2. Ask questions section by section, adapting based on professional_type
3. After each section, output a structured JSON block (fenced with `:::card` markers) that the frontend parses and renders as a confirmation card
4. Perform web research when relevant (e.g., look up their website, find local compliance rules)
5. For WordPress setup, provide detailed step-by-step instructions for generating an application password
6. Confirm all data at the end before marking onboarding as complete

**Confirmation Card Format:**
```
:::card
{
  "section": "market",
  "title": "Your Market",
  "fields": {
    "Metro Area": "Nashville, TN",
    "Counties": ["Davidson", "Williamson"],
    "Neighborhoods": ["Franklin", "Brentwood", "Green Hills"]
  }
}
:::
```

The frontend parses these markers and renders an interactive card with Edit/Confirm buttons.

---

## 5. Phase 4: Blog Pipeline (Inngest)

### Setup

**New file: `lib/inngest/client.ts`**
```typescript
import { Inngest } from 'inngest';

export const inngest = new Inngest({
  id: 'aim-apps',
  name: 'AiM Apps',
});
```

**New file: `lib/inngest/functions/blog-pipeline.ts`**

### Pipeline Steps

The blog pipeline is a single Inngest function with sequential steps:

```
Event: "blog-engine/run.requested"
  │
  ├─ Step 1: scan-existing-blog
  │   Read user's website/blog via fetch to understand existing content
  │
  ├─ Step 2: check-topic-bank
  │   Query bofu_topics for unused topics. If >= 1 unused, skip to step 5.
  │   If topic bank empty, continue to step 3.
  │
  ├─ Step 3: discover-topics (Perplexity via OpenRouter)
  │   Generate 230+ queries based on user profile
  │   Search across multiple platforms
  │   Return raw topic candidates
  │
  ├─ Step 4: score-topics (OpenAI via OpenRouter)
  │   Apply BOFU scoring framework
  │   Rank top 7-10 topics
  │   Generate embeddings for dedup
  │   Check similarity against existing topics (pgvector)
  │   Check against user's live blog (WordPress API)
  │   Save scored topics to bofu_topics
  │
  ├─ Step 5: select-topic
  │   Pick highest-scored unused topic
  │   Mark as 'writing'
  │
  ├─ Step 6: write-blog (Claude via OpenRouter)
  │   Generate full blog content with:
  │   - Answer capsule (40-60 words)
  │   - Structured HTML (H1/H2/H3 hierarchy)
  │   - FAQ section (4-6 Q&As)
  │   - Data tables where relevant
  │   - 8-12 external citations per 1,500 words
  │   - Internal links to user's existing content
  │   - CTAs from profile
  │   - Compliance disclaimers
  │
  ├─ Step 7: generate-metadata
  │   Produce all SEO/AEO metadata:
  │   - meta_title, meta_description
  │   - Open Graph tags
  │   - JSON-LD schema (Article, FAQPage, LocalBusiness, BreadcrumbList)
  │   - WordPress categories/tags suggestions
  │   - Yoast/RankMath fields
  │
  ├─ Step 8: generate-image (gpt-image-2 via OpenRouter)
  │   Auto-select style based on topic type:
  │   - Property/neighborhood → location photography style
  │   - Process/financial → branded blog header
  │   Generate image, upload to Supabase Storage
  │
  ├─ Step 9: save-blog
  │   Insert into bofu_blogs with all content + metadata
  │   Create initial version in bofu_blog_versions
  │   Update topic status to 'written', set expires_at (90 days)
  │   Increment bofu_usage
  │
  ├─ Step 10: publish-to-cms (conditional)
  │   If CMS connection exists and is active:
  │   - WordPress: POST to /wp-json/wp/v2/posts + media upload
  │   - Squarespace: POST to Content API
  │   - Webhook: POST payload to webhook URL
  │   Update blog with cms_post_id, cms_post_url
  │   If publish fails: mark blog as 'draft', store error, continue
  │
  └─ Step 11: notify-user
      Send email notification: "Your new blog is ready"
      Include: blog title, featured image, preview snippet, dashboard link
      Update in-app notification badge
```

### Inngest API Route

**New file: `app/api/inngest/route.ts`**
```typescript
import { serve } from 'inngest/next';
import { inngest } from '@/lib/inngest/client';
import { blogPipeline } from '@/lib/inngest/functions/blog-pipeline';
import { discoveryRun } from '@/lib/inngest/functions/discovery-run';
import { scheduledBlogRun } from '@/lib/inngest/functions/scheduled-run';

export const { GET, POST, PUT } = serve({
  client: inngest,
  functions: [blogPipeline, discoveryRun, scheduledBlogRun],
});
```

### System Prompts

**New file: `lib/blog-engine/prompts.ts`**

Contains system prompts for each pipeline phase, with conditional sections based on `professional_type`:

- `getResearchPrompt(profile)` — instructs Perplexity on what to search for
- `getScoringPrompt(profile)` — BOFU scoring framework with the 4-quadrant model
- `getWritingPrompt(profile)` — comprehensive blog writing instructions
- `getMetadataPrompt(profile)` — SEO/AEO metadata generation
- `getImagePrompt(profile, topic, style)` — image generation prompt

Each prompt function takes the user's `bofu_profiles` record and injects relevant context (market, professional type, compliance, CTAs, etc.).

### Conditional Prompt Sections by Professional Type

```typescript
function getProfessionalContext(type: string): string {
  switch (type) {
    case 'solo_agent':
      return `Focus on local real estate expertise, neighborhood knowledge,
              buyer/seller guidance. CTAs drive consultation bookings.`;
    case 'team_leader':
      return `Balance lead generation content with team value propositions.
              Showcase team resources and capabilities.`;
    case 'loan_officer':
      return `Focus on mortgage education, rate analysis, loan program comparisons.
              Compliance: RESPA, TILA, ECOA. CTAs drive pre-approval applications.`;
    case 'title_executive':
      return `Focus on closing process education, title insurance value,
              escrow explanations. CTAs drive partnership inquiries.`;
    // ... etc
  }
}
```

---

## 6. Phase 5: Blog Dashboard & Management

### Routes

- `/apps/blog-engine/dashboard` — main dashboard
- `/apps/blog-engine/blogs/[blogId]` — individual blog view + refinement chat
- `/apps/blog-engine/topics` — topic bank
- `/apps/blog-engine/settings` — profile settings form

### Dashboard Page

**Components:**
- `components/blog-engine/dashboard/DashboardOverview.tsx`
  - Usage meter: "2 of 3 blogs used this week" with progress bar
  - Next run countdown: "Next blog: Wednesday at 8:00 AM"
  - CMS connection status indicator
  - Quick stats: total blogs generated, published, topics in bank

- `components/blog-engine/dashboard/BlogList.tsx`
  - List of generated blogs with:
    - Featured image thumbnail
    - Title + date
    - Status badge (generating, draft, published, failed)
    - CMS indicator (WordPress icon, Squarespace icon, etc.)
  - Sort by date, status
  - Filter by status

- `components/blog-engine/dashboard/ActiveRunProgress.tsx`
  - Step-based stepper (visible during generation):
    1. Scanning your blog ✓
    2. Researching local topics ✓
    3. Scoring for BOFU intent (spinner)
    4. Checking for duplicates
    5. Writing your blog
    6. Generating featured image
    7. Preparing metadata
    8. Publishing to WordPress
  - Clean, minimal design — checkmarks for completed, spinner for active, dimmed for pending

### Individual Blog View

**Route:** `/apps/blog-engine/blogs/[blogId]`

**Layout:** Split panel
- **Left panel:** Refinement chat (see Phase 6)
- **Right panel:** Blog preview + metadata

**Right Panel Components:**
- `components/blog-engine/blog/BlogPreview.tsx`
  - Rendered HTML preview of the blog
  - Featured image with "Regenerate" button + counter (2 of 3 remaining)
  - Style toggle (location photo / branded header) for regeneration

- `components/blog-engine/blog/BlogMetadata.tsx`
  - Collapsible sections showing:
    - Meta title + description (editable inline)
    - Schema markup (JSON view, copyable)
    - Open Graph preview
    - Internal/external links list
    - Categories + tags

- `components/blog-engine/blog/BlogActions.tsx`
  - "Publish as Draft" / "Publish" button (CMS-connected)
  - "Copy HTML" button
  - "Copy Markdown" button
  - "Download" dropdown (HTML file, Markdown file)
  - "Send via Webhook" button (if webhook configured)
  - "Email to me" button

### Topic Bank View

**Route:** `/apps/blog-engine/topics`

**Components:**
- `components/blog-engine/topics/TopicList.tsx`
  - Table/card view of all topics
  - Columns: rank, title, BOFU score, inquiry type, status, discovered date
  - Filter by status (unused, written, expired)
  - "Write Blog" action on unused topics (triggers pipeline from step 5)

### Settings Page

**Route:** `/apps/blog-engine/settings`

**Components:**
- `components/blog-engine/settings/ProfileForm.tsx`
  - All bofu_profiles fields as editable form
  - Grouped by section (Market, Business, SEO, CTAs, Compliance)
  - "Reset & Re-run Setup" button at bottom (triggers onboarding chat reset)

- `components/blog-engine/settings/CmsConnections.tsx`
  - List of connected CMS platforms
  - Add new connection (WordPress, Squarespace, Webhook)
  - Test connection button
  - Remove connection

- `components/blog-engine/settings/ScheduleSettings.tsx`
  - Frequency selector (3x, 4x, 5x, 7x per week)
  - Day picker (checkboxes for each day)
  - Preferred time selector
  - Timezone selector
  - Toggle active/paused

---

## 7. Phase 6: Refinement Chat

### Per-blog AI chat for live edits

**API Route:** `/api/apps/blog-engine/blogs/[blogId]/refine/route.ts`

**Behavior:**
1. User types a change request: "Make the intro more aggressive" or "Change the CTA to a phone number"
2. AI receives: the full blog content, the user's profile, the original topic context, and the chat history
3. AI generates the updated blog content (streamed)
4. Frontend replaces the blog preview in real time
5. A new version is saved to `bofu_blog_versions`
6. `refinements_used` increments on the blog record
7. Counter updates: "4 of 5 refinements remaining"

**System Prompt for Refinement:**
```
You are a blog editor for a real estate professional. You have the full context of their
profile, market, and the original blog post. When the user requests changes:
1. Apply the requested change while maintaining SEO structure, schema integrity, and voice
2. Preserve the answer capsule, FAQ schema, and metadata unless explicitly asked to change them
3. Return the COMPLETE updated blog in HTML format
4. Briefly explain what you changed in a conversational response
```

**When limit reached (5/5):**
- Chat input is disabled
- Message: "You've used all 5 refinements. You can copy the blog to your own tools for further editing."

---

## 8. Phase 7: CMS Publishing

### WordPress Connector

**New file: `lib/blog-engine/cms/wordpress.ts`**

```typescript
export async function publishToWordPress(blog: BofuBlog, connection: BofuCmsConnection) {
  const auth = Buffer.from(`${connection.wp_username}:${decrypt(connection.wp_app_password_encrypted)}`).toString('base64');

  // 1. Upload featured image to WordPress media library
  const mediaId = await uploadMedia(blog.featured_image_url, connection, auth);

  // 2. Create post
  const post = await fetch(`${connection.wp_site_url}/wp-json/wp/v2/posts`, {
    method: 'POST',
    headers: {
      'Authorization': `Basic ${auth}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      title: blog.title,
      content: injectSchemaMarkup(blog.content_html, blog),
      excerpt: blog.excerpt,
      status: connection.wp_default_status || 'draft',
      featured_media: mediaId,
      categories: await resolveCategories(blog.wp_categories, connection, auth),
      tags: await resolveTags(blog.wp_tags, connection, auth),
      meta: buildSeoMeta(blog, connection.wp_seo_plugin),
    }),
  });

  return { postId: post.id, postUrl: post.link };
}
```

**Schema injection:** JSON-LD schema blocks are injected into the HTML content as `<script type="application/ld+json">` tags. WordPress renders these in the post body.

**SEO plugin support:**
- Yoast: Write to `_yoast_wpseo_title`, `_yoast_wpseo_metadesc` via meta fields
- RankMath: Write to `rank_math_title`, `rank_math_description` via meta fields

### Squarespace Connector

**New file: `lib/blog-engine/cms/squarespace.ts`**

Uses the Squarespace Content API to create blog posts in a specified collection.

### Webhook Connector

**New file: `lib/blog-engine/cms/webhook.ts`**

Sends a POST request with the full blog payload (HTML, metadata, schema, image URL) to the configured webhook URL. Includes HMAC signature for verification.

### Credential Encryption

**New file: `lib/blog-engine/encryption.ts`**

Uses Node.js `crypto` module with a server-side encryption key (`BLOG_ENGINE_ENCRYPTION_KEY` env var) to encrypt/decrypt CMS credentials before storage.

```typescript
import crypto from 'crypto';

const ALGORITHM = 'aes-256-gcm';
const KEY = Buffer.from(process.env.BLOG_ENGINE_ENCRYPTION_KEY!, 'hex');

export function encrypt(text: string): string { /* ... */ }
export function decrypt(encrypted: string): string { /* ... */ }
```

---

## 9. Phase 8: Scheduling & Automation

### Vercel Cron + Inngest

**New file: `app/api/cron/blog-engine/route.ts`**

A Vercel cron job that runs every hour (or every 30 minutes) and checks `bofu_schedules` for users whose next run is due:

```typescript
export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  // Verify cron secret
  if (req.headers.get('Authorization') !== `Bearer ${process.env.CRON_SECRET}`) {
    return new Response('Unauthorized', { status: 401 });
  }

  const supabase = createServiceClient();

  // Find schedules where next_run_at <= now and is_active = true
  const { data: dueSchedules } = await supabase
    .from('bofu_schedules')
    .select('*')
    .eq('is_active', true)
    .lte('next_run_at', new Date().toISOString());

  for (const schedule of dueSchedules) {
    // Check usage limits
    const usage = await getBofuUsage(schedule.user_id);
    if (usage.blogsRemaining <= 0) continue;

    // Trigger Inngest pipeline
    await inngest.send({
      name: 'blog-engine/run.requested',
      data: { userId: schedule.user_id, triggeredBy: 'schedule' },
    });

    // Update next_run_at
    await updateNextRunTime(schedule);
  }

  return Response.json({ triggered: dueSchedules.length });
}
```

**`vercel.json` cron config:**
```json
{
  "crons": [
    {
      "path": "/api/cron/blog-engine",
      "schedule": "0 * * * *"
    }
  ]
}
```

### Next Run Calculation

```typescript
function calculateNextRun(schedule: BofuSchedule): Date {
  const now = new Date();
  const activeDays = schedule.active_days; // ['monday', 'wednesday', 'friday']
  const [hours, minutes] = schedule.preferred_time.split(':').map(Number);

  // Find the next active day at the preferred time in the user's timezone
  // ... timezone-aware calculation
}
```

---

## 10. Phase 9: Usage Tracking & Stripe

### Usage Tracking

**New file: `lib/blog-engine/usage.ts`**

```typescript
export async function getBofuUsage(userId: string): Promise<BofuUsageStatus> {
  const weekStart = getWeekStart(); // Monday of current week

  // Query bofu_usage for this week
  // Query bofu_schedules for the user's limit
  // Calculate remaining = limit - generated + bonus

  return {
    blogsGenerated: number,
    blogsLimit: number,       // from schedule frequency
    blogsRemaining: number,
    bonusBlogs: number,
    effectiveRemaining: number,
    weekStart: string,
    weekEnd: string,
    nudge: boolean,           // true at 80%+ usage
  };
}

export async function incrementBofuUsage(userId: string): Promise<void> {
  // Uses weekly billing period (Monday to Sunday)
  // Atomic increment via RPC
}
```

### Stripe Usage Upgrades

**Reuse existing Stripe patterns from prompt packs.**

**New API routes:**
- `POST /api/apps/blog-engine/purchase-upgrade` — purchase additional blog runs (one-time pack)
- `POST /api/apps/blog-engine/upgrade-tier` — upgrade weekly frequency (subscription change)

**Webhook handler update:** Extend existing `/api/webhooks/stripe/route.ts` to handle Blog Engine purchase events.

**Components:**
- `components/blog-engine/trial/UsageMeter.tsx` — weekly usage display
- `components/blog-engine/trial/UpgradeModal.tsx` — upgrade options when limit reached
- `components/blog-engine/trial/PurchaseBlogPackModal.tsx` — buy extra blog runs

---

## 11. Phase 10: Polish & First-Run Experience

### Welcome Screen

**Route:** `/apps/blog-engine` (when `onboarding_completed = false`)

**Component:** `components/blog-engine/WelcomeScreen.tsx`

Apple-style landing page with:
- Gradient hero section (teal → blue, matching brand guide)
- Headline: "Your blog, on autopilot."
- Subheadline: "Blog Engine researches your market, writes SEO-optimized content, and publishes it — automatically."
- Floating browser mockup showing a sample blog with all the bells and whistles
- Key stat callouts: "23x higher conversion from AI search citations"
- Single CTA button: "Set Up Your Blog Engine" → navigates to onboarding chat
- Subtle circuitry graphics in the background (brand element)

### Post-Onboarding First Run

After onboarding completes:
1. Navigate to dashboard
2. Immediately trigger first pipeline run via Inngest
3. Show `ActiveRunProgress` stepper with real-time step updates
4. When complete, the blog appears in the list with celebration state
5. Show prompt: "Your first blog is ready! Review it now."

### Email Notifications

**New file: `lib/blog-engine/notifications.ts`**

Uses a transactional email service (Resend, SendGrid, or Supabase Edge Functions) to send:

- **Blog ready email:**
  - Subject: "Your new blog is ready: [Blog Title]"
  - Preview of featured image + first paragraph
  - "Review & Publish" CTA button → dashboard link
  - Usage indicator: "2 of 3 blogs this week"

- **Run failed email:**
  - Subject: "Blog Engine: generation issue"
  - Brief error description
  - "Check Dashboard" CTA

### In-App Notifications

Store notification state in a simple `bofu_notifications` table or use Supabase Realtime to push updates to the dashboard when a blog run completes.

---

## 12. API Cost Model

### Per Blog Run (full pipeline)

| Phase | Model | Est. Cost |
|-------|-------|-----------|
| Research | Perplexity sonar-pro | $0.30-0.60 |
| Scoring | GPT-4o | $0.06-0.10 |
| Writing | Claude Sonnet | $0.05-0.10 |
| Metadata | GPT-4o | $0.02-0.04 |
| Image | gpt-image-2 (medium) | $0.05 |
| Embedding | text-embedding-3-small | $0.001 |
| **Total** | | **$0.48-0.89** |

### Repeat Run (from cached topic bank)

Skip research + scoring = **$0.12-0.29**

### Weekly Cost per User (3 blogs, 1 discovery)

- 1 full run + 2 cached runs: $0.48 + $0.24 + $0.24 = **~$0.96/week**
- Monthly: **~$4.00/user/month**

### Maximum Cost (7 blogs/week, power user)

- 1 full run + 6 cached runs: $0.89 + (6 × $0.29) = **~$2.63/week**
- Monthly: **~$10.50/user/month**

### Refinement Chat Cost (per interaction)

- ~$0.05-0.10 per refinement (Claude reading full blog + generating update)
- Max 5 refinements = $0.25-0.50 per blog worst case

### Image Regeneration Cost

- ~$0.05 per regeneration × 3 max = $0.15 worst case

---

## 13. Environment Variables

**New variables to add:**

```bash
# OpenRouter (replaces direct OpenAI for model routing)
OPENROUTER_API_KEY=sk-or-...

# Inngest
INNGEST_EVENT_KEY=...
INNGEST_SIGNING_KEY=...

# Blog Engine
NEXT_PUBLIC_ENABLE_BLOG_ENGINE=true
BLOG_ENGINE_ENCRYPTION_KEY=...          # 32-byte hex key for CMS credential encryption

# Vercel Cron
CRON_SECRET=...                          # protects cron endpoints

# Email notifications (choose one)
RESEND_API_KEY=...
# or SENDGRID_API_KEY=...
```

---

## 14. File Tree

```
app/
├── apps/
│   ├── layout.tsx                              # Shared auth check (existing)
│   ├── page.tsx                                # Update: redirect to last-used app
│   ├── prompt-studio/                          # Existing (unchanged)
│   └── blog-engine/                            # NEW
│       ├── layout.tsx                          # Server layout (auth + Pro tier check)
│       ├── layout-client.tsx                   # Client context provider
│       ├── page.tsx                            # Welcome screen or redirect to dashboard
│       ├── onboarding/
│       │   └── page.tsx                        # Onboarding chat
│       ├── dashboard/
│       │   └── page.tsx                        # Main dashboard
│       ├── blogs/
│       │   └── [blogId]/
│       │       └── page.tsx                    # Blog view + refinement chat
│       ├── topics/
│       │   └── page.tsx                        # Topic bank
│       └── settings/
│           └── page.tsx                        # Profile + CMS + Schedule settings
│
├── api/
│   ├── apps/
│   │   ├── prompt-studio/                      # Existing (unchanged)
│   │   └── blog-engine/                        # NEW
│   │       ├── onboarding/
│   │       │   └── chat/route.ts               # Onboarding chat streaming
│   │       ├── profile/route.ts                # CRUD bofu_profiles
│   │       ├── cms-connections/
│   │       │   ├── route.ts                    # CRUD connections
│   │       │   └── test/route.ts               # Test CMS connection
│   │       ├── blogs/
│   │       │   ├── route.ts                    # List blogs
│   │       │   └── [blogId]/
│   │       │       ├── route.ts                # Get/update blog
│   │       │       ├── refine/route.ts         # Refinement chat streaming
│   │       │       ├── publish/route.ts        # Trigger CMS publish
│   │       │       └── regenerate-image/route.ts # Image regeneration
│   │       ├── topics/route.ts                 # List/manage topics
│   │       ├── runs/
│   │       │   ├── route.ts                    # Trigger manual run
│   │       │   └── [runId]/route.ts            # Get run status
│   │       ├── schedule/route.ts               # CRUD schedule
│   │       ├── usage/route.ts                  # Get usage status
│   │       ├── purchase-pack/route.ts          # Stripe blog pack
│   │       └── upgrade-tier/route.ts           # Stripe frequency upgrade
│   │
│   ├── inngest/route.ts                        # NEW — Inngest serve endpoint
│   ├── cron/
│   │   └── blog-engine/route.ts                # NEW — Scheduled run trigger
│   └── webhooks/
│       └── stripe/route.ts                     # Update: handle blog pack events
│
components/
├── layout/
│   ├── AppShell.tsx                            # NEW — shared app shell
│   ├── AppSwitcher.tsx                         # NEW — app navigation
│   ├── ProfileSection.tsx                      # NEW — extracted from Sidebar
│   ├── Header.tsx                              # Update: app-agnostic
│   └── MainLayout.tsx                          # Update: app-agnostic
│
├── sidebar/
│   ├── Sidebar.tsx                             # Rename → PromptStudioSidebar.tsx
│   ├── BlogEngineSidebar.tsx                   # NEW
│   └── ThreadList.tsx                          # Existing (Prompt Studio specific)
│
├── blog-engine/                                # NEW — all Blog Engine components
│   ├── onboarding/
│   │   ├── OnboardingChat.tsx
│   │   ├── ConfirmationCard.tsx
│   │   └── OnboardingProgress.tsx
│   ├── dashboard/
│   │   ├── DashboardOverview.tsx
│   │   ├── BlogList.tsx
│   │   ├── BlogCard.tsx
│   │   └── ActiveRunProgress.tsx
│   ├── blog/
│   │   ├── BlogPreview.tsx
│   │   ├── BlogMetadata.tsx
│   │   ├── BlogActions.tsx
│   │   ├── RefinementChat.tsx
│   │   └── ImageRegenerator.tsx
│   ├── topics/
│   │   └── TopicList.tsx
│   ├── settings/
│   │   ├── ProfileForm.tsx
│   │   ├── CmsConnections.tsx
│   │   └── ScheduleSettings.tsx
│   ├── trial/
│   │   ├── UsageMeter.tsx
│   │   ├── UpgradeModal.tsx
│   │   └── PurchaseBlogPackModal.tsx
│   └── WelcomeScreen.tsx
│
lib/
├── openrouter.ts                               # NEW — OpenRouter client + model helpers
├── openai.ts                                   # Update: thin wrapper for backward compat
├── feature-flags.ts                            # Update: add BLOG_ENGINE flag
├── aim-auth.ts                                 # Update: read Pro tier from JWT
├── inngest/                                    # NEW
│   ├── client.ts
│   └── functions/
│       ├── blog-pipeline.ts                    # Full pipeline function
│       ├── discovery-run.ts                    # Standalone discovery
│       └── scheduled-run.ts                    # Cron-triggered run
├── blog-engine/                                # NEW
│   ├── prompts.ts                              # System prompts for all phases
│   ├── usage.ts                                # Weekly usage tracking
│   ├── encryption.ts                           # CMS credential encryption
│   ├── notifications.ts                        # Email notifications
│   ├── embeddings.ts                           # Generate + compare embeddings
│   └── cms/
│       ├── wordpress.ts                        # WordPress REST API client
│       ├── squarespace.ts                      # Squarespace API client
│       └── webhook.ts                          # Webhook publisher
│
types/
├── index.ts                                    # Update: add Blog Engine types
└── blog-engine.ts                              # NEW — Blog Engine specific types

supabase/
└── migrations/
    └── YYYYMMDD_blog_engine_schema.sql         # NEW — full schema
```

---

## Implementation Order

| Phase | Description | Dependencies |
|-------|-------------|-------------|
| 1 | Foundation: OpenRouter, Pro tier, App Switcher, Sidebar refactor | None |
| 2 | Database schema migration | Phase 1 (Pro tier) |
| 3 | Onboarding chat | Phase 2 (schema) |
| 4 | Blog pipeline (Inngest) | Phase 2, OpenRouter |
| 5 | Dashboard & blog management UI | Phase 4 (needs blogs to display) |
| 6 | Refinement chat | Phase 5 (needs blog view) |
| 7 | CMS publishing (WordPress, Squarespace, Webhook) | Phase 4 (pipeline integration) |
| 8 | Scheduling & cron automation | Phase 4, 7 |
| 9 | Usage tracking & Stripe | Phase 4, 8 |
| 10 | Welcome screen, first-run, notifications, polish | Phase 3, 5 |

---

## Key Decisions Summary

| Decision | Choice | Rationale |
|----------|--------|-----------|
| AI Gateway | OpenRouter | Unified billing, per-app tracking, model flexibility |
| Research | Perplexity sonar-pro | Purpose-built for sourced research |
| Scoring | OpenAI GPT-4o | Fast, good at structured analysis |
| Writing | Claude Sonnet | Best long-form quality, reduces AI detection |
| Images | gpt-image-2 | Already in OpenAI ecosystem, cheap ($0.05/image) |
| Background Jobs | Inngest on Vercel | Single codebase, step functions, retries |
| Dedup | pgvector in Supabase | Native, no external service needed |
| CMS Auth | Application passwords | Built into WordPress, no plugin required |
| Credential Storage | AES-256-GCM encryption | Server-side key, encrypted at rest |
| Usage Period | Weekly (Mon-Sun) | Matches blog frequency model |
| Onboarding | Conversational chat + confirmation cards | Warm UX, structured data capture |
| Editing | 5 refinement chats per blog | Cost control, users can use own LLM beyond |
| Image Regen | 3 per blog | Cost negligible, prevents abuse |
| Cooldown | 90 days | Quarterly topic refresh, matches market seasonality |
