"use client";

import {
  Search,
  TrendingUp,
  FileText,
  Image,
  Globe,
  Clock,
} from "lucide-react";

import { ProductWelcome } from "@/components/app-shell/ProductWelcome";

const FEATURES = [
  {
    icon: Search,
    title: "Market Research",
    description:
      "AI researches your local market to find bottom-of-funnel topics your clients are searching for.",
  },
  {
    icon: TrendingUp,
    title: "BOFU Scoring",
    description:
      "Topics are scored for buyer intent, local relevance, and competition — so every blog drives leads.",
  },
  {
    icon: FileText,
    title: "SEO & AEO Content",
    description:
      "Blogs are optimized for both search engines and AI answer engines with schema markup, FAQ sections, and answer capsules.",
  },
  {
    icon: Image,
    title: "Featured Images",
    description:
      "AI-generated location photography or branded headers — styled to match your brand.",
  },
  {
    icon: Globe,
    title: "Auto-Publishing",
    description:
      "Connect WordPress or any platform via webhook. Blogs publish on your schedule.",
  },
  {
    icon: Clock,
    title: "Fully Automated",
    description:
      "Set your schedule and Blog Engine handles everything — research, writing, images, and publishing.",
  },
];

const STATS = [
  {
    value: "56%",
    label: "of real estate SEO leads come from blog content",
    source: "Taylor Scher SEO",
    sourceUrl: "https://www.taylorscherseo.com/blog/real-estate-marketing",
  },
  {
    value: "3.5x",
    label: "higher conversion from organic search vs paid ads",
    source: "First Page Sage",
    sourceUrl:
      "https://firstpagesage.com/reports/seo-vs-ppc-statistics-conversion-rates-compared-fc/",
  },
  {
    value: "40%",
    label: "more likely to be cited by AI with structured content",
    source: "Princeton / Georgia Tech",
    sourceUrl: "https://arxiv.org/abs/2306.14077",
  },
];

export function WelcomeScreen() {
  return (
    <ProductWelcome
      badgeText="AiM Pro"
      title="Your blog, on autopilot."
      description="Blog Engine researches your market, writes SEO-optimized content, generates featured images, and publishes it — automatically. Built for real estate professionals who want to dominate AI search results."
      stats={STATS}
      features={FEATURES}
      ctaLabel="Set Up Your Blog Engine"
      ctaHref="/apps/blog-engine/onboarding"
      ctaHelpText="Takes about 5 minutes. We'll walk you through everything."
      accentClassName="text-primary"
      accentBgClassName="bg-primary/10"
      ctaClassName="bg-primary text-primary-foreground hover:bg-primary/90"
      ctaShadowClassName="shadow-primary/20"
      sourceHoverClassName="hover:text-primary"
    />
  );
}
