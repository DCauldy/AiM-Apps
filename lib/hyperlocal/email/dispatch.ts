import type { PlatformEmailConnection } from "@/types/platform-connections";
import { getAdapter } from "./providers/registry";
import type { EmailMessage, SendResult } from "./providers/types";

/**
 * Dispatch a Hyperlocal email through the connection's provider.
 *
 * Resolves the adapter via the central registry and asserts its mode is
 * transactional (campaign-mode providers route through campaign-dispatch).
 */
export async function dispatchEmail(
  conn: PlatformEmailConnection,
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
