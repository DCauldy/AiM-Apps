import { decrypt, encrypt } from "@/lib/hyperlocal/encryption";
import { createServiceRoleClient } from "@/lib/supabase/server";
import { refreshMicrosoftToken } from "@/lib/hyperlocal/email/oauth/microsoft";
import type { HlEmailConnection } from "@/types/hyperlocal";
import type {
  EmailMessage,
  EmailProviderClient,
  SendResult,
} from "./types";

const GRAPH_SEND_URL = "https://graph.microsoft.com/v1.0/me/sendMail";
const REFRESH_BUFFER_MS = 5 * 60 * 1000;  // refresh 5 min before expiry

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

  // Need to refresh
  if (!conn.oauth_refresh_token_encrypted) {
    throw new Error("Token expired and no refresh token available — reconnect");
  }
  const refreshToken = decrypt(conn.oauth_refresh_token_encrypted);
  const tokens = await refreshMicrosoftToken(refreshToken);

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

export const microsoftProvider: EmailProviderClient = {
  async send(
    conn: HlEmailConnection,
    msg: EmailMessage
  ): Promise<SendResult> {
    try {
      const accessToken = await getValidAccessToken(conn);

      const payload = {
        message: {
          subject: msg.subject,
          body: {
            contentType: "HTML",
            content: msg.html,
          },
          toRecipients: [
            {
              emailAddress: {
                address: msg.to.email,
                name: msg.to.name,
              },
            },
          ],
          replyTo: msg.reply_to
            ? [{ emailAddress: { address: msg.reply_to } }]
            : undefined,
          internetMessageHeaders: msg.headers
            ? Object.entries(msg.headers).map(([name, value]) => ({
                name,
                value,
              }))
            : undefined,
        },
        saveToSentItems: true,
      };

      const res = await fetch(GRAPH_SEND_URL, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${accessToken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(payload),
      });

      if (res.status === 202 || res.status === 204) {
        // Graph returns no body on success
        return { success: true };
      }
      const text = await res.text();
      // Hard bounce detection — Graph doesn't return bounce info synchronously,
      // but address-format errors come back as 400.
      const isHardBounce =
        res.status === 400 && /address|recipient/i.test(text);
      return {
        success: false,
        is_hard_bounce: isHardBounce,
        error: `Microsoft Graph ${res.status}: ${text.slice(0, 500)}`,
      };
    } catch (e) {
      return {
        success: false,
        error: e instanceof Error ? e.message : String(e),
      };
    }
  },
};
