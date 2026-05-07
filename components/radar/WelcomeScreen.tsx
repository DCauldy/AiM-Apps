"use client";

import { useRouter } from "next/navigation";
import {
  Radar,
  Eye,
  Search,
  Globe,
  BarChart3,
  Shield,
} from "lucide-react";

const FEATURES = [
  {
    icon: Eye,
    title: "AI Visibility Monitoring",
    description:
      "Track how you appear across 8 AI search engines — ChatGPT, Perplexity, Google AI Overviews, and more.",
  },
  {
    icon: Search,
    title: "Query Discovery",
    description:
      "Discover what buyers and sellers ask AI about your market. Find the queries that matter most.",
  },
  {
    icon: BarChart3,
    title: "Competitive Intelligence",
    description:
      "See how you stack up against competitors. Identify gaps where they appear and you don't.",
  },
  {
    icon: Globe,
    title: "Website Audit",
    description:
      "Score your pages for AI-readiness. Get actionable recommendations to increase citations.",
  },
  {
    icon: Shield,
    title: "Smart Alerts",
    description:
      "Get notified when your visibility changes — new mentions, lost citations, competitor movements.",
  },
  {
    icon: Radar,
    title: "Visibility Score",
    description:
      "A weighted 0–100 score across all engines, updated with every check. Track your progress over time.",
  },
];

export function WelcomeScreen() {
  const router = useRouter();

  return (
    <div className="h-full overflow-y-auto">
      <div className="max-w-4xl mx-auto px-6 py-12">
        {/* Hero */}
        <div className="text-center mb-12">
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-[#e0a458]/10 text-[#e0a458] text-xs font-medium mb-4">
            <span className="w-1.5 h-1.5 rounded-full bg-[#e0a458] animate-pulse" />
            AiM Pro
          </div>
          <h1 className="font-sans text-3xl sm:text-4xl font-bold text-foreground mb-4">
            Own your AI visibility.
          </h1>
          <p className="text-lg text-muted-foreground max-w-2xl mx-auto leading-relaxed">
            Radar monitors how you appear across AI search engines, discovers what
            queries buyers and sellers ask AI, and audits your website for AI-readiness.
            Built for real estate professionals who want to be the answer.
          </p>
        </div>

        {/* Stat callout */}
        <div className="flex justify-center gap-8 mb-12">
          <StatCard
            value="58%"
            label="of consumers have used AI for real estate searches"
            source="NAR 2025"
          />
          <StatCard
            value="8"
            label="AI engines monitored simultaneously"
            source="Radar"
          />
          <StatCard
            value="0-100"
            label="visibility score with engine-weighted scoring"
            source="Radar"
          />
        </div>

        {/* Feature grid */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6 mb-12">
          {FEATURES.map((feature) => (
            <div
              key={feature.title}
              className="rounded-lg border bg-card p-5 hover:bg-accent/30 transition-colors"
            >
              <feature.icon className="h-5 w-5 text-[#e0a458] mb-3" />
              <h3 className="font-sans text-sm font-semibold text-foreground mb-1">
                {feature.title}
              </h3>
              <p className="text-xs text-muted-foreground leading-relaxed">
                {feature.description}
              </p>
            </div>
          ))}
        </div>

        {/* CTA */}
        <div className="text-center">
          <button
            onClick={() => router.push("/apps/radar/onboarding")}
            className="inline-flex items-center gap-2 px-8 py-3 text-base font-semibold rounded-lg bg-[#e0a458] text-white hover:bg-[#c88d3e] transition-colors shadow-lg shadow-[#e0a458]/20"
          >
            Set Up Radar
          </button>
          <p className="text-xs text-muted-foreground mt-3">
            Takes about 3 minutes. We&apos;ll walk you through everything.
          </p>
        </div>
      </div>
    </div>
  );
}

function StatCard({ value, label, source }: { value: string; label: string; source: string }) {
  return (
    <div className="text-center">
      <div className="text-2xl font-bold text-[#e0a458]">{value}</div>
      <div className="text-xs text-muted-foreground mt-1 max-w-[160px]">
        {label}
      </div>
      <span className="text-[10px] text-muted-foreground/60 mt-1.5 inline-block">
        — {source}
      </span>
    </div>
  );
}
