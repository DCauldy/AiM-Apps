"use client";

import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogClose, DialogBody, DialogFooter } from "../ui/dialog";
import { Button } from "../ui/button";
import { Radar, Eye, Search, Globe, BarChart3, Settings, Zap } from "lucide-react";

interface RadarHelpModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function RadarHelpModal({ open, onOpenChange }: RadarHelpModalProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <div className="rotating-gradient-border-wrapper relative">
        <DialogContent className="max-w-2xl max-h-[90vh] flex flex-col m-0 !rounded-[calc(0.5rem-3px)] !shadow-none relative z-10 bg-background">
          <DialogHeader>
            <div className="flex items-center justify-between w-full">
              <DialogTitle className="text-2xl font-bold text-foreground">How to use Radar</DialogTitle>
              <DialogClose onClose={() => onOpenChange(false)} />
            </div>
          </DialogHeader>

          <DialogBody className="overflow-y-auto">
            <div className="space-y-6 text-foreground">

              <section>
                <h3 className="text-lg font-semibold mb-2 text-[#e0a458]">What is Radar?</h3>
                <p className="text-sm leading-relaxed opacity-90">
                  Radar monitors how you appear across 8 AI search engines — ChatGPT, Perplexity, Google AI Overviews,
                  Gemini, Google AI Mode, Copilot, Claude, and Grok. It discovers what queries buyers and sellers are
                  asking AI, and audits your website for AI-readiness.
                </p>
              </section>

              <section>
                <h3 className="text-lg font-semibold mb-3 text-[#e0a458]">Core Features</h3>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <FeatureCard
                    icon={Eye}
                    title="Monitor"
                    description="Track your visibility across AI engines. See if you're mentioned, your position, and sentiment."
                  />
                  <FeatureCard
                    icon={Search}
                    title="Research"
                    description="Discover queries people ask AI about your market. Find gaps where competitors appear but you don't."
                  />
                  <FeatureCard
                    icon={Globe}
                    title="Optimize"
                    description="Audit your website for AI-readiness. Get page-by-page scores and actionable recommendations."
                  />
                  <FeatureCard
                    icon={BarChart3}
                    title="Visibility Score"
                    description="A 0–100 score showing how well you're represented across all AI engines, weighted by importance."
                  />
                </div>
              </section>

              <section>
                <h3 className="text-lg font-semibold mb-3 text-[#e0a458]">Getting Started</h3>
                <ol className="space-y-3 text-sm leading-relaxed opacity-90">
                  <li className="flex gap-3">
                    <span className="flex-shrink-0 w-6 h-6 rounded-full bg-[#1c4c8a] text-white flex items-center justify-center text-xs font-semibold">1</span>
                    <span><strong>Set up your brand:</strong> Add your business name variations so Radar knows what to look for.</span>
                  </li>
                  <li className="flex gap-3">
                    <span className="flex-shrink-0 w-6 h-6 rounded-full bg-[#1c4c8a] text-white flex items-center justify-center text-xs font-semibold">2</span>
                    <span><strong>Add competitors:</strong> Track 3–5 competitors to see how you compare.</span>
                  </li>
                  <li className="flex gap-3">
                    <span className="flex-shrink-0 w-6 h-6 rounded-full bg-[#1c4c8a] text-white flex items-center justify-center text-xs font-semibold">3</span>
                    <span><strong>Choose queries:</strong> AI generates suggestions based on your market. Select the ones that matter most.</span>
                  </li>
                  <li className="flex gap-3">
                    <span className="flex-shrink-0 w-6 h-6 rounded-full bg-[#1c4c8a] text-white flex items-center justify-center text-xs font-semibold">4</span>
                    <span><strong>Run your first check:</strong> Radar scans all 8 AI engines and builds your dashboard.</span>
                  </li>
                </ol>
              </section>

              <section>
                <h3 className="text-lg font-semibold mb-2 text-[#e0a458]">Upgrade Plans</h3>
                <p className="text-sm leading-relaxed opacity-90">
                  Pro includes 25 queries and monthly monitoring. Upgrade to Silver, Gold, or Platinum
                  for more queries, manual checks, website audits, and weekly monitoring.
                </p>
              </section>

            </div>
          </DialogBody>

          <DialogFooter>
            <Button
              variant="outline"
              className="w-full"
              onClick={() => onOpenChange(false)}
            >
              Got it
            </Button>
          </DialogFooter>
        </DialogContent>
      </div>
    </Dialog>
  );
}

function FeatureCard({ icon: Icon, title, description }: { icon: React.ElementType; title: string; description: string }) {
  return (
    <div className="rounded-lg border bg-card/50 p-3">
      <Icon className="h-4 w-4 text-[#e0a458] mb-2" />
      <h4 className="text-sm font-semibold mb-1">{title}</h4>
      <p className="text-xs text-muted-foreground leading-relaxed">{description}</p>
    </div>
  );
}
