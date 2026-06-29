"use client";

import { Check } from "lucide-react";
import { cn } from "@/lib/utils";
import type { OnboardingSection } from "@/types/blog-engine";

const SECTIONS: { key: OnboardingSection; label: string }[] = [
  { key: "professional_type", label: "Professional Type" },
  { key: "market", label: "Market & Location" },
  { key: "business_focus", label: "Business Focus" },
  { key: "website", label: "Website & Blog" },
  { key: "identity", label: "Identity & SEO" },
  { key: "cta_compliance", label: "CTAs & Compliance" },
  { key: "cms_connection", label: "CMS Connection" },
  { key: "schedule", label: "Schedule" },
];

interface OnboardingProgressProps {
  completedSections: Set<string>;
  currentSection?: string;
}

export function OnboardingProgress({
  completedSections,
  currentSection,
}: OnboardingProgressProps) {
  return (
    <div className="flex items-center gap-1 px-4 py-2 overflow-x-auto">
      {SECTIONS.map((section, index) => {
        const isCompleted = completedSections.has(section.key);
        const isCurrent = currentSection === section.key;

        return (
          <div key={section.key} className="flex items-center">
            <div className="flex items-center gap-1.5">
              <div
                className={cn(
                  "flex items-center justify-center w-5 h-5 rounded-full text-[10px] font-medium transition-colors shrink-0",
                  isCompleted
                    ? "bg-[#31DBA5] text-white"
                    : isCurrent
                      ? "bg-primary text-primary-foreground"
                      : "bg-muted text-muted-foreground"
                )}
              >
                {isCompleted ? (
                  <Check className="h-3 w-3" />
                ) : (
                  index + 1
                )}
              </div>
              <span
                className={cn(
                  "text-xs whitespace-nowrap hidden sm:inline",
                  isCompleted
                    ? "text-[#31DBA5]"
                    : isCurrent
                      ? "text-foreground font-medium"
                      : "text-muted-foreground"
                )}
              >
                {section.label}
              </span>
            </div>
            {index < SECTIONS.length - 1 && (
              <div
                className={cn(
                  "w-4 h-px mx-1 shrink-0",
                  isCompleted ? "bg-[#31DBA5]" : "bg-border"
                )}
              />
            )}
          </div>
        );
      })}
    </div>
  );
}
