import "server-only";

import { promises as dns } from "node:dns";
import { generateText } from "ai";
import { getProfileMagicModel, getProfileVisionModel } from "@/lib/openrouter";
import { getMagicExtractionPrompt } from "@/lib/profiles/magic-onboarding-prompt";

// ============================================================
// AI Magic onboarding — deep website → profile analysis.
//
// Given a user's website URL, render + crawl a few key pages, pull
// out brand signals (logo, headshot, colors) heuristically, then hand
// the whole bundle to a strong model that returns a structured profile
// draft. The caller surfaces that draft for one-tap verification.
//
// Everything here runs server-side only — it fetches user-supplied
// URLs, so the SSRF guard below is load-bearing, not optional.
// ============================================================

export interface MagicProfileDraft {
  // Identity (Bio tab)
  full_name: string;
  title: string | null;
  professional_type: string;
  brokerage: string;
  bio: string | null;
  // Market (Market tab)
  country: string | null;
  state: string;
  metro_area: string;
  counties: string[];
  neighborhoods: string[];
  // Business focus (Market tab)
  specializations: string[];
  target_clients: string[];
  property_types: string[];
  // Contact / CAN-SPAM (Bio tab)
  phone: string | null;
  reply_to_email: string | null;
  physical_address: string | null;
  sign_off: string | null;
  // Compliance (Bio tab)
  license_number: string | null;
  license_info: string | null;
  regulatory_body: string | null;
  compliance_notes: string | null;
  legal_disclaimer: string | null;
  // Web + SEO (Bio tab)
  website_url: string | null;
  blog_url: string | null;
  seo_keywords: string[];
  // Brand (Brand tab)
  primary_color: string | null;
  secondary_color: string | null;
  accent_color: string | null;
  heading_font: string | null;
  body_font: string | null;
  logo_url: string | null;
  headshot_url: string | null;
  brokerage_badge_url: string | null;
}

/**
 * Fields a profile really needs for the apps to work that the site often
 * doesn't expose — if missing after analysis we ask the user for them.
 * physical_address + reply_to_email are CAN-SPAM essentials for sending.
 */
export const CRITICAL_FIELDS = [
  { key: "physical_address", label: "office mailing address" },
  { key: "reply_to_email", label: "reply-to email" },
] as const;

export function missingCriticalFields(draft: MagicProfileDraft): string[] {
  return CRITICAL_FIELDS.filter((f) => !draft[f.key as keyof MagicProfileDraft]).map(
    (f) => f.label,
  );
}

export interface WebsiteAnalysisResult {
  draft: MagicProfileDraft;
  /** Short, human "here's what I found" lines for the magical reveal. */
  found: string[];
  /** Fields the model was unsure about — nudge the user to double-check. */
  lowConfidence: string[];
  /** Pages we actually read, for transparency. */
  pagesRead: string[];
}

const MAX_PAGES = 4; // homepage + up to 3 internal pages
const MAX_TEXT_PER_PAGE = 6_000;
const MAX_TOTAL_TEXT = 16_000;
const FETCH_TIMEOUT_MS = 15_000;
const INTERNAL_LINK_RE = /(about|team|contact|agent|bio|meet|who-we-are|our-story)/i;

// ---------------------------------------------------------------------------
// URL validation + SSRF guard
// ---------------------------------------------------------------------------

export class WebsiteAnalysisError extends Error {}

/** Normalize loose user input ("acme.com") into a validated https URL. */
export function normalizeUrl(input: string): URL {
  const trimmed = (input ?? "").trim();
  if (!trimmed) throw new WebsiteAnalysisError("Please enter your website address.");
  const withScheme = /^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`;
  let url: URL;
  try {
    url = new URL(withScheme);
  } catch {
    throw new WebsiteAnalysisError("That doesn't look like a valid website address.");
  }
  if (url.protocol !== "http:" && url.protocol !== "https:") {
    throw new WebsiteAnalysisError("Only http and https addresses are supported.");
  }
  return url;
}

function isPrivateIpv4(ip: string): boolean {
  const parts = ip.split(".").map(Number);
  if (parts.length !== 4 || parts.some((n) => Number.isNaN(n) || n < 0 || n > 255)) {
    return true; // malformed → treat as unsafe
  }
  const [a, b] = parts;
  return (
    a === 0 ||
    a === 10 ||
    a === 127 ||
    (a === 169 && b === 254) || // link-local + cloud metadata (169.254.169.254)
    (a === 172 && b >= 16 && b <= 31) ||
    (a === 192 && b === 168) ||
    a >= 224 // multicast / reserved
  );
}

function isPrivateIpv6(ip: string): boolean {
  const v = ip.toLowerCase();
  return (
    v === "::1" ||
    v === "::" ||
    v.startsWith("fc") ||
    v.startsWith("fd") || // unique local
    v.startsWith("fe80") || // link-local
    v.startsWith("::ffff:") // IPv4-mapped — re-check the v4 part upstream
  );
}

/** Resolve the host and reject anything pointing at private/internal space. */
async function assertPublicHost(url: URL): Promise<void> {
  const host = url.hostname.toLowerCase();
  if (
    host === "localhost" ||
    host.endsWith(".localhost") ||
    host.endsWith(".local") ||
    host.endsWith(".internal")
  ) {
    throw new WebsiteAnalysisError("That address isn't publicly reachable.");
  }
  let addresses: { address: string; family: number }[];
  try {
    addresses = await dns.lookup(host, { all: true });
  } catch {
    throw new WebsiteAnalysisError("We couldn't find that website. Double-check the address?");
  }
  for (const { address, family } of addresses) {
    const unsafe =
      family === 4 ? isPrivateIpv4(address) : isPrivateIpv6(address);
    if (unsafe) {
      throw new WebsiteAnalysisError("That address isn't publicly reachable.");
    }
  }
}

// ---------------------------------------------------------------------------
// Page fetching — Browserless (renders JS) with a plain-fetch fallback
// ---------------------------------------------------------------------------

async function fetchViaBrowserless(target: string): Promise<string | null> {
  const token = process.env.BROWSERLESS_API_KEY;
  if (!token) return null;
  const base = (process.env.BROWSERLESS_URL ?? "https://chrome.browserless.io").replace(/\/+$/, "");
  try {
    const res = await fetch(`${base}/content?token=${encodeURIComponent(token)}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        url: target,
        gotoOptions: { waitUntil: "networkidle2", timeout: FETCH_TIMEOUT_MS },
      }),
      signal: AbortSignal.timeout(FETCH_TIMEOUT_MS + 2_000),
    });
    if (!res.ok) return null;
    return await res.text();
  } catch {
    return null;
  }
}

async function fetchViaPlain(target: string): Promise<string | null> {
  try {
    const res = await fetch(target, {
      redirect: "follow",
      headers: {
        // Some sites 403 a missing UA; present a normal browser string.
        "User-Agent":
          "Mozilla/5.0 (compatible; AiMProfileBot/1.0; +https://aimarketingacademy.com)",
        Accept: "text/html,application/xhtml+xml",
      },
      signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
    });
    if (!res.ok) return null;
    const ct = res.headers.get("content-type") ?? "";
    if (!ct.includes("html")) return null;
    return await res.text();
  } catch {
    return null;
  }
}

/** Browserless first (handles JS-heavy realtor sites), plain fetch as fallback. */
async function fetchPageHtml(target: string): Promise<string | null> {
  return (await fetchViaBrowserless(target)) ?? (await fetchViaPlain(target));
}

// ---------------------------------------------------------------------------
// HTML parsing — text + brand signals (no DOM library; regex is enough here)
// ---------------------------------------------------------------------------

function htmlToText(html: string): string {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<noscript[\s\S]*?<\/noscript>/gi, " ")
    .replace(/<!--[\s\S]*?-->/g, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&#39;|&apos;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/&[a-z]+;/gi, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, MAX_TEXT_PER_PAGE);
}

function absolutize(href: string, base: URL): string | null {
  try {
    return new URL(href, base).toString();
  } catch {
    return null;
  }
}

function attr(tag: string, name: string): string | null {
  const m = tag.match(new RegExp(`${name}\\s*=\\s*["']([^"']+)["']`, "i"));
  return m ? m[1] : null;
}

interface BrandSignals {
  logoCandidates: string[];
  headshotCandidates: string[];
  colorCandidates: string[];
  metaDescription: string | null;
}

function extractBrandSignals(html: string, base: URL): BrandSignals {
  const logos = new Set<string>();
  const headshots = new Set<string>();
  const colors: Record<string, number> = {};

  // theme-color + og:image + apple-touch-icon
  for (const tag of html.match(/<(meta|link)[^>]+>/gi) ?? []) {
    const prop = (attr(tag, "property") ?? attr(tag, "name") ?? attr(tag, "rel") ?? "").toLowerCase();
    const content = attr(tag, "content") ?? attr(tag, "href");
    if (!content) continue;
    if (prop === "theme-color") {
      const hex = content.match(/#[0-9a-f]{6}/i)?.[0];
      if (hex) colors[hex.toLowerCase()] = (colors[hex.toLowerCase()] ?? 0) + 5;
    }
    if (prop === "og:image" || prop.includes("apple-touch-icon") || prop === "icon") {
      const u = absolutize(content, base);
      if (u) logos.add(u);
    }
  }

  // <img> tags — bucket by alt/class/src keywords
  for (const tag of html.match(/<img[^>]+>/gi) ?? []) {
    const src = attr(tag, "src") ?? attr(tag, "data-src");
    if (!src) continue;
    const u = absolutize(src, base);
    if (!u) continue;
    const hint = `${attr(tag, "alt") ?? ""} ${attr(tag, "class") ?? ""} ${src}`.toLowerCase();
    if (/logo|brand/.test(hint)) logos.add(u);
    if (/headshot|portrait|profile|agent|team|realtor|photo|avatar/.test(hint)) headshots.add(u);
  }

  // Hex colors anywhere in markup/inline CSS — tally, drop neutrals.
  for (const hex of html.match(/#[0-9a-f]{6}/gi) ?? []) {
    const h = hex.toLowerCase();
    if (isNeutral(h)) continue;
    colors[h] = (colors[h] ?? 0) + 1;
  }

  const colorCandidates = Object.entries(colors)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 8)
    .map(([hex]) => hex);

  const metaDescription =
    html.match(/<meta[^>]+name=["']description["'][^>]+content=["']([^"']+)["']/i)?.[1] ?? null;

  return {
    logoCandidates: [...logos].slice(0, 10),
    headshotCandidates: [...headshots].slice(0, 12),
    colorCandidates,
    metaDescription,
  };
}

function isNeutral(hex: string): boolean {
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const nearWhite = min > 235;
  const nearBlack = max < 25;
  const gray = max - min < 16;
  return nearWhite || nearBlack || gray;
}

function discoverInternalLinks(html: string, base: URL): string[] {
  const out: string[] = [];
  const seen = new Set<string>();
  for (const tag of html.match(/<a[^>]+href=["'][^"']+["'][^>]*>/gi) ?? []) {
    const href = attr(tag, "href");
    if (!href || href.startsWith("#") || href.startsWith("mailto:") || href.startsWith("tel:")) {
      continue;
    }
    if (!INTERNAL_LINK_RE.test(href)) continue;
    const u = absolutize(href, base);
    if (!u) continue;
    const parsed = new URL(u);
    if (parsed.hostname !== base.hostname) continue; // same-origin only
    const key = parsed.origin + parsed.pathname;
    if (seen.has(key) || key === base.origin + base.pathname) continue;
    seen.add(key);
    out.push(u);
    if (out.length >= MAX_PAGES - 1) break;
  }
  return out;
}

// ---------------------------------------------------------------------------
// Orchestration
// ---------------------------------------------------------------------------

/** Real-progress callback — wired to Trigger.dev run metadata so the client
 *  can stream genuine milestones instead of a faked bar. */
export type ProgressFn = (p: { step: string; progress: number }) => void | Promise<void>;

export async function analyzeWebsite(
  input: string,
  onProgress?: ProgressFn,
): Promise<WebsiteAnalysisResult> {
  const emit = async (step: string, progress: number) => {
    try {
      await onProgress?.({ step, progress });
    } catch {
      /* progress reporting is best-effort */
    }
  };

  const url = normalizeUrl(input);
  await assertPublicHost(url);
  await emit("Opening your website…", 10);

  const homeHtml = await fetchPageHtml(url.toString());
  if (!homeHtml) {
    throw new WebsiteAnalysisError(
      "We couldn't reach that site. Check the address, or switch to Control Freak Mode and we'll do it together.",
    );
  }
  await emit("Reading your homepage…", 24);

  const pagesRead = [url.toString()];
  const texts = [htmlToText(homeHtml)];
  const signals = extractBrandSignals(homeHtml, url);

  // Crawl a few key internal pages (about/team/contact) for richer context.
  // Fetch them CONCURRENTLY so total wall-clock stays near one fetch timeout
  // (sequential could stack to N×timeout and blow the function budget).
  const links = discoverInternalLinks(homeHtml, url);
  const crawled = await Promise.all(
    links.map(async (link) => {
      const html = await fetchPageHtml(link);
      return html ? { link, html } : null;
    }),
  );
  for (const page of crawled) {
    if (!page) continue;
    pagesRead.push(page.link);
    texts.push(htmlToText(page.html));
    const more = extractBrandSignals(page.html, new URL(page.link));
    signals.logoCandidates.push(...more.logoCandidates);
    signals.headshotCandidates.push(...more.headshotCandidates);
    signals.colorCandidates.push(...more.colorCandidates);
  }
  await emit(
    pagesRead.length > 1
      ? `Studying ${pagesRead.length} pages of your site…`
      : "Studying your site…",
    40,
  );

  const combinedText = texts.join("\n\n--- next page ---\n\n").slice(0, MAX_TOTAL_TEXT);
  const dedupe = (arr: string[]) => [...new Set(arr)];

  // The long pole — honestly labeled, since the model really does spend
  // most of the wait here reading everything and writing the profile.
  await emit("Building your profile with AI…", 52);
  const draft = await extractProfile({
    siteUrl: url.toString(),
    text: combinedText,
    metaDescription: signals.metaDescription,
    logoCandidates: dedupe(signals.logoCandidates).slice(0, 10),
    headshotCandidates: dedupe(signals.headshotCandidates).slice(0, 12),
    colorCandidates: dedupe(signals.colorCandidates).slice(0, 8),
  });
  await emit("Reading your brand colors from your logo…", 84);

  // Brand colors straight from the logo (most reliable source). Only
  // overrides the CSS-scraped guesses when the vision pass is confident.
  const logoColors = await extractColorsFromLogo(draft.draft.logo_url);
  await emit("Polishing the final details…", 94);
  if (logoColors.primary) {
    draft.draft.primary_color = logoColors.primary;
    draft.draft.secondary_color = logoColors.secondary;
    draft.draft.accent_color = logoColors.accent;
  }

  return {
    draft: draft.draft,
    found: draft.found,
    lowConfidence: draft.lowConfidence,
    pagesRead,
  };
}

/**
 * Read the dominant brand colors directly off the logo image with a vision
 * model. Returns nulls on any failure (SVG/unreachable/non-image) so the
 * caller keeps its CSS-derived guess. Conservative by design — better to
 * return one solid color than three shaky ones.
 */
async function extractColorsFromLogo(
  logoUrl: string | null,
): Promise<{ primary: string | null; secondary: string | null; accent: string | null }> {
  const empty = { primary: null, secondary: null, accent: null };
  if (!logoUrl) return empty;
  // Vision models can't read SVGs reliably; skip them.
  if (/\.svg(\?|$)/i.test(logoUrl)) return empty;
  try {
    const { text } = await generateText({
      model: getProfileVisionModel(),
      temperature: 0,
      messages: [
        {
          role: "user",
          content: [
            {
              type: "text",
              text: `This is a real-estate professional's brand logo. Identify the BRAND colors actually used in the mark/wordmark — ignore the white/transparent background and pure black text. Return ONLY this JSON: {"primary":"#RRGGBB"|null,"secondary":"#RRGGBB"|null,"accent":"#RRGGBB"|null}. primary = the dominant brand color. Use null for any you're not confident about — do NOT pad with guesses.`,
            },
            { type: "image", image: new URL(logoUrl) },
          ],
        },
      ],
    });
    const parsed = parseJsonBlock(text);
    if (!parsed) return empty;
    return {
      primary: hex(parsed.primary),
      secondary: hex(parsed.secondary),
      accent: hex(parsed.accent),
    };
  } catch {
    return empty;
  }
}

interface ExtractionInput {
  siteUrl: string;
  text: string;
  metaDescription: string | null;
  logoCandidates: string[];
  headshotCandidates: string[];
  colorCandidates: string[];
}

const VALID_ROLES = new Set([
  "solo_agent",
  "team_leader",
  "team_agent",
  "broker_owner",
  "loan_officer",
  "title_executive",
]);

async function extractProfile(
  input: ExtractionInput,
): Promise<{ draft: MagicProfileDraft; found: string[]; lowConfidence: string[] }> {
  const userPayload = JSON.stringify(
    {
      site_url: input.siteUrl,
      meta_description: input.metaDescription,
      logo_candidates: input.logoCandidates,
      headshot_candidates: input.headshotCandidates,
      color_candidates: input.colorCandidates,
      page_text: input.text,
    },
    null,
    2,
  );

  const { text } = await generateText({
    model: getProfileMagicModel(),
    system: getMagicExtractionPrompt(),
    prompt: userPayload,
    temperature: 0.2,
  });

  const parsed = parseJsonBlock(text);
  const draft = coerceDraft(parsed, input.siteUrl);
  const found = buildFoundLines(draft);
  const lowConfidence = Array.isArray(parsed?.low_confidence)
    ? (parsed.low_confidence as unknown[]).filter((x): x is string => typeof x === "string")
    : [];
  return { draft, found, lowConfidence };
}

/** Pull the first balanced {...} JSON object out of a model response. */
function parseJsonBlock(text: string): Record<string, unknown> | null {
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/i)?.[1];
  const candidate = fenced ?? text;
  const start = candidate.indexOf("{");
  const end = candidate.lastIndexOf("}");
  if (start === -1 || end === -1 || end <= start) return null;
  try {
    return JSON.parse(candidate.slice(start, end + 1)) as Record<string, unknown>;
  } catch {
    return null;
  }
}

function str(v: unknown): string | null {
  if (typeof v !== "string") return null;
  const t = v.trim();
  return t && t.toLowerCase() !== "null" && t.toLowerCase() !== "unknown" ? t : null;
}

function hex(v: unknown): string | null {
  const s = str(v);
  if (!s) return null;
  const m = s.match(/#[0-9a-f]{6}/i);
  return m ? m[0].toLowerCase() : null;
}

function arr(v: unknown): string[] {
  if (Array.isArray(v)) {
    return v.map((x) => str(x)).filter((x): x is string => !!x);
  }
  // Tolerate a comma-separated string too.
  const s = str(v);
  return s ? s.split(",").map((x) => x.trim()).filter(Boolean) : [];
}

function coerceDraft(parsed: Record<string, unknown> | null, siteUrl: string): MagicProfileDraft {
  const p = parsed ?? {};
  const role = str(p.professional_type)?.toLowerCase() ?? "";
  return {
    full_name: str(p.full_name) ?? "",
    title: str(p.title),
    professional_type: VALID_ROLES.has(role) ? role : "solo_agent",
    brokerage: str(p.brokerage) ?? "",
    bio: str(p.bio),
    country: str(p.country) ?? "United States",
    state: (str(p.state) ?? "").toUpperCase().slice(0, 2),
    metro_area: str(p.metro_area) ?? "",
    counties: arr(p.counties),
    neighborhoods: arr(p.neighborhoods),
    specializations: arr(p.specializations),
    target_clients: arr(p.target_clients),
    property_types: arr(p.property_types),
    phone: str(p.phone),
    reply_to_email: str(p.reply_to_email),
    physical_address: str(p.physical_address),
    sign_off: str(p.sign_off),
    license_number: str(p.license_number),
    license_info: str(p.license_info),
    regulatory_body: str(p.regulatory_body),
    compliance_notes: str(p.compliance_notes),
    legal_disclaimer: str(p.legal_disclaimer),
    website_url: str(p.website_url) ?? siteUrl,
    blog_url: str(p.blog_url),
    seo_keywords: arr(p.seo_keywords),
    primary_color: hex(p.primary_color),
    secondary_color: hex(p.secondary_color),
    accent_color: hex(p.accent_color),
    heading_font: str(p.heading_font),
    body_font: str(p.body_font),
    logo_url: str(p.logo_url),
    headshot_url: str(p.headshot_url),
    brokerage_badge_url: str(p.brokerage_badge_url),
  };
}

/**
 * Apply a free-text correction to an existing draft ("I'm with eXp now,
 * make the primary color navy"). Returns the full updated draft so the
 * verification card just re-renders.
 */
export async function refineDraft(
  current: MagicProfileDraft,
  instruction: string,
): Promise<MagicProfileDraft> {
  const trimmed = (instruction ?? "").trim();
  if (!trimmed) return current;
  const { text } = await generateText({
    model: getProfileMagicModel(),
    system: `You are editing a real-estate professional's profile draft, and you may also be ANSWERING a question the user couldn't find on their site (e.g. providing their office mailing address or reply-to email). You receive the CURRENT draft as JSON plus a message from the user. Apply ONLY what they provide/ask, keep everything else identical, and return the COMPLETE updated profile as ONE JSON object with EXACTLY these keys: full_name, title, professional_type, brokerage, bio, country, state, metro_area, counties, neighborhoods, specializations, target_clients, property_types, phone, reply_to_email, physical_address, sign_off, license_number, license_info, regulatory_body, compliance_notes, legal_disclaimer, website_url, blog_url, seo_keywords, primary_color, secondary_color, accent_color, heading_font, body_font, logo_url, headshot_url, brokerage_badge_url. professional_type must be one of: solo_agent, team_leader, team_agent, broker_owner, loan_officer, title_executive. The *_color fields are #RRGGBB or null. counties, neighborhoods, specializations, target_clients, property_types, seo_keywords are arrays of strings. Everything else is a string or null. Output ONLY the JSON object, no prose.`,
    prompt: `CURRENT:\n${JSON.stringify(current, null, 2)}\n\nUSER MESSAGE:\n${trimmed}`,
    temperature: 0.1,
  });
  const parsed = parseJsonBlock(text);
  if (!parsed) return current;
  return coerceDraft(parsed, current.website_url ?? "");
}

function buildFoundLines(d: MagicProfileDraft): string[] {
  const lines: string[] = [];
  if (d.full_name) lines.push(`Found your name — ${d.full_name}`);
  if (d.brokerage) lines.push(`Spotted your brokerage — ${d.brokerage}`);
  if (d.metro_area) lines.push(`Pinpointed your market — ${d.metro_area}`);
  if (d.primary_color || d.logo_url) lines.push("Pulled your brand colors and logo");
  if (d.headshot_url) lines.push("Grabbed your headshot");
  return lines;
}
