"use client";

import {
  Radar,
  Eye,
  Search,
  Globe,
  BarChart3,
  Shield,
} from "lucide-react";

import { ProductWelcome } from "@/components/app-shell/ProductWelcome";

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

const STATS = [
  {
    value: "58%",
    label: "of consumers have used AI for real estate searches",
    source: "NAR 2025",
  },
  {
    value: "8",
    label: "AI engines monitored simultaneously",
    source: "Radar",
  },
  {
    value: "0-100",
    label: "visibility score with engine-weighted scoring",
    source: "Radar",
  },
];

export function WelcomeScreen() {
  return (
    <ProductWelcome
      badgeText="AiM Pro"
      title="Own your AI visibility."
      description="Radar monitors how you appear across AI search engines, discovers what queries buyers and sellers ask AI, and audits your website for AI-readiness. Built for real estate professionals who want to be the answer."
      stats={STATS}
      features={FEATURES}
      ctaLabel="Set Up Radar"
      ctaHref="/apps/radar/onboarding"
      ctaHelpText="Takes about 3 minutes. We'll walk you through everything."
      accentClassName="text-[#e0a458]"
      accentBgClassName="bg-[#e0a458]/10"
      ctaClassName="bg-[#e0a458] text-white hover:bg-[#c88d3e]"
      ctaShadowClassName="shadow-[#e0a458]/20"
    />
  );
}
