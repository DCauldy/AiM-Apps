import type { HlEmailConnection } from "@/types/hyperlocal";
import type { CmaEmailConnection } from "@/types/cma";

// ============================================================
// Adapt a CmaEmailConnection row to the HlEmailConnection shape the
// Hyperlocal email provider adapters consume.
//
// cma_email_connections doesn't carry the Hyperlocal-specific
// resend_webhook_secret_encrypted column (the CMA webhook handler will
// own its own secret in Wave 5). Every other field maps 1:1.
// ============================================================

export function toHlEmailShim(c: CmaEmailConnection): HlEmailConnection {
  return {
    id: c.id,
    user_id: c.user_id,
    provider: c.provider,
    email_address: c.email_address,
    display_name: c.display_name,
    resend_api_key_encrypted: c.resend_api_key_encrypted ?? null,
    resend_webhook_secret_encrypted: null,
    resend_domain: c.resend_domain,
    resend_domain_id: c.resend_domain_id,
    resend_dkim_status: c.resend_dkim_status,
    provider_api_key_encrypted: c.provider_api_key_encrypted ?? null,
    provider_oauth_access_token_encrypted:
      c.provider_oauth_access_token_encrypted ?? null,
    provider_oauth_refresh_token_encrypted:
      c.provider_oauth_refresh_token_encrypted ?? null,
    provider_oauth_expires_at: c.provider_oauth_expires_at ?? null,
    provider_metadata: c.provider_metadata,
    is_active: c.is_active,
    is_default: c.is_default,
    last_send_at: c.last_send_at,
    last_error: c.last_error,
    created_at: c.created_at,
    updated_at: c.updated_at,
  };
}
