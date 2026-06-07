import Image from "next/image";
import { createClient } from "@/lib/supabase/server";
import { getFeatureFlags } from "@/lib/admin-config.server";
import { AppsShowcase } from "@/components/apps/AppsShowcase";
import { ActiveProfileChip } from "@/components/profile/ActiveProfileChip";
import { Circuitry } from "@/components/decor/Circuitry";
import { getTrialStatus } from "@/lib/trial";
import { getBofuUsage } from "@/lib/blog-engine/usage";
import type { UsageStats } from "@/components/apps/AppsShowcase";

export default async function AppsPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const flags = await getFeatureFlags();
  const subscriptionTier =
    (user?.app_metadata?.subscription_tier as string) ?? "standalone";

  const usageStats: UsageStats = {
    "prompt-studio": null,
    "blog-engine": null,
    "radar": null,
    "hyperlocal": null,
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
    }
  }

  return (
    <div className="apps-theme apps-landing-bg min-h-screen flex items-start justify-center p-4 md:p-8 md:pt-16">
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
    </div>
  );
}
