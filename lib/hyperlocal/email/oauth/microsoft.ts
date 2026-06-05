const TENANT = "common";  // multi-tenant app
const AUTHORIZE_URL = `https://login.microsoftonline.com/${TENANT}/oauth2/v2.0/authorize`;
const TOKEN_URL = `https://login.microsoftonline.com/${TENANT}/oauth2/v2.0/token`;
const SCOPES = ["Mail.Send", "offline_access", "User.Read", "openid", "profile", "email"];

export interface MsTokens {
  access_token: string;
  refresh_token?: string;
  expires_in: number;     // seconds
  scope?: string;
  id_token?: string;
}

function getClientId(): string {
  const v = process.env.MICROSOFT_CLIENT_ID;
  if (!v) throw new Error("MICROSOFT_CLIENT_ID is not set");
  return v;
}
function getClientSecret(): string {
  const v = process.env.MICROSOFT_CLIENT_SECRET;
  if (!v) throw new Error("MICROSOFT_CLIENT_SECRET is not set");
  return v;
}
function getRedirectUri(): string {
  const base =
    process.env.NEXT_PUBLIC_APP_URL ?? "https://apps.aimarketingacademy.com";
  return `${base.replace(/\/$/, "")}/api/apps/hyperlocal/email-connections/oauth/microsoft/callback`;
}

export function buildMicrosoftAuthorizeUrl(state: string): string {
  const url = new URL(AUTHORIZE_URL);
  url.searchParams.set("client_id", getClientId());
  url.searchParams.set("response_type", "code");
  url.searchParams.set("redirect_uri", getRedirectUri());
  url.searchParams.set("response_mode", "query");
  url.searchParams.set("scope", SCOPES.join(" "));
  url.searchParams.set("state", state);
  url.searchParams.set("prompt", "consent");
  return url.toString();
}

export async function exchangeMicrosoftCode(code: string): Promise<MsTokens> {
  const body = new URLSearchParams({
    client_id: getClientId(),
    client_secret: getClientSecret(),
    grant_type: "authorization_code",
    code,
    redirect_uri: getRedirectUri(),
    scope: SCOPES.join(" "),
  });

  const res = await fetch(TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body,
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Microsoft token exchange failed: ${res.status} ${text}`);
  }
  return (await res.json()) as MsTokens;
}

export async function refreshMicrosoftToken(
  refreshToken: string
): Promise<MsTokens> {
  const body = new URLSearchParams({
    client_id: getClientId(),
    client_secret: getClientSecret(),
    grant_type: "refresh_token",
    refresh_token: refreshToken,
    scope: SCOPES.join(" "),
  });

  const res = await fetch(TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body,
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Microsoft token refresh failed: ${res.status} ${text}`);
  }
  return (await res.json()) as MsTokens;
}

/**
 * Fetch the signed-in user's mailbox identity (used to seed email_address).
 */
export async function getMicrosoftUserProfile(
  accessToken: string
): Promise<{ email: string; displayName: string }> {
  const res = await fetch("https://graph.microsoft.com/v1.0/me", {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (!res.ok) {
    throw new Error(`Microsoft profile fetch failed: ${res.status}`);
  }
  const profile = (await res.json()) as {
    mail?: string;
    userPrincipalName?: string;
    displayName?: string;
  };
  return {
    email: (profile.mail ?? profile.userPrincipalName ?? "").toLowerCase(),
    displayName: profile.displayName ?? "",
  };
}
