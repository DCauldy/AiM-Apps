const AUTHORIZE_URL = "https://accounts.google.com/o/oauth2/v2/auth";
const TOKEN_URL = "https://oauth2.googleapis.com/token";
const SCOPES = [
  "https://www.googleapis.com/auth/gmail.send",
  "https://www.googleapis.com/auth/userinfo.email",
  "https://www.googleapis.com/auth/userinfo.profile",
];

export interface GoogleTokens {
  access_token: string;
  refresh_token?: string;
  expires_in: number;
  scope?: string;
  id_token?: string;
}

function getClientId(): string {
  const v = process.env.GOOGLE_CLIENT_ID;
  if (!v) throw new Error("GOOGLE_CLIENT_ID is not set");
  return v;
}
function getClientSecret(): string {
  const v = process.env.GOOGLE_CLIENT_SECRET;
  if (!v) throw new Error("GOOGLE_CLIENT_SECRET is not set");
  return v;
}
function getRedirectUri(): string {
  const base =
    process.env.NEXT_PUBLIC_APP_URL ?? "https://apps.aimarketingacademy.com";
  return `${base.replace(/\/$/, "")}/api/apps/hyperlocal/email-connections/oauth/google/callback`;
}

export function buildGoogleAuthorizeUrl(state: string): string {
  const url = new URL(AUTHORIZE_URL);
  url.searchParams.set("client_id", getClientId());
  url.searchParams.set("response_type", "code");
  url.searchParams.set("redirect_uri", getRedirectUri());
  url.searchParams.set("scope", SCOPES.join(" "));
  url.searchParams.set("access_type", "offline");
  url.searchParams.set("prompt", "consent");
  url.searchParams.set("state", state);
  return url.toString();
}

export async function exchangeGoogleCode(code: string): Promise<GoogleTokens> {
  const body = new URLSearchParams({
    client_id: getClientId(),
    client_secret: getClientSecret(),
    code,
    grant_type: "authorization_code",
    redirect_uri: getRedirectUri(),
  });
  const res = await fetch(TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body,
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Google token exchange failed: ${res.status} ${text}`);
  }
  return (await res.json()) as GoogleTokens;
}

export async function refreshGoogleToken(
  refreshToken: string
): Promise<GoogleTokens> {
  const body = new URLSearchParams({
    client_id: getClientId(),
    client_secret: getClientSecret(),
    refresh_token: refreshToken,
    grant_type: "refresh_token",
  });
  const res = await fetch(TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body,
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Google token refresh failed: ${res.status} ${text}`);
  }
  return (await res.json()) as GoogleTokens;
}

export async function getGoogleUserProfile(
  accessToken: string
): Promise<{ email: string; name: string }> {
  const res = await fetch(
    "https://www.googleapis.com/oauth2/v2/userinfo",
    { headers: { Authorization: `Bearer ${accessToken}` } }
  );
  if (!res.ok) {
    throw new Error(`Google profile fetch failed: ${res.status}`);
  }
  const profile = (await res.json()) as { email?: string; name?: string };
  return {
    email: (profile.email ?? "").toLowerCase(),
    name: profile.name ?? "",
  };
}
