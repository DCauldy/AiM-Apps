"use client";

import { useRouter } from "next/navigation";
import {
  Search,
  TrendingUp,
  FileText,
  Image,
  Globe,
  Clock,
} from "lucide-react";

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

export function WelcomeScreen() {
  const router = useRouter();

  return (
    <div className="h-full overflow-y-auto">
      <div className="max-w-4xl mx-auto px-6 py-12">
        {/* Hero */}
        <div className="text-center mb-12">
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-primary/10 text-primary text-xs font-medium mb-4">
            <span className="w-1.5 h-1.5 rounded-full bg-primary animate-pulse" />
            AiM Pro
          </div>
          <h1 className="font-sans text-3xl sm:text-4xl font-bold text-foreground mb-4">
            Your blog, on autopilot.
          </h1>
          <p className="text-lg text-muted-foreground max-w-2xl mx-auto leading-relaxed">
            Blog Engine researches your market, writes SEO-optimized content, generates
            featured images, and publishes it — automatically. Built for real estate
            professionals who want to dominate AI search results.
          </p>
        </div>

        {/* Stat callout */}
        <div className="flex justify-center gap-8 mb-12">
          <StatCard
            value="56%"
            label="of real estate SEO leads come from blog content"
            source="Taylor Scher SEO"
            sourceUrl="https://www.taylorscherseo.com/blog/real-estate-marketing"
          />
          <StatCard
            value="3.5x"
            label="higher conversion from organic search vs paid ads"
            source="First Page Sage"
            sourceUrl="https://firstpagesage.com/reports/seo-vs-ppc-statistics-conversion-rates-compared-fc/"
          />
          <StatCard
            value="40%"
            label="more likely to be cited by AI with structured content"
            source="Princeton / Georgia Tech"
            sourceUrl="https://arxiv.org/abs/2306.14077"
          />
        </div>

        {/* Feature grid */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6 mb-12">
          {FEATURES.map((feature) => (
            <div
              key={feature.title}
              className="rounded-lg border bg-card p-5 hover:bg-accent/30 transition-colors"
            >
              <feature.icon className="h-5 w-5 text-primary mb-3" />
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
            onClick={() => router.push("/apps/blog-engine/onboarding")}
            className="inline-flex items-center gap-2 px-8 py-3 text-base font-semibold rounded-lg bg-primary text-primary-foreground hover:bg-primary/90 transition-colors shadow-lg shadow-primary/20"
          >
            Set Up Your Blog Engine
          </button>
          <p className="text-xs text-muted-foreground mt-3">
            Takes about 5 minutes. We'll walk you through everything.
          </p>
        </div>
      </div>
    </div>
  );
}

function StatCard({ value, label, source, sourceUrl }: { value: string; label: string; source: string; sourceUrl: string }) {
  return (
    <div className="text-center">
      <div className="text-2xl font-bold text-primary">{value}</div>
      <div className="text-xs text-muted-foreground mt-1 max-w-[160px]">
        {label}
      </div>
      <a
        href={sourceUrl}
        target="_blank"
        rel="noopener noreferrer"
        className="text-[10px] text-muted-foreground/60 hover:text-primary mt-1.5 inline-block transition-colors"
      >
        — {source}
      </a>
    </div>
  );
}
