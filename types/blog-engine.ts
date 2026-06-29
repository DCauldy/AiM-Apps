// ---------------------------------------------------------------------------
// Professional Types
// ---------------------------------------------------------------------------

export type ProfessionalType =
  | "solo_agent"
  | "team_leader"
  | "team_agent"
  | "broker_owner"
  | "loan_officer"
  | "title_executive";

export const PROFESSIONAL_TYPE_LABELS: Record<ProfessionalType, string> = {
  solo_agent: "Solo Agent",
  team_leader: "Team Leader",
  team_agent: "Team Agent",
  broker_owner: "Broker / Owner",
  loan_officer: "Loan Officer",
  title_executive: "Title Executive",
};

// ---------------------------------------------------------------------------
// BOFU Profile (onboarding data)
// ---------------------------------------------------------------------------

export interface BofuProfile {
  id: string;
  user_id: string;

  // Professional identity
  professional_type: ProfessionalType;
  full_name: string;
  business_name?: string;
  bio?: string;

  // Market
  country: string;
  state: string;
  metro_area: string;
  counties: string[];
  neighborhoods: string[];

  // Focus
  target_clients: string[];
  property_types: string[];
  specializations: string[];

  // SEO & Content
  website_url?: string;
  blog_url?: string;
  seo_keywords: string[];
  brand_colors: { primary?: string; secondary?: string };
  logo_url?: string;

  // CTAs
  cta_primary?: string;
  cta_link?: string;
  cta_secondary?: string;
  cta_secondary_link?: string;

  // Compliance
  license_info?: string;
  regulatory_body?: string;
  compliance_notes?: string;

  // Preferences
  blog_tone: "professional" | "conversational" | "authoritative";
  include_disclaimers: boolean;

  // Onboarding
  onboarding_completed: boolean;
  onboarding_chat_thread_id?: string;

  created_at: string;
  updated_at: string;
}

// ---------------------------------------------------------------------------
// CMS Connections
// ---------------------------------------------------------------------------

export type CmsPlatform = "wordpress" | "webhook";

export interface BofuCmsConnection {
  id: string;
  user_id: string;
  platform: CmsPlatform;
  label?: string;

  // WordPress
  wp_site_url?: string;
  wp_username?: string;
  wp_app_password_encrypted?: string;
  wp_default_status: "draft" | "publish";
  wp_default_category?: string;
  wp_seo_plugin: "yoast" | "rankmath" | "none";

  // Webhook
  webhook_url?: string;
  webhook_secret?: string;

  // Status
  is_active: boolean;
  last_publish_at?: string;
  last_error?: string;

  created_at: string;
  updated_at: string;
}

// ---------------------------------------------------------------------------
// Discovery Runs
// ---------------------------------------------------------------------------

export type DiscoveryRunStatus =
  | "pending"
  | "researching"
  | "scoring"
  | "completed"
  | "failed";

export interface BofuDiscoveryRun {
  id: string;
  user_id: string;
  status: DiscoveryRunStatus;
  queries_generated: number;
  topics_scored: number;
  topics_selected: number;
  research_summary?: Record<string, unknown>;
  error_message?: string;
  started_at?: string;
  completed_at?: string;
  created_at: string;
}

// ---------------------------------------------------------------------------
// Topics
// ---------------------------------------------------------------------------

export type TopicStatus = "unused" | "writing" | "written" | "skipped" | "expired";
export type InquiryType = "property" | "process" | "professional";

export interface BofuTopic {
  id: string;
  user_id: string;
  discovery_run_id?: string;
  title: string;
  description?: string;
  search_queries: string[];
  inquiry_type?: InquiryType;
  bofu_score?: number;
  scoring_breakdown?: {
    intent: number;
    relevance: number;
    competition: number;
    freshness: number;
    local_fit: number;
  };
  rank?: number;
  user_priority?: number;
  embedding?: number[];
  status: TopicStatus;
  written_at?: string;
  expires_at?: string;
  created_at: string;
}

// ---------------------------------------------------------------------------
// Blogs
// ---------------------------------------------------------------------------

export type BlogPublishStatus =
  | "generating"
  | "draft"
  | "review"
  | "published"
  | "failed";

export type ImageStyle = "location" | "branded";

export interface BofuBlog {
  id: string;
  user_id: string;
  topic_id?: string;

  // Content
  title: string;
  slug?: string;
  content_html: string;
  content_markdown?: string;
  excerpt?: string;
  answer_capsule?: string;

  // SEO Metadata
  meta_title?: string;
  meta_description?: string;
  og_title?: string;
  og_description?: string;
  canonical_url?: string;

  // Schema Markup
  schema_article?: Record<string, unknown>;
  schema_faq?: Record<string, unknown>;
  schema_local_business?: Record<string, unknown>;
  schema_breadcrumb?: Record<string, unknown>;

  // Image
  featured_image_url?: string;
  featured_image_alt?: string;
  featured_image_style?: ImageStyle;
  image_regenerations_used: number;
  image_regenerations_limit: number;

  // WordPress / CMS
  wp_categories: string[];
  wp_tags: string[];
  seo_plugin_fields?: Record<string, unknown>;

  // Internal linking
  internal_links: Array<{ url: string; anchor_text: string; context: string }>;
  external_citations: Array<{ url: string; title: string; context: string }>;

  // Publishing
  publish_status: BlogPublishStatus;
  cms_connection_id?: string;
  cms_post_id?: string;
  cms_post_url?: string;
  published_at?: string;
  synced_at?: string;

  // Refinement
  refinements_used: number;
  refinements_limit: number;

  // Pipeline
  pipeline_run_id?: string;
  generation_cost_cents?: number;
  /** Last failure surfaced to the UI as "{step}: {message}". NULL when
   *  the pipeline + publish are healthy. Cleared on successful retry. */
  pipeline_error?: string | null;

  created_at: string;
  updated_at: string;
}

// ---------------------------------------------------------------------------
// Blog Versions
// ---------------------------------------------------------------------------

export interface BofuBlogVersion {
  id: string;
  blog_id: string;
  version_number: number;
  content_html: string;
  content_markdown?: string;
  change_description?: string;
  created_at: string;
}

// ---------------------------------------------------------------------------
// Blog Chat (refinement)
// ---------------------------------------------------------------------------

export interface BofuBlogChat {
  id: string;
  blog_id: string;
  role: "user" | "assistant";
  content: string;
  created_at: string;
}

// ---------------------------------------------------------------------------
// Schedules
// ---------------------------------------------------------------------------

export type DayOfWeek =
  | "monday"
  | "tuesday"
  | "wednesday"
  | "thursday"
  | "friday"
  | "saturday"
  | "sunday";

export interface BofuSchedule {
  id: string;
  user_id: string;
  frequency: number;
  frequency_tier: string;
  stripe_subscription_id?: string;
  stripe_customer_id?: string;
  active_days: DayOfWeek[];
  preferred_time: string;
  timezone: string;
  is_active: boolean;
  last_run_at?: string;
  next_run_at?: string;
  created_at: string;
  updated_at: string;
}

// ---------------------------------------------------------------------------
// Usage
// ---------------------------------------------------------------------------

export interface BofuUsage {
  user_id: string;
  week_start: string;
  blogs_generated: number;
  blogs_limit: number;
  bonus_blogs: number;
}

export interface BofuUsageStatus {
  blogsGenerated: number;
  blogsLimit: number;
  blogsRemaining: number;
  bonusBlogs: number;
  effectiveRemaining: number;
  weekStart: string;
  weekEnd: string;
  nudge: boolean;
}

// ---------------------------------------------------------------------------
// Onboarding
// ---------------------------------------------------------------------------

export type OnboardingSection =
  | "professional_type"
  | "market"
  | "business_focus"
  | "website"
  | "identity"
  | "cta_compliance"
  | "cms_connection"
  | "schedule";

export interface OnboardingChatMessage {
  id: string;
  user_id: string;
  role: "user" | "assistant";
  content: string;
  extracted_data?: Partial<BofuProfile>;
  section?: OnboardingSection;
  created_at: string;
}

// ---------------------------------------------------------------------------
// Pipeline Progress (for real-time UI updates)
// ---------------------------------------------------------------------------

export type PipelineStep =
  | "scan_blog"
  | "check_topics"
  | "discover_topics"
  | "score_topics"
  | "select_topic"
  | "write_blog"
  | "generate_metadata"
  | "generate_image"
  | "save_blog"
  | "publish_cms"
  | "notify_user";

export type PipelineStepStatus = "pending" | "active" | "completed" | "failed" | "skipped";

export interface PipelineProgress {
  runId: string;
  steps: Array<{
    step: PipelineStep;
    label: string;
    status: PipelineStepStatus;
  }>;
  currentStep: PipelineStep;
  blogId?: string;
  error?: string;
}

// ---------------------------------------------------------------------------
// CMS Publish / Sync Result
// ---------------------------------------------------------------------------

export interface PublishResult {
  success: boolean;
  postId?: string;
  postUrl?: string;
  error?: string;
}

export const PIPELINE_STEP_LABELS: Record<PipelineStep, string> = {
  scan_blog: "Scanning your blog",
  check_topics: "Checking topic bank",
  discover_topics: "Researching local topics",
  score_topics: "Scoring for BOFU intent",
  select_topic: "Selecting best topic",
  write_blog: "Writing your blog",
  generate_metadata: "Preparing metadata & schema",
  generate_image: "Generating featured image",
  save_blog: "Saving your blog",
  publish_cms: "Publishing to your site",
  notify_user: "Sending notification",
};
