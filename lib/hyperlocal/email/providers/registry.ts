import "server-only";

import type { EmailProvider } from "@/types/hyperlocal";
import type { EmailProviderAdapter } from "./types";
import { resendAdapter } from "./resend";
import { sendgridAdapter } from "./sendgrid";
import { mailchimpAdapter } from "./mailchimp";
import { activecampaignAdapter } from "./activecampaign";

// ============================================================
// Provider registry — single lookup table.
//
// Each entry in hl_email_connections.provider maps to one adapter that
// implements EmailProviderAdapter. Callers (dispatch, webhook ingester,
// renderer, run pipeline) get the adapter via getAdapter() and branch
// on its `mode` + `capabilities` instead of hard-coding provider names.
//
// Adding a new ESP: implement the adapter, drop it in here, expand the
// provider enum constraint in a migration, ship a setup UI. The rest of
// the pipeline picks it up automatically.
// ============================================================

const REGISTRY: Partial<Record<EmailProvider, EmailProviderAdapter>> = {
  resend: resendAdapter,
  sendgrid: sendgridAdapter,
  mailchimp: mailchimpAdapter,
  activecampaign: activecampaignAdapter,
  // constantcontact: ...,
  // klaviyo: ...,
};

export function getAdapter(provider: EmailProvider): EmailProviderAdapter {
  const adapter = REGISTRY[provider];
  if (!adapter) {
    throw new Error(
      `No adapter registered for provider "${provider}". Either the provider hasn't shipped yet or the registry is out of sync with the DB enum.`,
    );
  }
  return adapter;
}

export function hasAdapter(provider: EmailProvider): boolean {
  return !!REGISTRY[provider];
}
