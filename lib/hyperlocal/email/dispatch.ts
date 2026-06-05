import type { HlEmailConnection } from "@/types/hyperlocal";
import { googleProvider } from "./providers/google";
import { microsoftProvider } from "./providers/microsoft";
import { resendProvider } from "./providers/resend";
import type {
  EmailMessage,
  EmailProviderClient,
  SendResult,
} from "./providers/types";

function getProvider(conn: HlEmailConnection): EmailProviderClient {
  switch (conn.provider) {
    case "google":
      return googleProvider;
    case "microsoft":
      return microsoftProvider;
    case "resend":
      return resendProvider;
    default: {
      const _exhaust: never = conn.provider;
      throw new Error(`Unknown email provider: ${String(_exhaust)}`);
    }
  }
}

export async function dispatchEmail(
  conn: HlEmailConnection,
  msg: EmailMessage
): Promise<SendResult> {
  return getProvider(conn).send(conn, msg);
}
