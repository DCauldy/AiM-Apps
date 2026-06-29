import "server-only";

import { createHash, timingSafeEqual } from "node:crypto";
import { decrypt } from "@/lib/hyperlocal/encryption";
import type {
  HlEmailAppMetadata,
  PlatformEmailConnection,
} from "@/types/platform-connections";
import type {
  CampaignInput,
  CampaignRef,
  CampaignStatus,
  ContactLookupResult,
  ContactStatus,
  ContactUpsert,
  EmailProviderAdapter,
  NormalizedEspEvent,
  ProviderCapabilities,
} from "./types";

// ============================================================
// Mailchimp campaign-mode adapter.
//
// Mailchimp owns the audience + delivery; Hyperlocal owns the AI-generated
// content + the run pipeline. The flow:
//
//   1. lookupContacts → query the agent's audience for each candidate
//      recipient → bucket {subscribed, unsubscribed, cleaned, pending,
//      not_found}.
//   2. (caller) Park run in awaiting_audience_confirmation when not_found
//      count > 0 so the agent can approve adding to their (billed) audience.
//   3. upsertContacts → POST /lists/{id}/members in batches with the
//      run's per-campaign tag so the campaign can target by tag.
//   4. createCampaign → POST /campaigns with type=regular + segment_opts
//      filtering on the tag.
//   5. sendCampaign → POST /campaigns/{id}/actions/send.
//   6. Webhook events flow back via /api/webhooks/mailchimp.
//
// Authentication: API key for v1. The key encodes the datacenter as
// "key-us12" — we split + store both. OAuth is the right end-state for
// frictionless onboarding; this v1 lets us ship without the OAuth round-trip.
// ============================================================

const MAILCHIMP_CAPABILITIES: ProviderCapabilities = {
  // Mailchimp appends its own footer with the audience's mandatory
  // physical address + a one-click unsubscribe link tied to its system.
  // Rendering ours on top creates double disclosures + dueling unsub paths.
  handles_compliance_footer: true,
  handles_unsubscribe: true,
  supports_per_contact_events: true,
  supports_merge_tags: true,
};

export const mailchimpAdapter: EmailProviderAdapter = {
  mode: "campaign",
  capabilities: MAILCHIMP_CAPABILITIES,

  async lookupContacts(
    conn: PlatformEmailConnection,
    metadata: HlEmailAppMetadata,
    emails: string[],
  ): Promise<ContactLookupResult> {
    const { apiKey, dc, audienceId } = mcCreds(conn, metadata);
    // Mailchimp's "members" endpoint accepts a fields filter + count limit.
    // We page through, mapping each found email → status. Anything we don't
    // get back is bucketed as not_found.
    const found = new Map<string, { status: string; tags?: { name: string }[] }>();
    const lowered = emails.map((e) => e.toLowerCase());

    // GET /lists/{id}/members?count=N&fields=... — Mailchimp doesn't support
    // bulk email lookup so we query in pages and intersect. For a tight
    // audience this is fine; for huge audiences (>50k) we'd want a different
    // strategy (search by hash per email).
    let offset = 0;
    const pageSize = 1000;
    const MAX_PAGES = 25; // 25k contacts max scan
    for (let page = 0; page < MAX_PAGES; page++) {
      const data = await mcFetch<{
        members: Array<{ email_address: string; status: string; tags?: { name: string }[] }>;
        total_items: number;
      }>(
        apiKey,
        dc,
        "GET",
        `/lists/${audienceId}/members?count=${pageSize}&offset=${offset}&fields=members.email_address,members.status,members.tags,total_items`,
      );
      for (const m of data.members ?? []) {
        const k = m.email_address.toLowerCase();
        if (lowered.includes(k)) {
          found.set(k, { status: m.status, tags: m.tags });
        }
      }
      offset += pageSize;
      if (!data.members || data.members.length < pageSize) break;
    }

    return {
      rows: lowered.map((email) => {
        const m = found.get(email);
        return {
          email,
          status: mcStatusToContactStatus(m?.status),
          tags: m?.tags?.map((t) => t.name),
        };
      }),
    };
  },

  async upsertContacts(
    conn: PlatformEmailConnection,
    metadata: HlEmailAppMetadata,
    contacts: ContactUpsert[],
    tag: string,
  ): Promise<void> {
    const { apiKey, dc, audienceId } = mcCreds(conn, metadata);

    // Mailchimp tags can't be set via the inline `tags` field on the member
    // upsert — that field is read-only-ish (informational, doesn't write back).
    // The documented path is two requests per contact:
    //   1. PUT /lists/{id}/members/{hash}  → upserts the contact
    //   2. POST /lists/{id}/members/{hash}/tags  → attaches the tag
    //      (creates the tag globally if it doesn't exist yet)
    for (const c of contacts) {
      const hash = md5Lower(c.email);
      await mcFetch<unknown>(
        apiKey,
        dc,
        "PUT",
        `/lists/${audienceId}/members/${hash}`,
        {
          email_address: c.email,
          status_if_new: "subscribed", // user has approved adding via the audience-confirmation step
          merge_fields: buildMergeFields(c),
        },
      );
      await mcFetch<unknown>(
        apiKey,
        dc,
        "POST",
        `/lists/${audienceId}/members/${hash}/tags`,
        {
          tags: [{ name: tag, status: "active" }],
        },
      );
    }
  },

  async createCampaign(
    conn: PlatformEmailConnection,
    metadata: HlEmailAppMetadata,
    input: CampaignInput,
  ): Promise<CampaignRef> {
    const { apiKey, dc, audienceId } = mcCreds(conn, metadata);

    // Mailchimp tags ARE static segments under the hood, but campaigns
    // target them by NUMERIC segment_id (not the tag name string). After
    // upsertContacts has attached the tag (which auto-creates the static
    // segment), we resolve the segment_id by listing static segments and
    // matching by name.
    const segmentId = await resolveTagSegmentId(apiKey, dc, audienceId, input.tag);
    if (segmentId == null) {
      throw new Error(
        `Mailchimp: couldn't resolve tag "${input.tag}" to a static segment id. ` +
          `Tag may not have been attached to any contact yet, or the tag-search endpoint returned no match.`,
      );
    }

    // 1. Create the campaign targeting that segment_id.
    const campaign = await mcFetch<{ id: string }>(
      apiKey,
      dc,
      "POST",
      `/campaigns`,
      {
        type: "regular",
        recipients: {
          list_id: audienceId,
          segment_opts: {
            saved_segment_id: segmentId,
          },
        },
        settings: {
          subject_line: input.subject,
          preview_text: input.preheader,
          title: `Hyperlocal — ${input.tag}`,
          from_name: input.from_name,
          reply_to: input.reply_to ?? input.from_email,
          to_name: "*|FNAME|* *|LNAME|*",
        },
      },
    );

    // 2. Set the HTML/plain content separately (PUT /campaigns/{id}/content).
    await mcFetch<unknown>(apiKey, dc, "PUT", `/campaigns/${campaign.id}/content`, {
      html: input.html,
      plain_text: input.text,
    });

    return { campaign_id: campaign.id };
  },

  async sendCampaign(
    conn: PlatformEmailConnection,
    metadata: HlEmailAppMetadata,
    ref: CampaignRef,
  ): Promise<void> {
    const { apiKey, dc } = mcCreds(conn, metadata);
    // POST /campaigns/{id}/actions/send — no body, returns 204.
    await mcFetch<unknown>(
      apiKey,
      dc,
      "POST",
      `/campaigns/${ref.campaign_id}/actions/send`,
    );
  },

  async getCampaignStatus(
    conn: PlatformEmailConnection,
    metadata: HlEmailAppMetadata,
    ref: CampaignRef,
  ): Promise<CampaignStatus> {
    const { apiKey, dc } = mcCreds(conn, metadata);
    const data = await mcFetch<{ status: string }>(
      apiKey,
      dc,
      "GET",
      `/campaigns/${ref.campaign_id}?fields=status`,
    );
    // Mailchimp statuses: save, paused, schedule, sending, sent, archived,
    // canceled. Map to our enum.
    switch (data.status) {
      case "save":
        return "draft";
      case "paused":
        return "paused";
      case "schedule":
        return "scheduled";
      case "sending":
        return "sending";
      case "sent":
      case "archived":
        return "sent";
      case "canceled":
        return "failed";
      default:
        return "draft";
    }
  },

  /**
   * Mailchimp webhooks aren't signed by default. Optional security is via
   * a shared secret in the webhook URL itself: ?secret=xxx. We append that
   * at provisioning time; the receiver compares timing-safely.
   */
  verifyWebhookSignature(
    _rawBody: string,
    headers: Headers,
    secret: string,
  ): boolean {
    if (!secret) return false;
    // The provisioner appends ?secret=... to the webhook URL; the receiver
    // pulls it from the URL and passes it here.
    const provided = headers.get("x-mc-secret") ?? "";
    if (!provided) return false;
    const a = Buffer.from(provided);
    const b = Buffer.from(secret);
    if (a.length !== b.length) return false;
    try {
      return timingSafeEqual(a, b);
    } catch {
      return false;
    }
  },

  parseWebhookEvent(payload: unknown): NormalizedEspEvent | null {
    if (!payload || typeof payload !== "object") return null;
    const p = payload as {
      type?: string;
      fired_at?: string;
      data?: Record<string, unknown>;
    };

    // Mailchimp webhook types: subscribe, unsubscribe, profile, cleaned,
    // upemail, campaign. We care about campaign + unsubscribe + cleaned.
    if (p.type === "campaign") {
      // Campaign-level event — Mailchimp fires this when a campaign starts
      // sending. We map to "sent" once with the campaign_id as message_id.
      const data = p.data ?? {};
      const id = String(data.id ?? "");
      if (!id) return null;
      return {
        type: "sent",
        provider_message_id: id,
        occurred_at: parseFired(p.fired_at),
        raw: payload,
      };
    }

    if (p.type === "unsubscribe") {
      const data = p.data ?? {};
      const campaignId = String((data as { campaign_id?: string }).campaign_id ?? "");
      const email = String((data as { email?: string }).email ?? "");
      const reason = String((data as { reason?: string }).reason ?? "");
      if (!campaignId || !email) return null;
      return {
        type: reason === "abuse" ? "complained" : "unsubscribed",
        provider_message_id: campaignId,
        recipient_email: email,
        occurred_at: parseFired(p.fired_at),
        reason,
        raw: payload,
      };
    }

    if (p.type === "cleaned") {
      const data = p.data ?? {};
      const campaignId = String((data as { campaign_id?: string }).campaign_id ?? "");
      const email = String((data as { email?: string }).email ?? "");
      const reason = String((data as { reason?: string }).reason ?? "");
      return {
        type: "bounced",
        provider_message_id: campaignId,
        recipient_email: email,
        bounce_type: reason === "hard" ? "hard" : "soft",
        occurred_at: parseFired(p.fired_at),
        reason,
        raw: payload,
      };
    }

    return null;
  },
};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

interface McCreds {
  apiKey: string;
  dc: string;
  audienceId: string;
}

function mcCreds(
  conn: PlatformEmailConnection,
  metadata: HlEmailAppMetadata,
): McCreds {
  const encryptedKey = conn.provider_api_key_encrypted;
  if (!encryptedKey) {
    throw new Error(
      "Mailchimp connection has no API key stored. Reconnect under Settings → Email.",
    );
  }
  const apiKey = decrypt(encryptedKey);
  const dc = metadata.mailchimp?.dc;
  const audienceId = metadata.mailchimp?.audience_id;
  if (!dc) throw new Error("Mailchimp connection missing datacenter (dc).");
  if (!audienceId) {
    throw new Error("Mailchimp connection missing audience_id — pick one in Settings.");
  }
  return { apiKey, dc, audienceId };
}

const MC_API_VERSION = "3.0";

async function mcFetch<T>(
  apiKey: string,
  dc: string,
  method: "GET" | "POST" | "PUT" | "PATCH" | "DELETE",
  path: string,
  body?: unknown,
): Promise<T> {
  const url = `https://${dc}.api.mailchimp.com/${MC_API_VERSION}${path}`;
  const res = await fetch(url, {
    method,
    headers: {
      // Basic auth with username "anystring" + the API key. Mailchimp ignores
      // the username portion entirely.
      Authorization: "Basic " + Buffer.from(`hl:${apiKey}`).toString("base64"),
      "Content-Type": "application/json",
    },
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`Mailchimp ${method} ${path} → ${res.status}: ${text.slice(0, 280)}`);
  }
  if (res.status === 204) return undefined as unknown as T;
  return (await res.json()) as T;
}

function mcStatusToContactStatus(s: string | undefined): ContactStatus {
  switch (s) {
    case "subscribed":
      return { state: "subscribed" };
    case "unsubscribed":
      return { state: "unsubscribed" };
    case "cleaned":
      return { state: "cleaned" };
    case "pending":
    case "transactional":
      return { state: "pending" };
    default:
      return { state: "not_found" };
  }
}

function buildMergeFields(c: ContactUpsert): Record<string, string> {
  // Mailchimp's standard merge tags: FNAME, LNAME. Custom ones live on the
  // audience and would need an audience-config step. For v1 we just push
  // first/last name through these conventional fields.
  const out: Record<string, string> = { ...(c.merge_fields ?? {}) };
  if (c.first_name) out.FNAME = c.first_name;
  if (c.last_name) out.LNAME = c.last_name;
  return out;
}

function md5Lower(email: string): string {
  return createHash("md5").update(email.trim().toLowerCase()).digest("hex");
}

/**
 * Look up a tag's numeric static_segment_id by its name. Mailchimp tags
 * surface as static segments under the hood; campaigns target them by id,
 * not by name string. Returns null if no segment matches.
 */
async function resolveTagSegmentId(
  apiKey: string,
  dc: string,
  audienceId: string,
  tagName: string,
): Promise<number | null> {
  // GET /lists/{id}/segments?type=static — pages of up to 1000. Most agents
  // will have far fewer static segments than that; we cap at one page for
  // now. If volume becomes a problem, switch to /lists/{id}/tag-search,
  // which returns just tags but takes a literal name filter.
  const data = await mcFetch<{
    segments: Array<{ id: number; name: string }>;
  }>(
    apiKey,
    dc,
    "GET",
    `/lists/${audienceId}/segments?type=static&count=1000&fields=segments.id,segments.name`,
  );
  const match = (data.segments ?? []).find(
    (s) => s.name === tagName,
  );
  return match?.id ?? null;
}

function parseFired(fired: string | undefined): Date {
  if (!fired) return new Date();
  // Mailchimp fires "YYYY-MM-DD HH:MM:SS" in UTC. Date.parse accepts ISO,
  // not this format — convert.
  const iso = fired.replace(" ", "T") + "Z";
  const t = Date.parse(iso);
  return Number.isFinite(t) ? new Date(t) : new Date();
}
