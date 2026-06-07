import type { HlEmailConnection } from "@/types/hyperlocal";
import { resendProvider } from "./providers/resend";
import type { EmailMessage, SendResult } from "./providers/types";

/**
 * Dispatch a Hyperlocal email through the connection's provider. Resend is
 * the only supported provider — Gmail and Outlook OAuth flows were removed
 * to keep AiM out of the deliverability liability path for customer mail.
 */
export async function dispatchEmail(
  conn: HlEmailConnection,
  msg: EmailMessage
): Promise<SendResult> {
  return resendProvider.send(conn, msg);
}
