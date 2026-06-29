import { notFound } from "next/navigation";
import { headers } from "next/headers";

import { PublicRadarReport } from "@/components/radar-otterly/PublicRadarReport";

export const dynamic = "force-dynamic";

// /r/[token] — public, unauthenticated sanitized Radar dashboard.
// Server-renders the snapshot for share-friendly OG / SEO + zero
// loading flash. Middleware whitelists /r/ to skip auth.

interface PageProps {
  params: Promise<{ token: string }>;
}

export async function generateMetadata({ params }: PageProps) {
  const { token } = await params;
  const data = await fetchShare(token);
  if (!data || data.status !== "ready") {
    return { title: "Radar report" };
  }
  return {
    title: `${data.brand} · AI visibility`,
    description: `Live AI search visibility for ${data.brand} (${data.brandDomain}). Tracked across ChatGPT, Perplexity, Gemini, and other AI engines.`,
    openGraph: {
      title: `${data.brand} · AI visibility`,
      description: `Live AI search visibility for ${data.brand}.`,
    },
  };
}

export default async function PublicRadarSharePage({ params }: PageProps) {
  const { token } = await params;
  const data = await fetchShare(token);
  if (!data) notFound();
  return <PublicRadarReport data={data} />;
}

async function fetchShare(token: string) {
  // Resolve own host for the SSR fetch — Next requires absolute URL.
  const h = await headers();
  const host = h.get("host") ?? "localhost:6060";
  const proto =
    h.get("x-forwarded-proto") ?? (host.includes("localhost") ? "http" : "https");
  try {
    const res = await fetch(`${proto}://${host}/api/public/radar/${token}`, {
      cache: "no-store",
    });
    if (!res.ok) return null;
    return await res.json();
  } catch {
    return null;
  }
}
