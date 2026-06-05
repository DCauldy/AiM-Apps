import type { HlEmailConnection } from "@/types/hyperlocal";

export interface EmailMessage {
  from: { email: string; name?: string };
  reply_to?: string;
  to: { email: string; name?: string };
  subject: string;
  html: string;
  text: string;
  headers?: Record<string, string>;
  tags?: Record<string, string>;
}

export interface SendResult {
  success: boolean;
  provider_message_id?: string;
  is_hard_bounce?: boolean;
  error?: string;
}

export interface EmailProviderClient {
  send(
    connection: HlEmailConnection,
    msg: EmailMessage
  ): Promise<SendResult>;
}
