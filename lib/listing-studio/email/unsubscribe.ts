import { SignJWT, jwtVerify } from "jose";

// ============================================================
// CMA unsubscribe tokens.
//
// Each delivery embeds a per-client unsub link. Hitting it sets
// cma_clients.unsubscribed_at — cadence stops + future syncs respect
// the suppression. Token = signed JWT(client_id) so the public route
// doesn't need any other auth and the link survives the 365-day TTL
// of a typical email-archive lifetime.
//
// Secret env: CMA_UNSUBSCRIBE_SECRET (falls back to
// HYPERLOCAL_UNSUBSCRIBE_SECRET in dev so we don't need a fresh
// secret per app; in prod it should be set separately so app keys
// can rotate independently).
// ============================================================

const ISSUER = "aim-cma";
const AUDIENCE = "unsubscribe";

function getSecret(): Uint8Array {
  const raw =
    process.env.CMA_UNSUBSCRIBE_SECRET ??
    process.env.HYPERLOCAL_UNSUBSCRIBE_SECRET;
  if (!raw) {
    throw new Error(
      "CMA_UNSUBSCRIBE_SECRET (or HYPERLOCAL_UNSUBSCRIBE_SECRET fallback) is not set",
    );
  }
  return new TextEncoder().encode(raw);
}

export async function generateCmaUnsubscribeToken(
  clientId: string,
): Promise<string> {
  return await new SignJWT({ cid: clientId })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuer(ISSUER)
    .setAudience(AUDIENCE)
    .setIssuedAt()
    .setExpirationTime("365d")
    .sign(getSecret());
}

export async function verifyCmaUnsubscribeToken(
  token: string,
): Promise<{ clientId: string } | null> {
  try {
    const { payload } = await jwtVerify(token, getSecret(), {
      issuer: ISSUER,
      audience: AUDIENCE,
    });
    if (typeof payload.cid !== "string") return null;
    return { clientId: payload.cid };
  } catch {
    return null;
  }
}

export function buildCmaUnsubscribeUrl(token: string): string {
  const base =
    process.env.NEXT_PUBLIC_APP_URL ?? "https://apps.aimarketingacademy.com";
  return `${base.replace(/\/$/, "")}/api/cma/unsubscribe?token=${encodeURIComponent(token)}`;
}

export function buildCmaLandingUrl(landingPageToken: string): string {
  const base =
    process.env.NEXT_PUBLIC_APP_URL ?? "https://apps.aimarketingacademy.com";
  return `${base.replace(/\/$/, "")}/cma/${encodeURIComponent(landingPageToken)}`;
}

/** Cryptographically-random landing-page token. 32 url-safe chars =
 *  ~190 bits of entropy. Stored on cma_client_deliveries.landing_page_token
 *  with UNIQUE constraint so collisions are detected at insert. */
export function generateLandingPageToken(): string {
  // Web Crypto is available in both Edge + Node runtimes.
  const bytes = new Uint8Array(24);
  crypto.getRandomValues(bytes);
  return base64UrlEncode(bytes);
}

function base64UrlEncode(bytes: Uint8Array): string {
  let s = "";
  for (const b of bytes) s += String.fromCharCode(b);
  return btoa(s).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}
