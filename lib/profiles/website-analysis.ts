import "server-only";

import { promises as dns } from "node:dns";
import { generateText } from "ai";
import { getProfileMagicModel } from "@/lib/openrouter";
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
  full_name: string;
  title: string | null;
  professional_type: string;
  brokerage: string;
  state: string;
  metro_area: string;
  bio: string | null;
  phone: string | null;
  website_url: string | null;
  primary_color: string | null;
  secondary_color: string | null;
  accent_color: string | null;
  logo_url: string | null;
  headshot_url: string | null;
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

export async function analyzeWebsite(input: string): Promise<WebsiteAnalysisResult> {
  const url = normalizeUrl(input);
  await assertPublicHost(url);

  const homeHtml = await fetchPageHtml(url.toString());
  if (!homeHtml) {
    throw new WebsiteAnalysisError(
      "We couldn't reach that site. Check the address, or switch to Control Freak Mode and we'll do it together.",
    );
  }

  const pagesRead = [url.toString()];
  const texts = [htmlToText(homeHtml)];
  const signals = extractBrandSignals(homeHtml, url);

  // Crawl a few key internal pages (about/team/contact) for richer context.
  for (const link of discoverInternalLinks(homeHtml, url)) {
    const html = await fetchPageHtml(link);
    if (!html) continue;
    pagesRead.push(link);
    texts.push(htmlToText(html));
    const more = extractBrandSignals(html, new URL(link));
    signals.logoCandidates.push(...more.logoCandidates);
    signals.headshotCandidates.push(...more.headshotCandidates);
    signals.colorCandidates.push(...more.colorCandidates);
  }

  const combinedText = texts.join("\n\n--- next page ---\n\n").slice(0, MAX_TOTAL_TEXT);
  const dedupe = (arr: string[]) => [...new Set(arr)];

  const draft = await extractProfile({
    siteUrl: url.toString(),
    text: combinedText,
    metaDescription: signals.metaDescription,
    logoCandidates: dedupe(signals.logoCandidates).slice(0, 10),
    headshotCandidates: dedupe(signals.headshotCandidates).slice(0, 12),
    colorCandidates: dedupe(signals.colorCandidates).slice(0, 8),
  });

  return {
    draft: draft.draft,
    found: draft.found,
    lowConfidence: draft.lowConfidence,
    pagesRead,
  };
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

function coerceDraft(parsed: Record<string, unknown> | null, siteUrl: string): MagicProfileDraft {
  const p = parsed ?? {};
  const role = str(p.professional_type)?.toLowerCase() ?? "";
  return {
    full_name: str(p.full_name) ?? "",
    title: str(p.title),
    professional_type: VALID_ROLES.has(role) ? role : "solo_agent",
    brokerage: str(p.brokerage) ?? "",
    state: (str(p.state) ?? "").toUpperCase().slice(0, 2),
    metro_area: str(p.metro_area) ?? "",
    bio: str(p.bio),
    phone: str(p.phone),
    website_url: str(p.website_url) ?? siteUrl,
    primary_color: hex(p.primary_color),
    secondary_color: hex(p.secondary_color),
    accent_color: hex(p.accent_color),
    logo_url: str(p.logo_url),
    headshot_url: str(p.headshot_url),
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
    system: `You are editing a real-estate professional's profile draft. You will receive the CURRENT draft as JSON and a correction from the user. Apply ONLY what they ask, keep everything else identical, and return the COMPLETE updated profile as ONE JSON object with the same keys (full_name, title, professional_type, brokerage, state, metro_area, bio, phone, website_url, primary_color, secondary_color, accent_color, logo_url, headshot_url). professional_type must stay one of: solo_agent, team_leader, team_agent, broker_owner, loan_officer, title_executive. Colors are #RRGGBB or null. Output ONLY the JSON object, no prose.`,
    prompt: `CURRENT:\n${JSON.stringify(current, null, 2)}\n\nCORRECTION:\n${trimmed}`,
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
