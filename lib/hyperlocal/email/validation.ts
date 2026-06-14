import "server-only";

import { resolveMx } from "node:dns/promises";

// ============================================================
// In-house Layer 1 email validation. Free.
//
// Three checks, in order:
//   1) Syntax — RFC-shaped (single @, no whitespace, has a dot in
//      the domain part).
//   2) Common-domain typo correction — Levenshtein-1 against a
//      small list of popular consumer mailbox domains, so
//      "gmial.com" / "verzion.net" get flagged with a suggested
//      correction the agent can fix in their CRM.
//   3) MX record check — domain must publish at least one MX RR
//      via DNS. Dead domains and parking pages fail here.
//
// Spamtraps, full mailboxes, and silent black-holes are NOT
// caught — those flow through to Resend, hard-bounce once, and
// get suppressed by the webhook ingester + kill switch. This is
// the deliberate tradeoff: free, no SaaS dependency, catches the
// 30–40% of bad addresses that account for almost all avoidable
// embarrassment (typos, dead domains). Paid validation (ZB / NB)
// can be slotted in later as a per-profile opt-in upsell.
// ============================================================

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const MX_DOMAIN_CONCURRENCY = 20;

const COMMON_DOMAINS = [
  "gmail.com",
  "yahoo.com",
  "hotmail.com",
  "outlook.com",
  "icloud.com",
  "aol.com",
  "live.com",
  "msn.com",
  "comcast.net",
  "att.net",
  "verizon.net",
  "me.com",
  "sbcglobal.net",
  "bellsouth.net",
  "cox.net",
  "ymail.com",
] as const;

export type ValidationStatus = "valid" | "invalid" | "unknown";

export type ValidationReason =
  | "bad_syntax"
  | "no_mx"
  | "typo_suspect"
  | "ok"
  | "dns_error";

export interface ValidationResult {
  email: string;
  status: ValidationStatus;
  reason: ValidationReason;
  /** Suggested correction when `reason === "typo_suspect"`. */
  suggested?: string;
}

/**
 * Validate a batch of emails. Pure function — no DB, no network
 * caching beyond the OS-level DNS resolver. Deduplicates emails
 * and unique domains internally so a 25k-contact list costs ~50
 * DNS lookups, not 25k.
 */
export async function validateEmails(
  emails: string[]
): Promise<ValidationResult[]> {
  const normalized = Array.from(
    new Set(emails.map((e) => e.trim().toLowerCase()).filter(Boolean))
  );
  if (normalized.length === 0) return [];

  // ---- Phase 1: syntax + typo flag, dedupe domains ----
  const syntaxFails = new Map<string, ValidationResult>();
  const typoSuggestion = new Map<string, string>();
  const emailsByDomain = new Map<string, string[]>();

  for (const email of normalized) {
    if (!EMAIL_RE.test(email)) {
      syntaxFails.set(email, {
        email,
        status: "invalid",
        reason: "bad_syntax",
      });
      continue;
    }
    const domain = email.slice(email.indexOf("@") + 1);
    const suggestion = suggestCorrection(domain);
    if (suggestion) typoSuggestion.set(email, suggestion);
    const bucket = emailsByDomain.get(domain);
    if (bucket) bucket.push(email);
    else emailsByDomain.set(domain, [email]);
  }

  // ---- Phase 2: bulk MX lookup, one query per unique domain ----
  const domains = Array.from(emailsByDomain.keys());
  const mxByDomain = new Map<string, boolean | null>();
  for (let i = 0; i < domains.length; i += MX_DOMAIN_CONCURRENCY) {
    const chunk = domains.slice(i, i + MX_DOMAIN_CONCURRENCY);
    const results = await Promise.all(chunk.map(hasMxRecord));
    chunk.forEach((d, idx) => mxByDomain.set(d, results[idx]));
  }

  // ---- Phase 3: combine ----
  return normalized.map((email): ValidationResult => {
    const syntaxFail = syntaxFails.get(email);
    if (syntaxFail) return syntaxFail;

    const domain = email.slice(email.indexOf("@") + 1);
    const mxOk = mxByDomain.get(domain);
    const suggestion = typoSuggestion.get(email);

    if (mxOk === false) {
      return suggestion
        ? { email, status: "invalid", reason: "typo_suspect", suggested: suggestion }
        : { email, status: "invalid", reason: "no_mx" };
    }
    if (mxOk === null) {
      // DNS resolver errored — fail open as unknown so we still send.
      return { email, status: "unknown", reason: "dns_error" };
    }
    if (suggestion) {
      // MX exists at the wrong-looking domain (e.g. someone really does own
      // gmial.com). We still flag the suggestion so the UI can prompt the
      // agent to double-check, but the address itself is deliverable.
      return {
        email,
        status: "valid",
        reason: "typo_suspect",
        suggested: suggestion,
      };
    }
    return { email, status: "valid", reason: "ok" };
  });
}

/**
 * Filter a contact list down to the deliverable subset.
 *
 * Drops contacts whose email status is `"invalid"`. Keeps `"valid"` and
 * `"unknown"` (DNS errors fail open — we'd rather risk a bounce than skip a
 * real contact because the resolver hiccuped). Typo-suspect emails with a
 * valid MX are kept but marked with the suggested correction.
 */
export async function filterDeliverable<T extends { email: string }>(
  contacts: T[]
): Promise<{
  deliverable: T[];
  removed: Array<{ contact: T; reason: ValidationReason; suggested?: string }>;
}> {
  const nonEmpty = contacts.filter(
    (c) => typeof c.email === "string" && c.email.trim()
  );
  if (nonEmpty.length === 0) return { deliverable: [], removed: [] };

  const results = await validateEmails(nonEmpty.map((c) => c.email));
  const byEmail = new Map(results.map((r) => [r.email, r]));

  const deliverable: T[] = [];
  const removed: Array<{
    contact: T;
    reason: ValidationReason;
    suggested?: string;
  }> = [];

  for (const c of nonEmpty) {
    const r = byEmail.get(c.email.trim().toLowerCase());
    if (!r || r.status !== "invalid") {
      deliverable.push(c);
    } else {
      removed.push({ contact: c, reason: r.reason, suggested: r.suggested });
    }
  }

  return { deliverable, removed };
}

// ---------------------------------------------------------------------------
// Internal
// ---------------------------------------------------------------------------

async function hasMxRecord(domain: string): Promise<boolean | null> {
  try {
    const records = await resolveMx(domain);
    return records.length > 0;
  } catch (err) {
    const code = (err as NodeJS.ErrnoException | undefined)?.code;
    // Domain has no MX record OR doesn't exist — both are undeliverable.
    if (code === "ENODATA" || code === "ENOTFOUND" || code === "NXDOMAIN") {
      return false;
    }
    // Transient DNS failure (timeout, SERVFAIL, etc.) — fail open as null.
    return null;
  }
}

/** Suggest a common-domain correction for a likely typo. */
function suggestCorrection(domain: string): string | undefined {
  if ((COMMON_DOMAINS as readonly string[]).includes(domain)) return undefined;
  for (const candidate of COMMON_DOMAINS) {
    if (Math.abs(candidate.length - domain.length) > 2) continue;
    if (editDistance(domain, candidate) <= 1) return candidate;
  }
  return undefined;
}

/** Levenshtein edit distance — O(m*n) DP, only used on short strings (<32). */
function editDistance(a: string, b: string): number {
  if (a === b) return 0;
  if (!a.length) return b.length;
  if (!b.length) return a.length;
  const prev = new Array(b.length + 1);
  const curr = new Array(b.length + 1);
  for (let j = 0; j <= b.length; j++) prev[j] = j;
  for (let i = 1; i <= a.length; i++) {
    curr[0] = i;
    for (let j = 1; j <= b.length; j++) {
      const cost = a.charCodeAt(i - 1) === b.charCodeAt(j - 1) ? 0 : 1;
      curr[j] = Math.min(
        curr[j - 1] + 1,
        prev[j] + 1,
        prev[j - 1] + cost
      );
    }
    for (let j = 0; j <= b.length; j++) prev[j] = curr[j];
  }
  return prev[b.length];
}
