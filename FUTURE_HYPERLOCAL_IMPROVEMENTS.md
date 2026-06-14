# Future Hyperlocal Improvements

Reference doc for features that aren't on the current pack ladder
(`lib/hyperlocal-packs.ts`) but are scoped, sized, and ready to ship
when we want them. Each section has the build-time estimate, the
implementation sketch, the agent-facing value, and a suggested
pack/tier gate if relevant.

The 4-meter pack ladder (Campaigns / Segments / MLS History /
AI Chat Edits) handles volume upgrades. Everything in this doc is
either an AI-behavior addition (writes differently / scores better)
or a workflow addition (runs itself / replies for you / pushes
elsewhere). They could ship as Pro-included features later, as
add-on packs, or as gates on the higher meter tiers.

---

## 1. Subject-line A/B testing

**Build time**: ~1 day
**Value**: directly measurable open-rate improvement
**Suggested gate**: Pro-included after shipping, or Silver+

### How it works
AI generates 2 subject variants for the same body. Recipient list
splits into three groups: 10% gets variant A, 10% gets variant B,
80% waits. After 2 hours the system checks open rates from the ESP
webhook stream, picks the winner, ships the remaining 80% with the
winning subject.

### Implementation
- Pre-send: extra Claude Haiku call to generate variants (negligible cost)
- DB: extend `hl_recipients` with `subject_variant_id` column
- Scheduling: Inngest fires the "select winner + send rest" step after 2 hours
- Math: higher open-rate wins; optional min-sample threshold to avoid
  picking from 2-3 opens
- All infra exists today (webhook event stream + Inngest scheduling)

### Where it slots in the UI
A toggle on the run launcher: *"A/B test subject lines (adds ~2hr to send time)"*.
The dashboard would show variant comparison after each campaign.

---

## 2. Send-time optimization

**Build time**: ~3 days
**Value**: real for high-volume senders, hard to prove for small spheres
**Suggested gate**: Silver+ (only meaningful past a certain recipient count)

### How it works
Instead of sending all recipients at once, predict each recipient's
best open window and stagger sends per-individual to that window.

### Implementation
- **New recipients** (no history): default to 10am in their timezone.
  Enrich contacts at discovery with TZ via IP geoloc OR ZIP→state→default.
- **Recipients with history**: take mode of opened-at hour from their last
  N opens. Simple is good — the fancy ML version isn't worth it at our
  recipient counts.
- DB: extend `hl_recipients` with `preferred_send_hour` int (0-23) computed
  from past `hl_email_events` of type `opened`.
- Scheduling: instead of one bulk send, queue N individual sends bucketed
  by hour. All 4 ESPs we support (Resend, SendGrid, Mailchimp, AC) accept
  `send_at` per recipient.

### Honest caveat
A 200-contact agent won't see statistical improvement; a 5,000-contact
agent will. Pitch it accordingly.

---

## 3. Recipient lead scoring

**Build time**: ~2 days for V1, +1 day for V2
**Value**: immediate dashboard surface; "who in your sphere is warming up?"
**Suggested gate**: Pro-included after shipping

### V1 — pure SQL, no AI
A materialized view over `hl_email_events` per recipient:

```
score = (recent_opens × 3 + recent_clicks × 5 + replies × 10)
        × recency_decay(last_engagement_at)
```

Where `recency_decay` is 1.0 for last 7 days, 0.7 for last 30, 0.3 for
last 90, 0.1 older. Refresh nightly via cron.

### V2 — AI intent classification on replies
Same formula but with Claude Haiku scoring reply text:
- *"Thanks, looking forward to it"* → 0.5x weight
- *"Can you send me listings in X?"* → 3x weight

Adds ~$0.001 per reply scored. Cheap.

### Where it slots in the UI
New "Hot contacts" panel on the Hyperlocal dashboard. Sortable column in
the contacts view. Optional CSV export so the agent can call the top 10
each week.

---

## 4. Per-recipient personalization

**Build time**: ~3 days for Flavor B
**Value**: biggest deliverability + engagement lever in the stack
**Suggested gate**: Gold+ (real AI cost multiplier)

### Three flavors, increasing cost + value

**Flavor A — Merge tags (cheapest)**
- ESP-native `*|FNAME|*` + custom field merge
- No extra AI calls; we pre-compute the variables
- Already feasible today

**Flavor B — AI-personalized greeting + closing (recommended)**
- Body stays identical per segment
- Claude writes a 2-sentence opener + closing personalized per recipient
- ~2 AI calls per recipient vs 1 per segment
- 50× cost increase, bounded and predictable

**Flavor C — Fully personalized body (premium)**
- Full AI generation per recipient
- 200× cost increase
- Only justified for high-LTV agents (Diamond tier)

### Implementation (Flavor B)
- Pre-render: generate the shared segment body as today
- Per-recipient render pass: Claude generates opener + closer using
  recipient data (first name, home value range, tags, search history)
- Template assembly: `{opener}\n\n{shared_body}\n\n{closer}`
- ESP handles substitution via per-recipient HTML send (all 4 ESPs support)

---

## 5. Custom AI voice tuning

**Build time**: ~1 day
**Value**: big "wow" moment; cheap to ship
**Suggested gate**: Pro-included after shipping

### How it works
Agent uploads 5-10 of their own past emails. System extracts their voice
and includes 2-3 random samples in every generation's system prompt as
few-shot examples.

### Implementation
- DB: new `platform_profile_voice_samples` table — `(profile_id, sample_text, created_at)`
- UI: simple upload textarea in the Profile editor
- Backend: when generating, pick 2-3 random samples and prepend to the
  prompt as *"Match this writing style:"* examples
- No fine-tuning needed — Claude follows few-shot examples remarkably well

---

## 6. Auto-recurring schedules

**Build time**: ~2 days
**Value**: "set and forget" — top-producer time savings
**Suggested gate**: Gold+

### How it works
Agent configures a campaign to fire on a schedule (first Monday of every
month, every Tuesday at 9am, etc.). System auto-creates a new run on the
trigger using the last run's config as template.

### Implementation
- DB: new `hl_campaign_schedules` table with cron-like trigger spec
- Inngest scheduled function checks every hour, fires runs that match
- New run inherits campaign config + most recent service area + MLS
  snapshot reuse (uses the snapshot infra we already built)
- Notification email when a new auto-run completes ("Your scheduled
  Brentwood Sellers campaign ran — review at /apps/hyperlocal/runs/...")

---

## 7. Landing page per campaign

**Build time**: ~5 days
**Value**: deeper engagement; recipient clicks land somewhere richer
**Suggested gate**: Gold+

### How it works
AI generates a static HTML hyperlocal-content page alongside each
campaign. Recipient clicks in the email land there instead of just
opening reply. Page hosts the same content as the email PLUS
interactive elements:
- Interactive market trends chart
- ZIP-level breakdown table
- "Get a custom CMA" form (lead capture)
- Listing alerts signup

### Implementation
- New Next.js dynamic route: `/r/[runId]/[segmentSlug]` serves the page
- AI generation step (in `hl-generate.ts`) writes page content alongside
  the email HTML
- Same brand/colors/fonts via the existing `renderEmailHtml` infra,
  adapted for landing-page width
- UTM tracking baked into the email-to-page CTAs
- Page is public (no auth) but ratelimited by IP

---

## 8. Reply-handling AI assistant

**Build time**: ~5 days
**Value**: hours/week back; biggest agent time-sink we'd address
**Suggested gate**: Gold+

### How it works
When a recipient replies to a Hyperlocal-sent email, AI drafts a
personalized response. Agent reviews + sends.

### Implementation
- Reply detection: ESP webhooks include reply notifications (Mailchimp,
  Resend, etc.). For replies that go to the agent's inbox directly,
  optional IMAP polling or Gmail/Outlook OAuth integration.
- Webhook ingester captures reply, stores in new `hl_replies` table
  with `(recipient_id, email_id, reply_text, sentiment, ai_draft, status)`
- AI draft step: Claude reads the reply + the original email + the
  recipient's tags/history, drafts a response in the agent's voice
- UI: new "Replies" inbox in Hyperlocal dashboard. Per-reply: original
  message, AI draft, edit + send buttons.
- Send path: through the same connected ESP

---

## 9. Multi-MLS aggregation

**Build time**: ~3 days
**Value**: agents covering 2-3 MLSs (cross-state, cross-region)
**Suggested gate**: Gold+

### How it works
Pull from multiple MLS systems in one run. AI weights each market in
the generated copy ("In Williamson County, prices held flat while
neighboring Davidson saw a 4% bump…").

### Implementation
- Allow uploading multiple MLS files per segment (we already support
  multi-upload — see the batch flow shipped today)
- MLS source attribution: store which file each row came from
- Generation prompt enrichment: include per-MLS breakdown in the
  context Claude sees
- Probably needs ZIP-to-MLS mapping config per agent (which ZIPs are
  Williamson MLS vs Davidson MLS vs ARMLS, etc.)

---

## 10. Direct mail companion

**Build time**: ~7 days
**Value**: brokerage-grade omnichannel; Diamond differentiator
**Suggested gate**: Diamond

### How it works
AI also produces a printable postcard from each campaign. Agent
decides per-send whether to mail-drop via Lob.com integration. Same
hyperlocal content, both digital + physical.

### Implementation
- Lob.com API integration (postcard creation + send)
- New step in generate pipeline: produce postcard HTML (4×6, print-safe
  with bleed/margin) using a postcard-flavored variant of
  `renderEmailHtml`
- Mailing-list dedup: cross-reference recipient addresses to avoid
  sending postcard AND email to the same person if not desired
- UI: per-campaign toggle "Also send as postcard" with cost preview
  (Lob charges ~$0.75/postcard)
- Recipient-address requirement: many email lists don't have postal
  addresses. Could enrich via reverse-lookup (BatchData, ATTOM, etc.)
  as a separate paid add-on.

---

## 11. AI ghostwriter for tough replies (broker-level)

**Build time**: ~2 days (builds on #8)
**Value**: broker insulates agent from sensitive replies
**Suggested gate**: Diamond

### How it works
Broker can have AI draft responses to complaints, objections, or
sensitive replies on behalf of an agent. Agent sees the draft, can
edit/send/escalate to broker.

### Implementation
- Reply classification: sentiment + complexity scoring on incoming
  replies (uses #8 infra)
- "Tough" replies (complaints, legal, fair-housing concerns) get an
  extra-careful AI draft with broker tone + legal-safe phrasing
- Broker dashboard view: see all "tough" replies across all team
  agents
- Optional escalation path: broker can take over a thread directly

---

## 12. Reverse contact enrichment

**Build time**: ~3 days
**Value**: agent uploads emails-only list, system enriches with home
addresses + ZIPs needed for proper Hyperlocal segmentation
**Suggested gate**: Diamond or separate add-on

### How it works
For agents whose CRM only stores emails (no postal addresses), pipe
through BatchData / ATTOM / PropMix to look up home addresses. Needed
upstream of Hyperlocal because segmentation depends on ZIP.

### Implementation
- New "Enrich contacts" step at discover phase
- Per-contact lookup against a property data provider
- Storage in `hl_recipients.enriched_address` (separate from
  CRM-sourced address to preserve source-of-truth)
- Per-lookup cost (~$0.10-0.25), pass-through to agent OR bundled into
  Diamond seat fee

---

## 13. Run-completion celebration v2

**Build time**: ~2 days
**Value**: smaller polish, but engagement-loop closer
**Suggested gate**: Pro-included

### What's missing today
The `RunCompleteSummary` panel (shipped already) shows totals but
doesn't lead anywhere actionable. Add:
- **Best-performing segment callout**: "Brentwood opened at 47%, your
  best ever for that area"
- **Recipient highlights**: top 3 most-engaged recipients to call/email
  personally
- **Auto-suggest next run**: "Try shipping a Williamson County campaign
  next week — your contacts there haven't heard from you in 32 days"

---

## Cross-cutting: discoverability of all of these

When any of these features ship as pack-gated, the upsell pattern is:
1. User clicks the feature button/toggle in the run launcher
2. Pack-gate modal: "**Per-recipient personalization is a Gold pack
   feature.** Here's what it does + here's the open-rate lift it
   typically produces. Upgrade for $X/mo." with a one-click upgrade CTA
3. No prices on the dashboard; pricing surfaces contextually where the
   user is *already* convinced they want the feature.

The 4-meter ladder (Campaigns / Segments / MLS / Edits) keeps doing
its job in parallel — that handles raw volume. These features handle
sophistication.
