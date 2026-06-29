"use client";

import { CheckCircle2, ArrowRight, Plus, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  PROVIDER_BRANDS,
  CATEGORY_LABELS,
  type ProviderBrand,
} from "@/lib/integrations/provider-logos";
import type { EmailProvider } from "@/types/hyperlocal";

// ============================================================
// Integration grid — list of supported sending providers as cards.
//
// Originally lived under components/hyperlocal/settings; moved to
// the profile in Wave 12.6 since email connections are now profile-
// scoped (shared across apps). The card layout, brand cards, and
// "shipped vs coming soon" gating are the same as before.
//
// Cards are grouped by category so the agent sees transactional and
// marketing options side-by-side without having to think about which
// "type" they need.
// ============================================================

const CATEGORY_ORDER: Array<"transactional" | "marketing"> = [
  "transactional",
  "marketing",
];

// Providers that have a fully shipped setup flow today.
// Mailchimp + ActiveCampaign route through the Hyperlocal connect
// endpoints (only Hyperlocal supports campaign-mode delivery today;
// CMA cadence-mode for campaign ESPs is deferred to Wave 4.5).
const SHIPPED: ReadonlySet<EmailProvider> = new Set([
  "resend",
  "sendgrid",
  "mailchimp",
  "activecampaign",
]);

interface IntegrationGridProps {
  /** Set of provider slugs that are already connected on this profile.
   *  Used to render the green check + "Manage" link instead of Connect. */
  connectedProviders: Set<EmailProvider>;
  /** Triggered when an unconnected, shipped card's Connect button is
   *  clicked. The parent decides what to do per provider — open an
   *  inline setup modal for Resend/SendGrid, redirect to OAuth for
   *  Mailchimp, open a per-provider API-key form for ActiveCampaign,
   *  etc. */
  onConnect: (provider: EmailProvider) => void;
  /** Currently mid-OAuth (drives spinner state on the Mailchimp card). */
  oauthInFlight?: EmailProvider | null;
}

export function IntegrationGrid({
  connectedProviders,
  onConnect,
  oauthInFlight,
}: IntegrationGridProps) {
  return (
    <div className="space-y-6">
      {CATEGORY_ORDER.map((category) => {
        const entries = (Object.entries(PROVIDER_BRANDS) as [
          EmailProvider,
          ProviderBrand,
        ][]).filter(([, b]) => b.category === category);

        return (
          <div key={category} className="space-y-3">
            <div className="flex items-center justify-between">
              <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                {CATEGORY_LABELS[category]}
              </h3>
              <span className="text-[11px] text-muted-foreground/70">
                {category === "transactional"
                  ? "You own the send · BYO domain"
                  : "ESP owns the audience · richer for sphere agents"}
              </span>
            </div>
            {/* Card count drives column count so the row fills cleanly
                without leaving orphan slots. 2-up for transactional
                (Resend + SendGrid), 3-up for marketing (Mailchimp + CC + AC). */}
            <div
              className={
                entries.length >= 3
                  ? "grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3"
                  : "grid grid-cols-1 sm:grid-cols-2 gap-3"
              }
            >
              {entries.map(([provider, brand]) => (
                <IntegrationCard
                  key={provider}
                  provider={provider}
                  brand={brand}
                  connected={connectedProviders.has(provider)}
                  shipped={SHIPPED.has(provider)}
                  onConnect={onConnect}
                  oauthInFlight={oauthInFlight === provider}
                />
              ))}
            </div>
          </div>
        );
      })}
    </div>
  );
}

interface IntegrationCardProps {
  provider: EmailProvider;
  brand: ProviderBrand;
  connected: boolean;
  shipped: boolean;
  onConnect: (provider: EmailProvider) => void;
  oauthInFlight: boolean;
}

function IntegrationCard({
  provider,
  brand,
  connected,
  shipped,
  onConnect,
  oauthInFlight,
}: IntegrationCardProps) {
  const isComingSoon = !shipped;
  const Logo = brand.Logo;

  return (
    <div
      className={`relative rounded-lg border bg-card p-4 flex flex-col gap-3 transition-colors ${
        connected
          ? "border-emerald-500/30"
          : "border-border hover:border-border/80"
      } ${isComingSoon ? "opacity-60" : ""}`}
    >
      <div className="flex items-start gap-3">
        <div
          className="flex items-center justify-center w-10 h-10 rounded-md shrink-0"
          style={{
            backgroundColor: `${brand.brandColor}15`,
            color: brand.brandColor,
          }}
        >
          <Logo className="h-5 w-5" />
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <p className="text-sm font-semibold truncate">{brand.name}</p>
            {connected && (
              <CheckCircle2 className="h-3.5 w-3.5 text-emerald-500 shrink-0" />
            )}
          </div>
          <p className="text-xs text-muted-foreground mt-0.5 leading-snug">
            {brand.tagline}
          </p>
        </div>
      </div>

      <div className="flex items-center justify-end gap-2 pt-1">
        {isComingSoon ? (
          <span className="text-[11px] uppercase tracking-wider text-muted-foreground/70">
            Coming soon
          </span>
        ) : connected ? (
          <a
            href="#connected-list"
            className="text-xs text-muted-foreground hover:text-foreground inline-flex items-center gap-1"
          >
            Manage <ArrowRight className="h-3 w-3" />
          </a>
        ) : (
          <Button
            size="sm"
            className="gap-1.5"
            onClick={() => onConnect(provider)}
            disabled={oauthInFlight}
          >
            {oauthInFlight ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : (
              <>
                <Plus className="h-3.5 w-3.5" /> Connect
              </>
            )}
          </Button>
        )}
      </div>
    </div>
  );
}
