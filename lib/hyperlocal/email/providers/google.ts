import { decrypt, encrypt } from "@/lib/hyperlocal/encryption";
import { createServiceRoleClient } from "@/lib/supabase/server";
import { refreshGoogleToken } from "@/lib/hyperlocal/email/oauth/google";
import type { HlEmailConnection } from "@/types/hyperlocal";
import type {
  EmailMessage,
  EmailProviderClient,
  SendResult,
} from "./types";

const GMAIL_SEND_URL = "https://gmail.googleapis.com/gmail/v1/users/me/messages/send";
const REFRESH_BUFFER_MS = 5 * 60 * 1000;

async function getValidAccessToken(conn: HlEmailConnection): Promise<string> {
  if (!conn.oauth_access_token_encrypted) {
    throw new Error("No access token stored for this connection");
  }
  const expiresAt = conn.oauth_expires_at
    ? new Date(conn.oauth_expires_at).getTime()
    : 0;
  if (expiresAt - Date.now() > REFRESH_BUFFER_MS) {
    return decrypt(conn.oauth_access_token_encrypted);
  }
  if (!conn.oauth_refresh_token_encrypted) {
    throw new Error("Token expired and no refresh token available — reconnect");
  }
  const refreshToken = decrypt(conn.oauth_refresh_token_encrypted);
  const tokens = await refreshGoogleToken(refreshToken);

  const supabase = createServiceRoleClient();
  await supabase
    .from("hl_email_connections")
    .update({
      oauth_access_token_encrypted: encrypt(tokens.access_token),
      oauth_refresh_token_encrypted: tokens.refresh_token
        ? encrypt(tokens.refresh_token)
        : conn.oauth_refresh_token_encrypted,
      oauth_expires_at: new Date(
        Date.now() + tokens.expires_in * 1000
      ).toISOString(),
      updated_at: new Date().toISOString(),
    })
    .eq("id", conn.id);

  return tokens.access_token;
}

function buildMimeMessage(msg: EmailMessage): string {
  const boundary = `--boundary-${Date.now()}`;
  const fromLine = msg.from.name
    ? `From: ${msg.from.name} <${msg.from.email}>`
    : `From: ${msg.from.email}`;
  const toLine = msg.to.name
    ? `To: ${msg.to.name} <${msg.to.email}>`
    : `To: ${msg.to.email}`;

  const customHeaders = msg.headers
    ? Object.entries(msg.headers)
        .map(([k, v]) => `${k}: ${v}`)
        .join("\r\n")
    : "";

  const lines = [
    fromLine,
    toLine,
    msg.reply_to ? `Reply-To: ${msg.reply_to}` : "",
    `Subject: ${msg.subject}`,
    "MIME-Version: 1.0",
    `Content-Type: multipart/alternative; boundary="${boundary}"`,
    customHeaders,
    "",
    `--${boundary}`,
    "Content-Type: text/plain; charset=UTF-8",
    "Content-Transfer-Encoding: 7bit",
    "",
    msg.text,
    "",
    `--${boundary}`,
    "Content-Type: text/html; charset=UTF-8",
    "Content-Transfer-Encoding: 7bit",
    "",
    msg.html,
    "",
    `--${boundary}--`,
    "",
  ].filter((l) => l !== "");

  return lines.join("\r\n");
}

function base64UrlEncode(s: string): string {
  return Buffer.from(s, "utf-8")
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
}

export const googleProvider: EmailProviderClient = {
  async send(
    conn: HlEmailConnection,
    msg: EmailMessage
  ): Promise<SendResult> {
    try {
      const accessToken = await getValidAccessToken(conn);
      const raw = base64UrlEncode(buildMimeMessage(msg));

      const res = await fetch(GMAIL_SEND_URL, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${accessToken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ raw }),
      });

      if (res.ok) {
        const data = (await res.json()) as { id?: string };
        return { success: true, provider_message_id: data.id };
      }
      const text = await res.text();
      const isHardBounce =
        res.status === 400 && /invalid|address/i.test(text);
      return {
        success: false,
        is_hard_bounce: isHardBounce,
        error: `Gmail ${res.status}: ${text.slice(0, 500)}`,
      };
    } catch (e) {
      return {
        success: false,
        error: e instanceof Error ? e.message : String(e),
      };
    }
  },
};
