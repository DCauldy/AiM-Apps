import "server-only";

import { timingSafeEqual } from "node:crypto";
import {
  acAuthFromConnection,
  acV1,
  acV3,
} from "./activecampaign-client";
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
import type { HlEmailConnection } from "@/types/hyperlocal";

// ============================================================
// ActiveCampaign campaign-mode adapter — full Phase 2 pipeline.
//
// AC owns the audience + delivery; Hyperlocal owns the AI-generated
// content + run orchestration. The flow mirrors Mailchimp's:
//
//   1. lookupContacts → query each email's list membership, bucket by
//      subscription state. Run dispatcher uses this to decide whether
//      to park in awaiting_audience_confirmation.
//   2. upsertContacts → POST /contacts to create, POST /contactLists
//      to subscribe to the connected list, attach the run's tag.
//   3. createCampaign → v1 message_add + v1 campaign_create. v3
//      doesn't support POST /campaigns (405), so we stay in v1 for
//      the create/send pair.
//   4. sendCampaign → v1 campaign_send action=send.
//   5. Webhook events flow back via /api/webhooks/activecampaign.
//
// IMPORTANT v1 limitation: createCampaign targets the WHOLE connected
// list, not a per-run subset. Multi-run accounts that share an AC list
// will re-receive every Hyperlocal campaign. The future fix is to
// create a v3 segment with a tag filter per run and target that
// segment id, but AC's segment-rule DSL is fussy and risky to ship on
// first pass. The tag IS still attached for tracking + future
// segmentation; nothing about the dispatch contract changes.
// ============================================================

const ACTIVECAMPAIGN_CAPABILITIES: ProviderCapabilities = {
  handles_compliance_footer: true,
  handles_unsubscribe: true,
  supports_per_contact_events: true,
  supports_merge_tags: true,
};

export const activecampaignAdapter: EmailProviderAdapter = {
  mode: "campaign",
  capabilities: ACTIVECAMPAIGN_CAPABILITIES,

  // ---- Campaign pipeline ----

  async lookupContacts(
    connection: HlEmailConnection,
    emails: string[],
  ): Promise<ContactLookupResult> {
    const auth = acAuthFromConnection(connection);
    if (!auth.listId) {
      throw new Error(
        "AC connection has no list selected — pick one in Settings → Email → ActiveCampaign.",
      );
    }
    const listId = auth.listId;
    const lowered = emails.map((e) => e.toLowerCase());

    // AC v3 supports /contacts?email=X for individual lookup. We could
    // also call /contacts?listid=X with pagination, but the per-email
    // path is simpler for typical Hyperlocal volumes (tens to low
    // hundreds per run).
    const rows = await Promise.all(
      lowered.map(async (email) => {
        try {
          const data = await acV3<{
            contacts?: Array<{
              id: string;
              email: string;
            }>;
          }>(auth, "GET", `/contacts?email=${encodeURIComponent(email)}`);
          const contact = data.contacts?.[0];
          if (!contact) {
            return { email, status: { state: "not_found" } as ContactStatus };
          }

          // Found the contact — now check their relationship to the
          // connected list via /contactLists.
          const cl = await acV3<{
            contactLists?: Array<{ list: string; status: string }>;
          }>(
            auth,
            "GET",
            `/contacts/${contact.id}/contactLists`,
          );
          const membership = cl.contactLists?.find((m) => m.list === listId);
          return {
            email,
            status: acMembershipToContactStatus(membership?.status),
          };
        } catch {
          // A 404 on the contact lookup is a real not_found; other
          // errors we treat the same so the run can proceed rather
          // than block on a single flaky request.
          return { email, status: { state: "not_found" } as ContactStatus };
        }
      }),
    );

    return { rows };
  },

  async upsertContacts(
    connection: HlEmailConnection,
    contacts: ContactUpsert[],
    tag: string,
  ): Promise<void> {
    const auth = acAuthFromConnection(connection);
    if (!auth.listId) {
      throw new Error("AC connection has no list selected.");
    }

    // Resolve the tag id once — POST /contactTags references tags by
    // numeric id, not name. AC dedupes by name so creating an existing
    // tag is a no-op.
    const tagId = await resolveOrCreateTag(auth, tag);

    for (const c of contacts) {
      // 1. Sync the contact (creates new or updates existing).
      const synced = await acV3<{ contact?: { id: string } }>(
        auth,
        "POST",
        "/contact/sync",
        {
          contact: {
            email: c.email,
            firstName: c.first_name ?? undefined,
            lastName: c.last_name ?? undefined,
          },
        },
      );
      const contactId = synced.contact?.id;
      if (!contactId) {
        throw new Error(`AC didn't return a contact id for ${c.email}`);
      }

      // 2. Subscribe them to the connected list (status=1 = active).
      //    Idempotent — re-subscribing an active contact is a no-op.
      await acV3(auth, "POST", "/contactLists", {
        contactList: {
          list: auth.listId,
          contact: contactId,
          status: 1,
        },
      });

      // 3. Attach the run tag for tracking.
      await acV3(auth, "POST", "/contactTags", {
        contactTag: {
          contact: contactId,
          tag: tagId,
        },
      });
    }
  },

  async createCampaign(
    connection: HlEmailConnection,
    input: CampaignInput,
  ): Promise<CampaignRef> {
    const auth = acAuthFromConnection(connection);
    if (!auth.listId) {
      throw new Error("AC connection has no list selected.");
    }
    const timestamp = new Date().toISOString();

    // ---- Per-run sub-list targeting ----
    // AC's v3 segment API for tag-based filters isn't publicly
    // documented (multiple incompatible body formats exist in the wild
    // — see https://github.com/anthropics/... discussion). We use a
    // per-run sub-list instead: create a fresh AC list named for the
    // run, copy the tagged contacts into it, and target the campaign
    // at that list. Cleanup happens via a janitor cron (separate
    // ticket — sweeps `Hyperlocal — *` lists older than 14 days).

    // 1. Resolve the run's tag id (the tag was attached during
    //    upsertContacts; this just looks it up by name).
    const tagId = await resolveOrCreateTag(auth, input.tag);

    // 2. Page through the main list's contacts filtered by the tag.
    //    AC returns up to 100 per page; we cap at 50 pages (5000
    //    contacts) — far above any realistic Hyperlocal run size.
    const contactIds: string[] = [];
    const pageSize = 100;
    for (let page = 0; page < 50; page++) {
      const data = await acV3<{ contacts?: Array<{ id: string }> }>(
        auth,
        "GET",
        `/contacts?listid=${encodeURIComponent(auth.listId)}&tagid=${encodeURIComponent(tagId)}&limit=${pageSize}&offset=${page * pageSize}`,
      );
      const ids = (data.contacts ?? []).map((c) => c.id);
      contactIds.push(...ids);
      if (ids.length < pageSize) break;
    }
    if (contactIds.length === 0) {
      throw new Error(
        `No contacts on the AC list tagged with "${input.tag}". ` +
          `upsertContacts may have failed silently or the tag wasn't applied.`,
      );
    }

    // 3. Create the per-run sub-list. AC requires name + stringid +
    //    sender_url + sender_reminder for CAN-SPAM. The stringid feeds
    //    into AC's unsubscribe URLs so it must be URL-safe + unique.
    const runShortId = input.tag.replace(/[^a-z0-9]/gi, "_").slice(0, 50);
    const senderUrl = input.from_email.includes("@")
      ? `https://${input.from_email.split("@")[1]}`
      : "https://example.com";
    const subListRes = await acV3<{ list?: { id: string } }>(
      auth,
      "POST",
      "/lists",
      {
        list: {
          name: `Hyperlocal — ${input.tag} — ${timestamp.slice(0, 10)}`,
          stringid: `hl_${runShortId}_${Date.now()}`,
          sender_url: senderUrl,
          sender_reminder:
            "You're receiving this because you opted in to neighborhood market updates.",
        },
      },
    );
    const subListId = subListRes.list?.id;
    if (!subListId) throw new Error("AC didn't return a sub-list id");

    try {
      // 4. Subscribe each tagged contact to the sub-list. Serial to
      //    stay under AC's per-second rate ceiling. For a 200-recipient
      //    run this takes ~5–10s — acceptable since campaign send takes
      //    minutes anyway.
      for (const contactId of contactIds) {
        await acV3(auth, "POST", "/contactLists", {
          contactList: { list: subListId, contact: contactId, status: 1 },
        });
      }

      // 5. v1 message_add against the sub-list.
      const messageRes = await acV1<{ id?: string }>(auth, "message_add", {
        format: "mime",
        subject: input.subject,
        fromemail: input.reply_to ?? input.from_email,
        fromname: input.from_name,
        reply2: input.reply_to ?? input.from_email,
        priority: 3,
        charset: "utf-8",
        encoding: "quoted-printable",
        htmlfetch: "",
        textfetch: "",
        htmlconstructor: 1,
        template: 0,
        html: input.html,
        text: input.text,
        [`p[${subListId}]`]: subListId,
      });
      if (!messageRes.ok) {
        throw new Error(
          `AC message_add rejected: ${messageRes.raw.slice(0, 600)}`,
        );
      }
      const messageId = messageRes.json?.id;
      if (!messageId) throw new Error("AC didn't return a message id");

      // 6. v1 campaign_create targeting the sub-list (so only the
      //    tagged contacts receive it — not the entire main list).
      const campaignRes = await acV1<{ id?: string }>(
        auth,
        "campaign_create",
        {
          type: "single",
          name: `Hyperlocal — ${input.tag} — ${timestamp}`,
          sdate: timestamp.replace("T", " ").slice(0, 19),
          status: 0,
          public: 0,
          tracklinks: "all",
          [`m[${messageId}]`]: 100,
          [`p[${subListId}]`]: subListId,
        },
      );
      if (!campaignRes.ok) {
        throw new Error(
          `AC campaign_create rejected: ${campaignRes.raw.slice(0, 600)}`,
        );
      }
      const campaignId = campaignRes.json?.id;
      if (!campaignId) throw new Error("AC didn't return a campaign id");

      return { campaign_id: campaignId };
    } catch (e) {
      // Failure cleanup — drop the half-built sub-list so the agent's
      // AC dashboard doesn't accumulate orphans from failed attempts.
      // The janitor handles successful-run cleanup separately.
      await acV3(auth, "DELETE", `/lists/${subListId}`).catch(() => {});
      throw e;
    }
  },

  async sendCampaign(
    connection: HlEmailConnection,
    ref: CampaignRef,
  ): Promise<void> {
    const auth = acAuthFromConnection(connection);
    // v1 campaign_send action=send — fires the actual send (not test).
    // Subject to AC's 8-campaign trust gate on new accounts.
    const res = await acV1(auth, "campaign_send", {
      campaignid: ref.campaign_id,
      action: "send",
    });
    if (!res.ok) {
      throw new Error(`AC campaign_send rejected: ${res.raw.slice(0, 600)}`);
    }
  },

  async getCampaignStatus(
    connection: HlEmailConnection,
    ref: CampaignRef,
  ): Promise<CampaignStatus> {
    const auth = acAuthFromConnection(connection);
    const data = await acV3<{
      campaign?: { status?: string | number };
    }>(auth, "GET", `/campaigns/${encodeURIComponent(ref.campaign_id)}`);
    // AC numeric statuses:
    //   0 draft, 1 scheduled, 2 sending, 3 paused, 4 ?, 5 sent,
    //   6 disabled. Map to our enum.
    const raw = String(data.campaign?.status ?? "0");
    switch (raw) {
      case "0":
        return "draft";
      case "1":
        return "scheduled";
      case "2":
        return "sending";
      case "3":
        return "paused";
      case "5":
        return "sent";
      case "6":
        return "failed";
      default:
        return "draft";
    }
  },

  // ---- Webhooks ----

  /** AC doesn't sign payloads — we use a URL-secret pattern (same as
   *  Mailchimp). The receiver pulls ?secret=... off the URL and passes
   *  it via the x-ac-secret synthetic header. */
  verifyWebhookSignature(
    _rawBody: string,
    headers: Headers,
    secret: string,
  ): boolean {
    if (!secret) return false;
    const provided = headers.get("x-ac-secret") ?? "";
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
      date_time?: string;
      contact?: { email?: string };
      campaign?: { id?: string };
      list?: { id?: string };
      bounce?: { code?: string; reason?: string };
      reason?: string;
    };
    if (!p.type) return null;

    const email = p.contact?.email;
    const campaignId = p.campaign?.id ?? "";
    const occurred_at = parseAcDate(p.date_time);

    switch (p.type) {
      case "sent":
        if (!campaignId) return null;
        return {
          type: "sent",
          provider_message_id: campaignId,
          recipient_email: email,
          occurred_at,
          raw: payload,
        };
      case "open":
        if (!campaignId || !email) return null;
        return {
          type: "opened",
          provider_message_id: campaignId,
          recipient_email: email,
          occurred_at,
          raw: payload,
        };
      case "click":
        if (!campaignId || !email) return null;
        return {
          type: "clicked",
          provider_message_id: campaignId,
          recipient_email: email,
          occurred_at,
          raw: payload,
        };
      case "unsubscribe":
        if (!email) return null;
        return {
          type: "unsubscribed",
          provider_message_id: campaignId,
          recipient_email: email,
          occurred_at,
          reason: p.reason,
          raw: payload,
        };
      case "bounce":
        if (!email) return null;
        return {
          type: "bounced",
          provider_message_id: campaignId,
          recipient_email: email,
          occurred_at,
          // AC doesn't always distinguish hard vs soft in the webhook
          // payload — when ambiguous we treat as hard since bounce
          // events trip the suppression list either way.
          bounce_type: "hard",
          reason: p.bounce?.reason ?? p.bounce?.code,
          raw: payload,
        };
      default:
        // subscribe / forward / share / update — not actionable for us.
        return null;
    }
  },
};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function acMembershipToContactStatus(
  status: string | undefined,
): ContactStatus {
  // AC contactList status codes: 1 active, 2 unsubscribed, 3 unconfirmed
  // (double-opt-in pending), 0 inactive/bounced.
  switch (String(status ?? "")) {
    case "1":
      return { state: "subscribed" };
    case "2":
      return { state: "unsubscribed" };
    case "3":
      return { state: "pending" };
    case "0":
      return { state: "cleaned" };
    default:
      return { state: "not_found" };
  }
}

/** Find an AC tag by name or create it. Returns the numeric tag id
 *  (as a string) that POST /contactTags requires. */
async function resolveOrCreateTag(
  auth: ReturnType<typeof acAuthFromConnection>,
  name: string,
): Promise<string> {
  // GET /tags?search=<name> returns matches by name.
  const search = await acV3<{
    tags?: Array<{ id: string; tag: string }>;
  }>(auth, "GET", `/tags?search=${encodeURIComponent(name)}`);
  const existing = search.tags?.find((t) => t.tag === name);
  if (existing) return existing.id;

  const created = await acV3<{ tag?: { id: string } }>(
    auth,
    "POST",
    "/tags",
    {
      tag: {
        tag: name,
        // tagType=contact tags apply to contacts; the other type
        // (template) is for email-template tagging.
        tagType: "contact",
        description: `Hyperlocal run tag — auto-created`,
      },
    },
  );
  const id = created.tag?.id;
  if (!id) throw new Error("AC tag create didn't return an id");
  return id;
}

function parseAcDate(s: string | undefined): Date {
  if (!s) return new Date();
  // AC sends "YYYY-MM-DD HH:MM:SS" in account-local time. We treat as
  // UTC for stamping; the absolute moment we record may drift by the
  // account's timezone offset — acceptable for event timestamps.
  const iso = s.replace(" ", "T") + "Z";
  const t = Date.parse(iso);
  return Number.isFinite(t) ? new Date(t) : new Date();
}
