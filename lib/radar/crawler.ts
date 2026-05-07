import type { CrawledPage } from "@/types/radar";

const BROWSERLESS_API_KEY = process.env.BROWSERLESS_API_KEY || "";
const BROWSERLESS_API_URL =
  process.env.BROWSERLESS_API_URL || "https://chrome.browserless.io";

/**
 * Fetch a single page's HTML content via Browserless.io content endpoint.
 * Falls back to a simple fetch when no Browserless key is configured (dev mode).
 */
async function fetchPage(url: string): Promise<string | null> {
  // Fallback: simple fetch when Browserless is not configured
  if (!BROWSERLESS_API_KEY) {
    try {
      const response = await fetch(url, {
        headers: {
          "User-Agent": "Mozilla/5.0 (compatible; AiMRadarBot/1.0)",
        },
        redirect: "follow",
      });
      if (!response.ok) {
        console.error(`[Radar Crawler] Failed to fetch ${url}: ${response.status}`);
        return null;
      }
      return await response.text();
    } catch (error) {
      console.error(`[Radar Crawler] Error fetching ${url}:`, error);
      return null;
    }
  }

  try {
    const response = await fetch(
      `${BROWSERLESS_API_URL}/content?token=${BROWSERLESS_API_KEY}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url }),
      }
    );

    if (!response.ok) {
      console.error(
        `[Radar Crawler] Failed to fetch ${url}: ${response.status}`
      );
      return null;
    }

    return await response.text();
  } catch (error) {
    console.error(`[Radar Crawler] Error fetching ${url}:`, error);
    return null;
  }
}

/**
 * Extract the page title from HTML.
 */
function extractTitle(html: string): string {
  const titleMatch = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
  return titleMatch ? titleMatch[1].trim() : "";
}

/**
 * Extract all links from HTML and filter to the same domain.
 */
function extractLinks(html: string, baseUrl: string): string[] {
  const links: string[] = [];
  let baseDomain: string;

  try {
    baseDomain = new URL(baseUrl).hostname;
  } catch {
    return links;
  }

  // Match href attributes
  const hrefRegex = /href=["']([^"']+)["']/gi;
  let match: RegExpExecArray | null;

  while ((match = hrefRegex.exec(html)) !== null) {
    const href = match[1];

    // Skip anchors, javascript, mailto, tel
    if (
      href.startsWith("#") ||
      href.startsWith("javascript:") ||
      href.startsWith("mailto:") ||
      href.startsWith("tel:")
    ) {
      continue;
    }

    try {
      const absoluteUrl = new URL(href, baseUrl);

      // Only same domain
      if (absoluteUrl.hostname !== baseDomain) continue;

      // Remove hash and normalize
      absoluteUrl.hash = "";
      const normalized = absoluteUrl.toString().replace(/\/$/, "");

      // Skip common non-content paths
      if (
        /\.(jpg|jpeg|png|gif|svg|css|js|pdf|zip|ico|woff|woff2|ttf|eot)$/i.test(
          normalized
        )
      ) {
        continue;
      }

      links.push(normalized);
    } catch {
      // Invalid URL, skip
    }
  }

  return [...new Set(links)];
}

/**
 * BFS crawl a website starting from the given URL.
 *
 * Uses Browserless.io to fetch pages and extracts same-domain links
 * for breadth-first traversal.
 *
 * @param startUrl  The URL to start crawling from
 * @param maxPages  Maximum number of pages to crawl (default 50)
 * @returns         Array of crawled pages with URL, HTML, and title
 */
export async function crawlWebsite(
  startUrl: string,
  maxPages: number = 50
): Promise<CrawledPage[]> {
  const visited = new Set<string>();
  const queue: string[] = [];
  const results: CrawledPage[] = [];

  // Normalize the start URL — ensure protocol is present
  let normalizedStart = startUrl.replace(/\/$/, "");
  if (!/^https?:\/\//i.test(normalizedStart)) {
    normalizedStart = `https://${normalizedStart}`;
  }
  queue.push(normalizedStart);

  while (queue.length > 0 && results.length < maxPages) {
    const url = queue.shift()!;

    // Skip if already visited
    const normalizedUrl = url.replace(/\/$/, "");
    if (visited.has(normalizedUrl)) continue;
    visited.add(normalizedUrl);

    const html = await fetchPage(url);
    if (!html) continue;

    const title = extractTitle(html);
    results.push({ url, html, title });

    // Extract and queue new links
    const links = extractLinks(html, url);
    for (const link of links) {
      const normalizedLink = link.replace(/\/$/, "");
      if (!visited.has(normalizedLink) && !queue.includes(link)) {
        queue.push(link);
      }
    }
  }

  return results;
}
