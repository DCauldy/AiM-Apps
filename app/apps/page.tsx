import Image from "next/image";
import { createClient } from "@/lib/supabase/server";
import { getFeatureFlags } from "@/lib/admin-config.server";
import { AppsShowcase } from "@/components/apps/AppsShowcase";
import { ActiveProfileChip } from "@/components/profile/ActiveProfileChip";
import { Circuitry } from "@/components/decor/Circuitry";
import { UserMenu } from "@/components/layout/UserMenu";
import { WelcomeModal } from "@/components/apps/WelcomeModal";
import { getTrialStatus } from "@/lib/trial";
import { getBofuUsage } from "@/lib/blog-engine/usage";
import { getHyperlocalUsage } from "@/lib/hyperlocal/usage";
import { getListingStudioUsage } from "@/lib/listing-studio/usage";
import { UNLIMITED } from "@/lib/hyperlocal-packs";
import type { UsageStats } from "@/components/apps/AppsShowcase";

export default async function AppsPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const flags = await getFeatureFlags();
  const subscriptionTier =
    (user?.app_metadata?.subscription_tier as string) ?? "standalone";

  // Profile gate. A user can't meaningfully use any app until they have an
  // active platform profile (it powers personalization everywhere), so when
  // none exists we show a mandatory, non-dismissable setup modal. Setting up
  // a profile clears the gate naturally (active_profile_id becomes non-null).
  let needsProfile = false;
  if (user) {
    const { data: profileRow } = await supabase
      .from("profiles")
      .select("active_profile_id")
      .eq("id", user.id)
      .maybeSingle();
    needsProfile = !profileRow?.active_profile_id;
  }

  const usageStats: UsageStats = {
    "prompt-studio": null,
    "blog-engine": null,
    "radar": null,
    "hyperlocal": null,
    "listing-studio": null,
    "tours": null,
  };

  if (user) {
    const trialStatus = await getTrialStatus(user.id);
    usageStats["prompt-studio"] = {
      used: trialStatus.usage,
      limit: trialStatus.limit,
      period: "this month",
    };

    if (subscriptionTier === "pro") {
      const bofuUsage = await getBofuUsage(user.id);
      usageStats["blog-engine"] = {
        used: bofuUsage.blogsGenerated,
        limit: bofuUsage.blogsLimit,
        period: "this week",
      };

      // Radar usage: query count vs limit
      const { data: radarConfig } = await supabase
        .from("radar_config")
        .select("query_limit")
        .eq("user_id", user.id)
        .maybeSingle();

      if (radarConfig) {
        const { count: queryCount } = await supabase
          .from("radar_queries")
          .select("id", { count: "exact", head: true })
          .eq("user_id", user.id)
          .eq("is_active", true);

        usageStats["radar"] = {
          used: queryCount || 0,
          limit: radarConfig.query_limit,
          period: "queries tracked",
        };
      }

      // Hyperlocal usage: campaigns this month vs pack limit. Unlimited
      // packs (Diamond, or future tiers) surface a large sentinel so the
      // showcase progress bar caps gracefully.
      const hlUsage = await getHyperlocalUsage(user.id);
      usageStats["hyperlocal"] = {
        used: hlUsage.campaignsThisMonth,
        limit:
          hlUsage.campaignsLimit === UNLIMITED ? 9999 : hlUsage.campaignsLimit,
        period: "this month",
      };

      // CMA usage: enrolled past clients on the automated cadence vs pack
      // limit. Diamond unlimited surfaces as 9999 for the progress bar.
      // (Internal slug stays "listing-studio" — user-facing name is "CMA".)
      const lsUsage = await getListingStudioUsage(user.id);
      usageStats["listing-studio"] = {
        used: lsUsage.activeClients,
        limit:
          lsUsage.activeClientsLimit === UNLIMITED
            ? 9999
            : (lsUsage.activeClientsLimit as number),
        period: "enrolled",
      };
    }
  }

  return (
    <div className="apps-theme apps-landing-bg min-h-screen flex items-start justify-center p-4 md:p-8 md:pt-16">
      {/* User menu — top-right floats over the landing. Contains the
          logout action; matches the placement on the admin/header
          layouts so customers always know where to find it. */}
      <div className="absolute top-4 right-4 z-20">
        <UserMenu />
      </div>

      {/* Decorative circuitry — same pattern + pulse cadence as the AiM
          dashboard chatbot, positioned in opposite corners. */}
      <Circuitry
        color="white"
        opacity={0.06}
        scale={0.7}
        position={{ bottom: "-100px", right: "0" }}
        transformOrigin="bottom right"
        pulse={{ opacity: 0.2, duration: "6s" }}
      />
      <Circuitry
        color="white"
        opacity={0.06}
        scale={0.7}
        position={{ top: "-100px", left: "0" }}
        transformOrigin="left center"
        rotate="90deg"
        pulse={{ opacity: 0.2, duration: "6s", delay: "2s" }}
      />
      <div className="relative z-10 w-full max-w-5xl space-y-8">
        <div className="text-center space-y-3">
          <h1 className="flex items-center justify-center gap-3">
            <Image
              src="/logo-white.svg"
              alt="AiM"
              width={180}
              height={51}
              className="h-10 w-auto"
              priority
            />
            <span className="inline-flex items-center px-4 py-1.5 rounded-full text-sm font-semibold tracking-wide bg-white/10 text-white border border-white/25 backdrop-blur-sm">
              Automations
            </span>
          </h1>
          <p className="text-white/70 text-sm max-w-lg mx-auto">
            AI-powered tools built for real estate professionals. Generate content, optimize prompts, and monitor your AI search visibility — all in one place.
          </p>
          <div className="pt-2 flex items-center justify-center">
            <ActiveProfileChip />
          </div>
        </div>
        <AppsShowcase
          flags={flags}
          subscriptionTier={subscriptionTier}
          usageStats={usageStats}
        />
      </div>
      <WelcomeModal initialOpen={needsProfile} mandatory={needsProfile} />
    </div>
  );
}
