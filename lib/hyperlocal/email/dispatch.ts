import type { HlEmailConnection } from "@/types/hyperlocal";
import { getAdapter } from "./providers/registry";
import type { EmailMessage, SendResult } from "./providers/types";

/**
 * Dispatch a Hyperlocal email through the connection's provider.
 *
 * Resolves the adapter via the central registry and asserts its mode is
 * transactional (campaign-mode providers route through a different path —
 * see lib/hyperlocal/email/campaign-dispatch.ts when that ships).
 */
export async function dispatchEmail(
  conn: HlEmailConnection,
  msg: EmailMessage,
): Promise<SendResult> {
  const adapter = getAdapter(conn.provider);
  if (adapter.mode !== "transactional" || !adapter.send) {
    throw new Error(
      `dispatchEmail called on a ${adapter.mode}-mode provider (${conn.provider}). ` +
        "Campaign-mode sends go through campaign-dispatch, not per-recipient dispatchEmail.",
    );
  }
  return adapter.send(conn, msg);
}
