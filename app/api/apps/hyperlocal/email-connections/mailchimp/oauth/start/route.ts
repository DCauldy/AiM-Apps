import { createClient } from "@/lib/supabase/server";
import { randomBytes } from "node:crypto";
import { SignJWT } from "jose";
import { NextRequest, NextResponse } from "next/server";

export const dynamic = "force-dynamic";

/**
 * GET /api/apps/hyperlocal/email-connections/mailchimp/oauth/start
 *
 * Kicks off the Mailchimp OAuth2 authorization-code flow. Sets a CSRF
 * state cookie + redirects to Mailchimp's authorize endpoint. Mailchimp
 * sends the user back to /oauth/callback once they approve.
 *
 * Required env:
 *   MAILCHIMP_CLIENT_ID
 *   MAILCHIMP_CLIENT_SECRET  (used in callback)
 *   NEXT_PUBLIC_APP_URL      (must be HTTPS — Mailchimp won't redirect to localhost)
 *
 * Local dev: expose a tunnel and set NEXT_PUBLIC_APP_URL to the tunnel URL,
 * then register that tunnel URL + "/api/apps/hyperlocal/email-connections/mailchimp/oauth/callback"
 * as your registered redirect URI in the Mailchimp app config.
 */
export async function GET(req: NextRequest) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.redirect(new URL("/login", req.url));
  }

  // Auto-replace flow: don't pre-reject here. UI confirms with the agent
  // before launching this route; the callback handles deleting any prior
  // connection AFTER the new Mailchimp one is persisted.
  const clientId = process.env.MAILCHIMP_CLIENT_ID;
  if (!clientId) {
    return new Response(
      "Mailchimp OAuth isn't configured (MAILCHIMP_CLIENT_ID missing). " +
        "Register an app at https://us1.admin.mailchimp.com/account/oauth2_client/, " +
        "set MAILCHIMP_CLIENT_ID + MAILCHIMP_CLIENT_SECRET, and retry.",
      { status: 500 },
    );
  }

  const redirectUri = resolveRedirectUri(req);
  // Mailchimp permits http://localhost / 127.0.0.1 for dev, but strongly
  // recommends HTTPS otherwise. The whole redirect URL (including http for
  // localhost) must match exactly what's registered on the Mailchimp app.

  // The state we send to Mailchimp is a signed JWT carrying the user id +
  // a nonce + a 10-min expiry. Mailchimp echoes it back unchanged; the
  // callback verifies the signature.
  //
  // Cookies aren't reliable here — observed in the wild that Chromium-based
  // browsers strip cookies on the cross-site Mailchimp → localhost return,
  // including first-party Supabase auth cookies. Signing the state replaces
  // both the CSRF protection a cookie would provide AND the session lookup,
  // sidestepping the cookie behavior entirely.
  const secret = stateSecret();
  if (!secret) {
    return new Response(
      "Server isn't configured to sign OAuth state. Set HYPERLOCAL_UNSUBSCRIBE_SECRET (or any 32+ char secret).",
      { status: 500 },
    );
  }
  const nonce = randomBytes(16).toString("hex");
  const state = await new SignJWT({ uid: user.id, n: nonce })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuer("aim-hyperlocal")
    .setAudience("mc-oauth")
    .setIssuedAt()
    .setExpirationTime("10m")
    .sign(secret);

  const authorizeUrl = new URL("https://login.mailchimp.com/oauth2/authorize");
  authorizeUrl.searchParams.set("response_type", "code");
  authorizeUrl.searchParams.set("client_id", clientId);
  authorizeUrl.searchParams.set("redirect_uri", redirectUri);
  authorizeUrl.searchParams.set("state", state);

  // NextResponse.redirect gives mutable headers/cookies — Response.redirect's
  // headers are frozen and rejects appends with TypeError: immutable.
  // Bind the CSRF state to this browser via httpOnly cookie. The callback
  // verifies the returned ?state matches the cookie before exchanging the
  // code, so a third-party site can't trigger our token exchange.
  return NextResponse.redirect(authorizeUrl.toString(), 302);
}

function stateSecret(): Uint8Array | null {
  const raw =
    process.env.HYPERLOCAL_UNSUBSCRIBE_SECRET ??
    process.env.AIM_APP_TOKEN_SECRET;
  if (!raw) return null;
  return new TextEncoder().encode(raw);
}

function resolveRedirectUri(req: NextRequest): string {
  const base = (process.env.NEXT_PUBLIC_APP_URL ?? "").replace(/\/+$/, "");
  const origin = base || req.nextUrl.origin?.replace(/\/+$/, "") || "";
  // Mailchimp explicitly rejects "localhost" in redirect URIs and instructs
  // developers to use 127.0.0.1 — their hint reads "Want to use localhost?
  // Please use 127.0.0.1 instead." Translate on this boundary so the rest
  // of the app (which uses NEXT_PUBLIC_APP_URL widely) doesn't have to
  // care about Mailchimp's quirk.
  return (
    `${origin}/api/apps/hyperlocal/email-connections/mailchimp/oauth/callback`
  ).replace("://localhost", "://127.0.0.1");
}
