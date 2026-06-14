// ---------------------------------------------------------------------------
// Hyperlocal dashboard — data layer
//
// Replaces the "config-state readout" dashboard with narrative modules.
// Returns a single shape consumed by HyperlocalDashboardClient. JS-side
// aggregation keeps the database side dumb — fetches are user-scoped and the
// per-user event volumes are small (one agent's sphere, last 30 days).
//
// Team-mode hook: every query is keyed off a `profileIds` array, not a single
// profile, so a future "team lens" can pass multiple platform_profile ids
// without rewriting aggregations. Solo callers pass `[active_profile_id]`.
// Scoping by profile (not user) prevents data bleed when a user switches
// between profiles they own.
// ---------------------------------------------------------------------------

import type { SupabaseClient } from "@supabase/supabase-js";
import type { RunPhase } from "@/types/hyperlocal";

// ---------------------------------------------------------------------------
// Public shape
// ---------------------------------------------------------------------------

export type HeroVariant = "review" | "in_flight" | "recap" | "empty";

export interface HeroRun {
  variant: HeroVariant;
  run_id: string;
  campaign_name: string | null;
  phase: RunPhase;
  geo_headline: string | null;        // "Brentwood" or "Brentwood + 2 more"
  segments_count: number;
  recipients_count: number;
  emails_sent: number;
  subject_preview: string | null;     // first email subject
  preheader_preview: string | null;
  lens: string | null;                // seller / buyer / balanced
  email_address: string | null;       // sending account
  started_at: string | null;
  completed_at: string | null;
  // Recap-only stats:
  opens?: number;
  clicks?: number;
  bounces?: number;
  unsubscribes?: number;
}

export interface ThisWeekSummary {
  sends: number;          // unique recipients sent to
  opens: number;          // unique opened
  clicks: number;         // unique clicked
  replies: number;        // 0 today (Resend doesn't notify) — kept for shape stability
  open_rate: number;      // 0..1
  click_rate: number;     // 0..1
  vs_prior_week_open_rate_delta: number; // -1..1, prior week comparison
  spark_daily_sends: number[]; // 7 entries, oldest → newest
}

export interface CampaignStory {
  run_id: string;
  campaign_name: string;
  geo_headline: string | null;
  sent_label: string;     // "sent yesterday" / "sent Mar 12"
  recipients_count: number;
  opens: number;
  clicks: number;
  unsubscribes: number;
  open_rate: number;
  click_rate: number;
  completed_at: string;
}

export interface HotContact {
  email: string;
  name: string | null;
  open_count: number;
  click_count: number;
  sends_received: number;
  last_event_at: string;
  last_event_type: "opened" | "clicked";
  signature: string;      // "opened 4 of last 5" / "clicked Brentwood report"
}

export interface NeighborhoodRow {
  label: string;
  recipients: number;
  open_rate: number;
  clicks: number;
}

export type HealthSeverity = "good" | "warn" | "bad";

export interface HealthRail {
  severity: HealthSeverity;
  bounce_rate: number;            // 0..1, last 30d
  domain_verified: boolean;
  paused_connections: number;
  suppressions_this_week: number;
  crm_label: string | null;       // "Follow Up Boss" or null
  email_label: string | null;     // "resend.you@brand.com" or null
}

export interface DashboardData {
  hero: HeroRun | null;
  this_week: ThisWeekSummary;
  recent_campaigns: CampaignStory[];
  hot_contacts: HotContact[];
  neighborhoods: NeighborhoodRow[];
  health: HealthRail;
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

// Hero priority — first phase found wins.
const ACTIVE_PHASE_PRIORITY: RunPhase[] = [
  "review",
  "awaiting_service_area",
  "awaiting_mls",
  "sending",
  "generate",
  "discover",
];

const DAY_MS = 24 * 60 * 60 * 1000;

// ---------------------------------------------------------------------------
// Entry point
// ---------------------------------------------------------------------------

export async function getDashboardData(
  supabase: SupabaseClient,
  profileIds: string[],
): Promise<DashboardData> {
  if (profileIds.length === 0) return emptyDashboard();

  const now = new Date();
  const thirtyDaysAgo = new Date(now.getTime() - 30 * DAY_MS);
  const sevenDaysAgo = new Date(now.getTime() - 7 * DAY_MS);
  const fourteenDaysAgo = new Date(now.getTime() - 14 * DAY_MS);

  // Stage 1 — fan out every query that doesn't depend on another query's
  // result. `emailConnections` is one of these even though it's also used to
  // scope `hl_email_events`; we just gate that one follow-up on its ids.
  const [
    { data: emailConnections },
    { data: activeRuns },
    { data: lastCompletedRuns },
    { data: recentCompletedRuns },
    { data: campaigns },
    { data: crmConnections },
    { count: suppressionsThisWeek },
  ] = await Promise.all([
    supabase
      .from("hl_email_connections")
      .select("id, email_address, display_name, is_default, is_active, resend_dkim_status, paused")
      .in("profile_id", profileIds),
    supabase
      .from("hl_runs")
      .select("id, campaign_id, phase, started_at, completed_at, created_at, contacts_fetched, segments_count, emails_drafted, emails_sent, emails_failed, email_connection_id")
      .in("profile_id", profileIds)
      .in("phase", ACTIVE_PHASE_PRIORITY as string[])
      .order("created_at", { ascending: false })
      .limit(10),
    supabase
      .from("hl_runs")
      .select("id, campaign_id, phase, started_at, completed_at, created_at, contacts_fetched, segments_count, emails_drafted, emails_sent, emails_failed, email_connection_id")
      .in("profile_id", profileIds)
      .eq("phase", "completed")
      .order("completed_at", { ascending: false, nullsFirst: false })
      .limit(1),
    supabase
      .from("hl_runs")
      .select("id, campaign_id, phase, completed_at, created_at, emails_sent")
      .in("profile_id", profileIds)
      .eq("phase", "completed")
      .order("completed_at", { ascending: false, nullsFirst: false })
      .limit(6),
    supabase
      .from("hl_campaigns")
      .select("id, name, lens")
      .in("profile_id", profileIds),
    supabase
      .from("hl_crm_connections")
      .select("id, platform, label, is_active")
      .in("profile_id", profileIds)
      .eq("is_active", true)
      .limit(1),
    supabase
      .from("hl_suppressions")
      .select("*", { count: "exact", head: true })
      .in("profile_id", profileIds)
      .gte("added_at", sevenDaysAgo.toISOString()),
  ]);

  // Stage 2 — events query (gated on email connection ids).
  const emailConnectionIds = (emailConnections ?? []).map((c) => c.id);
  const eventsRes =
    emailConnectionIds.length > 0
      ? await supabase
          .from("hl_email_events")
          .select("type, recipient_id, occurred_at, email_connection_id")
          .in("email_connection_id", emailConnectionIds)
          .gte("occurred_at", thirtyDaysAgo.toISOString())
      : { data: [] as EventRow[] };

  const events: EventRow[] = (eventsRes.data ?? []) as EventRow[];

  // Resolve the hero — first active by priority, else the latest completed
  // run as a recap, else empty state.
  const activeRun = pickByPhasePriority(activeRuns ?? [], ACTIVE_PHASE_PRIORITY);
  const heroRunRow = activeRun ?? lastCompletedRuns?.[0] ?? null;

  // Stage 3 — every remaining DB-touching aggregation runs in parallel.
  // Previously these were 4 sequential awaits; nothing in here depends on
  // anything else except the inputs we already have from stages 1 + 2.
  const recipientIds = uniqueNonNull(events.map((e) => e.recipient_id));
  const completedRunIds = (recentCompletedRuns ?? []).map((r) => r.id);

  const [hero, recipients, recentCampaigns, neighborhoods] = await Promise.all([
    heroRunRow
      ? buildHero(supabase, heroRunRow, campaigns ?? [], emailConnections ?? [], events)
      : Promise.resolve(null),
    fetchRecipientsLite(supabase, recipientIds),
    buildRecentCampaignStories(
      supabase,
      (recentCompletedRuns ?? []).filter((r) => r.emails_sent > 0),
      campaigns ?? [],
      events,
    ),
    computeNeighborhoods(supabase, completedRunIds, events),
  ]);

  // Stage 4 — pure JS aggregations over data already in memory.
  const thisWeek = computeThisWeek(events, sevenDaysAgo, fourteenDaysAgo);
  const hotContacts = computeHotContacts(events, recipients);
  const health = computeHealth({
    events,
    emailConnections: emailConnections ?? [],
    crmConnections: crmConnections ?? [],
    suppressionsThisWeek: suppressionsThisWeek ?? 0,
  });

  return {
    hero,
    this_week: thisWeek,
    recent_campaigns: recentCampaigns,
    hot_contacts: hotContacts,
    neighborhoods,
    health,
  };
}

// ---------------------------------------------------------------------------
// Helpers — internal types
// ---------------------------------------------------------------------------

type RunRow = {
  id: string;
  campaign_id: string | null;
  phase: RunPhase;
  started_at: string | null;
  completed_at: string | null;
  created_at: string;
  contacts_fetched: number;
  segments_count: number;
  emails_drafted: number;
  emails_sent: number;
  emails_failed: number;
  email_connection_id: string | null;
};

type CampaignRow = { id: string; name: string; lens: string };

type EmailConnectionRow = {
  id: string;
  email_address: string;
  display_name: string | null;
  is_default: boolean;
  is_active: boolean;
  resend_dkim_status: "pending" | "verified" | "failed" | null;
  paused: boolean;
};

type EventRow = {
  type: "sent" | "delivered" | "delivery_delayed" | "bounced" | "complained" | "opened" | "clicked" | "unsubscribed" | "failed";
  recipient_id: string | null;
  occurred_at: string;
  email_connection_id: string | null;
};

type RecipientLite = {
  id: string;
  email_id: string;
  contact_email: string;
  contact_first_name: string | null;
  contact_last_name: string | null;
};

// ---------------------------------------------------------------------------
// Helpers — selection
// ---------------------------------------------------------------------------

function pickByPhasePriority(rows: RunRow[], priority: RunPhase[]): RunRow | null {
  for (const phase of priority) {
    const match = rows.find((r) => r.phase === phase);
    if (match) return match;
  }
  return null;
}

function uniqueNonNull<T>(arr: (T | null | undefined)[]): T[] {
  return Array.from(new Set(arr.filter((v): v is T => v != null)));
}

async function fetchRecipientsLite(
  supabase: SupabaseClient,
  ids: string[],
): Promise<Map<string, RecipientLite>> {
  if (ids.length === 0) return new Map();
  const { data } = await supabase
    .from("hl_recipients")
    .select("id, email_id, contact_email, contact_first_name, contact_last_name")
    .in("id", ids);
  const map = new Map<string, RecipientLite>();
  for (const r of (data ?? []) as RecipientLite[]) map.set(r.id, r);
  return map;
}

// ---------------------------------------------------------------------------
// Hero builder
// ---------------------------------------------------------------------------

async function buildHero(
  supabase: SupabaseClient,
  run: RunRow,
  campaigns: CampaignRow[],
  emailConnections: EmailConnectionRow[],
  events: EventRow[],
): Promise<HeroRun> {
  const campaign = campaigns.find((c) => c.id === run.campaign_id) ?? null;
  const emailConn = emailConnections.find((c) => c.id === run.email_connection_id) ?? null;

  // Pull segments + first email for headline + preview. We also speculatively
  // fetch the recap recipient ids — only the "recap" variant uses them, but
  // running it in parallel costs nothing and saves a sequential round trip
  // when the hero is a completed run.
  const wantsRecap = run.phase === "completed";
  const [
    { data: segments },
    { data: firstEmail },
    { count: recipientsCount },
    recapRecipients,
  ] = await Promise.all([
    supabase
      .from("hl_segments")
      .select("geo_label, geo_key, contact_count, status")
      .eq("run_id", run.id)
      .neq("status", "skipped")
      .order("contact_count", { ascending: false })
      .limit(5),
    supabase
      .from("hl_emails")
      .select("subject, preheader")
      .eq("run_id", run.id)
      .order("created_at", { ascending: true })
      .limit(1)
      .maybeSingle(),
    supabase
      .from("hl_recipients")
      .select("hl_emails!inner(run_id)", { count: "exact", head: true })
      .eq("hl_emails.run_id", run.id),
    wantsRecap
      ? fetchRecipientsForRun(supabase, run.id)
      : Promise.resolve([] as Array<{ id: string }>),
  ]);

  const visibleSegments = (segments ?? []).filter((s) => s.geo_label || s.geo_key);
  const primaryLabel = visibleSegments[0]?.geo_label ?? visibleSegments[0]?.geo_key ?? null;
  const geo_headline =
    visibleSegments.length > 1
      ? `${primaryLabel} + ${visibleSegments.length - 1} more`
      : primaryLabel;

  const variant: HeroVariant = (() => {
    if (run.phase === "review") return "review";
    if (run.phase === "completed") return "recap";
    return "in_flight";
  })();

  const hero: HeroRun = {
    variant,
    run_id: run.id,
    campaign_name: campaign?.name ?? null,
    phase: run.phase,
    geo_headline,
    segments_count: visibleSegments.length || run.segments_count,
    recipients_count: recipientsCount ?? 0,
    emails_sent: run.emails_sent,
    subject_preview: firstEmail?.subject ?? null,
    preheader_preview: firstEmail?.preheader ?? null,
    lens: campaign?.lens ?? null,
    email_address: emailConn?.display_name ?? emailConn?.email_address ?? null,
    started_at: run.started_at,
    completed_at: run.completed_at,
  };

  if (variant === "recap") {
    // Recap variant: surface this run's actual engagement using the
    // recipient ids we speculatively fetched above.
    const recipientIds = new Set(recapRecipients.map((r) => r.id));
    const runEvents = events.filter((e) => e.recipient_id && recipientIds.has(e.recipient_id));
    const uniqByType = new Map<string, Set<string>>();
    for (const e of runEvents) {
      if (!e.recipient_id) continue;
      if (!uniqByType.has(e.type)) uniqByType.set(e.type, new Set());
      uniqByType.get(e.type)!.add(e.recipient_id);
    }
    hero.opens = uniqByType.get("opened")?.size ?? 0;
    hero.clicks = uniqByType.get("clicked")?.size ?? 0;
    hero.bounces = uniqByType.get("bounced")?.size ?? 0;
    hero.unsubscribes = uniqByType.get("unsubscribed")?.size ?? 0;
  }

  return hero;
}

async function fetchRecipientsForRun(supabase: SupabaseClient, runId: string) {
  const { data } = await supabase
    .from("hl_recipients")
    .select("id, hl_emails!inner(run_id)")
    .eq("hl_emails.run_id", runId);
  return (data ?? []) as Array<{ id: string }>;
}

// ---------------------------------------------------------------------------
// This-week summary
// ---------------------------------------------------------------------------

function computeThisWeek(
  events: EventRow[],
  sevenDaysAgo: Date,
  fourteenDaysAgo: Date,
): ThisWeekSummary {
  const thisWeek = events.filter((e) => new Date(e.occurred_at) >= sevenDaysAgo);
  const priorWeek = events.filter((e) => {
    const t = new Date(e.occurred_at);
    return t >= fourteenDaysAgo && t < sevenDaysAgo;
  });

  const uniqByType = (rows: EventRow[]) => {
    const m = new Map<string, Set<string>>();
    for (const e of rows) {
      if (!e.recipient_id) continue;
      if (!m.has(e.type)) m.set(e.type, new Set());
      m.get(e.type)!.add(e.recipient_id);
    }
    return m;
  };

  const tw = uniqByType(thisWeek);
  const pw = uniqByType(priorWeek);

  // "sends" = unique recipients we have a sent OR delivered event for.
  const sends = uniqueUnion(tw.get("sent"), tw.get("delivered")).size;
  const opens = tw.get("opened")?.size ?? 0;
  const clicks = tw.get("clicked")?.size ?? 0;
  const open_rate = sends ? opens / sends : 0;
  const click_rate = sends ? clicks / sends : 0;

  const priorSends = uniqueUnion(pw.get("sent"), pw.get("delivered")).size;
  const priorOpenRate = priorSends ? (pw.get("opened")?.size ?? 0) / priorSends : 0;
  const vs_prior_week_open_rate_delta = priorOpenRate ? open_rate - priorOpenRate : 0;

  // Sparkline: daily sends over the last 7 days, oldest → newest.
  const now = Date.now();
  const buckets = new Array(7).fill(0) as number[];
  for (const e of thisWeek) {
    if (e.type !== "sent" && e.type !== "delivered") continue;
    const ageDays = Math.floor((now - new Date(e.occurred_at).getTime()) / DAY_MS);
    const idx = 6 - Math.min(6, Math.max(0, ageDays));
    buckets[idx] += 1;
  }

  return {
    sends,
    opens,
    clicks,
    replies: 0, // Resend doesn't notify; placeholder for future inbound integration.
    open_rate,
    click_rate,
    vs_prior_week_open_rate_delta,
    spark_daily_sends: buckets,
  };
}

function uniqueUnion(a?: Set<string>, b?: Set<string>): Set<string> {
  const out = new Set<string>();
  a?.forEach((v) => out.add(v));
  b?.forEach((v) => out.add(v));
  return out;
}

// ---------------------------------------------------------------------------
// Recent campaign stories
// ---------------------------------------------------------------------------

async function buildRecentCampaignStories(
  supabase: SupabaseClient,
  runs: Array<{ id: string; campaign_id: string | null; completed_at: string | null; emails_sent: number }>,
  campaigns: CampaignRow[],
  events: EventRow[],
): Promise<CampaignStory[]> {
  if (runs.length === 0) return [];

  // For each run, we need: a geo label (from segments) + per-run engagement.
  const runIds = runs.map((r) => r.id);
  const [{ data: segments }, { data: runRecipients }] = await Promise.all([
    supabase
      .from("hl_segments")
      .select("run_id, geo_label, geo_key, contact_count")
      .in("run_id", runIds)
      .order("contact_count", { ascending: false }),
    supabase
      .from("hl_recipients")
      .select("id, hl_emails!inner(run_id)")
      .in("hl_emails.run_id", runIds),
  ]);

  const runToRecipients = new Map<string, Set<string>>();
  for (const r of (runRecipients ?? []) as Array<{ id: string; hl_emails: { run_id: string } | { run_id: string }[] }>) {
    const runId = Array.isArray(r.hl_emails) ? r.hl_emails[0]?.run_id : r.hl_emails?.run_id;
    if (!runId) continue;
    if (!runToRecipients.has(runId)) runToRecipients.set(runId, new Set());
    runToRecipients.get(runId)!.add(r.id);
  }

  const segByRun = new Map<string, Array<{ geo_label: string | null; geo_key: string; contact_count: number }>>();
  for (const s of (segments ?? []) as Array<{ run_id: string; geo_label: string | null; geo_key: string; contact_count: number }>) {
    if (!segByRun.has(s.run_id)) segByRun.set(s.run_id, []);
    segByRun.get(s.run_id)!.push(s);
  }

  const stories: CampaignStory[] = [];
  for (const run of runs) {
    if (!run.completed_at) continue;
    const recipientIds = runToRecipients.get(run.id) ?? new Set();
    const runEvents = events.filter((e) => e.recipient_id && recipientIds.has(e.recipient_id));
    const uniq = uniqueByType(runEvents);

    const sends = uniqueUnion(uniq.get("sent"), uniq.get("delivered")).size || recipientIds.size;
    const opens = uniq.get("opened")?.size ?? 0;
    const clicks = uniq.get("clicked")?.size ?? 0;
    const unsubscribes = uniq.get("unsubscribed")?.size ?? 0;

    const segs = segByRun.get(run.id) ?? [];
    const primary = segs[0]?.geo_label ?? segs[0]?.geo_key ?? null;
    const geo_headline = segs.length > 1 ? `${primary} + ${segs.length - 1} more` : primary;
    const campaign = campaigns.find((c) => c.id === run.campaign_id);

    stories.push({
      run_id: run.id,
      campaign_name: campaign?.name ?? "Untitled campaign",
      geo_headline,
      sent_label: humanSentLabel(run.completed_at),
      recipients_count: sends,
      opens,
      clicks,
      unsubscribes,
      open_rate: sends ? opens / sends : 0,
      click_rate: sends ? clicks / sends : 0,
      completed_at: run.completed_at,
    });
  }

  return stories;
}

function uniqueByType(rows: EventRow[]): Map<string, Set<string>> {
  const m = new Map<string, Set<string>>();
  for (const e of rows) {
    if (!e.recipient_id) continue;
    if (!m.has(e.type)) m.set(e.type, new Set());
    m.get(e.type)!.add(e.recipient_id);
  }
  return m;
}

function humanSentLabel(iso: string): string {
  const then = new Date(iso);
  const now = new Date();
  const diff = now.getTime() - then.getTime();
  const days = Math.floor(diff / DAY_MS);
  if (days === 0) return "sent today";
  if (days === 1) return "sent yesterday";
  if (days < 7) return `sent ${days} days ago`;
  return `sent ${then.toLocaleDateString(undefined, { month: "short", day: "numeric" })}`;
}

// ---------------------------------------------------------------------------
// Hot contacts
// ---------------------------------------------------------------------------

function computeHotContacts(
  events: EventRow[],
  recipients: Map<string, RecipientLite>,
): HotContact[] {
  // Aggregate per contact_email so the same person across multiple sends rolls up.
  type Bucket = {
    email: string;
    name: string | null;
    opens: number;
    clicks: number;
    sends: number;
    last_event_at: string;
    last_event_type: "opened" | "clicked";
  };
  const byEmail = new Map<string, Bucket>();

  for (const e of events) {
    if (!e.recipient_id) continue;
    const r = recipients.get(e.recipient_id);
    if (!r) continue;
    const email = r.contact_email.toLowerCase();
    let b = byEmail.get(email);
    if (!b) {
      b = {
        email,
        name: formatName(r),
        opens: 0,
        clicks: 0,
        sends: 0,
        last_event_at: e.occurred_at,
        last_event_type: "opened",
      };
      byEmail.set(email, b);
    }
    if (e.type === "opened") b.opens += 1;
    else if (e.type === "clicked") b.clicks += 1;
    else if (e.type === "sent" || e.type === "delivered") b.sends += 1;

    if ((e.type === "opened" || e.type === "clicked") && e.occurred_at > b.last_event_at) {
      b.last_event_at = e.occurred_at;
      b.last_event_type = e.type;
    }
  }

  // Score: clicks weigh more than opens. Anyone with 0 opens AND 0 clicks isn't "hot."
  const ranked = Array.from(byEmail.values())
    .filter((b) => b.opens + b.clicks > 0)
    .map((b) => ({ bucket: b, score: b.opens + b.clicks * 3 }))
    .sort((a, b) => b.score - a.score)
    .slice(0, 8);

  return ranked.map(({ bucket: b }) => ({
    email: b.email,
    name: b.name,
    open_count: b.opens,
    click_count: b.clicks,
    sends_received: b.sends || Math.max(b.opens, b.clicks, 1),
    last_event_at: b.last_event_at,
    last_event_type: b.last_event_type,
    signature: formatHotSignature(b.opens, b.clicks, b.sends),
  }));
}

function formatName(r: RecipientLite): string | null {
  const parts = [r.contact_first_name, r.contact_last_name].filter(Boolean);
  return parts.length ? parts.join(" ") : null;
}

function formatHotSignature(opens: number, clicks: number, sends: number): string {
  if (clicks > 0) {
    if (clicks === 1) return `clicked your last email`;
    return `clicked ${clicks} of your emails`;
  }
  if (sends > 0) return `opened ${opens} of last ${sends}`;
  return `opened ${opens} ${opens === 1 ? "email" : "emails"}`;
}

// ---------------------------------------------------------------------------
// Neighborhood leaderboard
// ---------------------------------------------------------------------------

async function computeNeighborhoods(
  supabase: SupabaseClient,
  recentRunIds: string[],
  events: EventRow[],
): Promise<NeighborhoodRow[]> {
  if (recentRunIds.length === 0) return [];

  // recipient → email → segment → geo_label
  const { data: joinRows } = await supabase
    .from("hl_recipients")
    .select("id, hl_emails!inner(run_id, hl_segments!inner(geo_label, geo_key))")
    .in("hl_emails.run_id", recentRunIds);

  type GeoBucket = { label: string; recipients: Set<string>; opens: Set<string>; clicks: Set<string> };
  const byGeo = new Map<string, GeoBucket>();

  // Build recipient -> geo map.
  const recipientToGeo = new Map<string, string>();
  for (const row of (joinRows ?? []) as Array<{
    id: string;
    hl_emails: { hl_segments: { geo_label: string | null; geo_key: string } | { geo_label: string | null; geo_key: string }[] } | { hl_segments: { geo_label: string | null; geo_key: string } | { geo_label: string | null; geo_key: string }[] }[];
  }>) {
    const emails = Array.isArray(row.hl_emails) ? row.hl_emails[0] : row.hl_emails;
    const seg = emails && (Array.isArray(emails.hl_segments) ? emails.hl_segments[0] : emails.hl_segments);
    const label = seg?.geo_label ?? seg?.geo_key;
    if (!label) continue;
    recipientToGeo.set(row.id, label);
    if (!byGeo.has(label)) {
      byGeo.set(label, { label, recipients: new Set(), opens: new Set(), clicks: new Set() });
    }
    byGeo.get(label)!.recipients.add(row.id);
  }

  for (const e of events) {
    if (!e.recipient_id) continue;
    const geo = recipientToGeo.get(e.recipient_id);
    if (!geo) continue;
    const bucket = byGeo.get(geo)!;
    if (e.type === "opened") bucket.opens.add(e.recipient_id);
    else if (e.type === "clicked") bucket.clicks.add(e.recipient_id);
  }

  return Array.from(byGeo.values())
    .filter((b) => b.recipients.size >= 3) // ignore tiny neighborhoods — noisy
    .map((b) => ({
      label: b.label,
      recipients: b.recipients.size,
      open_rate: b.recipients.size ? b.opens.size / b.recipients.size : 0,
      clicks: b.clicks.size,
    }))
    .sort((a, b) => b.open_rate - a.open_rate)
    .slice(0, 5);
}

// ---------------------------------------------------------------------------
// Health rail
// ---------------------------------------------------------------------------

function computeHealth(input: {
  events: EventRow[];
  emailConnections: EmailConnectionRow[];
  crmConnections: Array<{ platform: string; label: string | null }>;
  suppressionsThisWeek: number;
}): HealthRail {
  const { events, emailConnections, crmConnections, suppressionsThisWeek } = input;

  const sends = events.filter((e) => e.type === "sent" || e.type === "delivered").length;
  const bounces = events.filter((e) => e.type === "bounced").length;
  const bounce_rate = sends ? bounces / sends : 0;

  const defaultConn = emailConnections.find((c) => c.is_default && c.is_active) ?? emailConnections[0] ?? null;
  const domain_verified = !!emailConnections.find((c) => c.is_active && c.resend_dkim_status === "verified");
  const paused_connections = emailConnections.filter((c) => c.paused).length;

  let severity: HealthSeverity = "good";
  if (bounce_rate >= 0.05 || paused_connections > 0) severity = "bad";
  else if (bounce_rate >= 0.02 || !domain_verified) severity = "warn";

  return {
    severity,
    bounce_rate,
    domain_verified,
    paused_connections,
    suppressions_this_week: suppressionsThisWeek,
    crm_label: crmConnections[0]?.label ?? crmConnections[0]?.platform ?? null,
    email_label: defaultConn?.display_name ?? defaultConn?.email_address ?? null,
  };
}

// ---------------------------------------------------------------------------
// Empty fallback
// ---------------------------------------------------------------------------

function emptyDashboard(): DashboardData {
  return {
    hero: null,
    this_week: {
      sends: 0,
      opens: 0,
      clicks: 0,
      replies: 0,
      open_rate: 0,
      click_rate: 0,
      vs_prior_week_open_rate_delta: 0,
      spark_daily_sends: new Array(7).fill(0),
    },
    recent_campaigns: [],
    hot_contacts: [],
    neighborhoods: [],
    health: {
      severity: "good",
      bounce_rate: 0,
      domain_verified: false,
      paused_connections: 0,
      suppressions_this_week: 0,
      crm_label: null,
      email_label: null,
    },
  };
}
