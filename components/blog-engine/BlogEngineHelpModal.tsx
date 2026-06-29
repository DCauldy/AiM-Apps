"use client";

import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogClose, DialogBody, DialogFooter } from "../ui/dialog";
import { Button } from "../ui/button";
import { Search, FileText, PenTool, Image, Globe, Clock, MessageSquare, Lightbulb } from "lucide-react";

interface BlogEngineHelpModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function BlogEngineHelpModal({ open, onOpenChange }: BlogEngineHelpModalProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <div className="rotating-gradient-border-wrapper relative">
        <DialogContent className="max-w-2xl max-h-[90vh] flex flex-col m-0 !rounded-[calc(0.5rem-3px)] !shadow-none relative z-10 bg-background">
          <DialogHeader>
            <div className="flex items-center justify-between w-full">
              <DialogTitle className="text-2xl font-bold text-foreground">How to use Blog Engine</DialogTitle>
              <DialogClose onClose={() => onOpenChange(false)} />
            </div>
          </DialogHeader>

          <DialogBody className="overflow-y-auto">
            <div className="space-y-6 text-foreground">

              {/* What is Blog Engine */}
              <section>
                <h3 className="text-lg font-semibold mb-2 text-primary">What is Blog Engine?</h3>
                <p className="text-sm leading-relaxed opacity-90">
                  Blog Engine automatically generates high-quality, bottom-of-funnel (BOFU) blog posts
                  tailored to your real estate market. Topics are researched, scored for buyer/seller intent,
                  written by AI, and published to your website — all on autopilot.
                </p>
              </section>

              {/* How it works */}
              <section>
                <h3 className="text-lg font-semibold mb-3 text-primary">How it works</h3>
                <ol className="space-y-3 text-sm leading-relaxed opacity-90">
                  <li className="flex gap-3">
                    <span className="flex-shrink-0 w-6 h-6 rounded-full bg-[#1C4C8A] text-white flex items-center justify-center text-xs font-semibold">1</span>
                    <span><strong>Topics discovered:</strong> Blog Engine researches your market, neighborhoods, and specializations to find relevant topics real buyers and sellers are searching for.</span>
                  </li>
                  <li className="flex gap-3">
                    <span className="flex-shrink-0 w-6 h-6 rounded-full bg-[#1C4C8A] text-white flex items-center justify-center text-xs font-semibold">2</span>
                    <span><strong>Scored for BOFU intent:</strong> Each topic is scored on buyer/seller intent, local relevance, competition, and freshness. Higher scores mean higher conversion potential.</span>
                  </li>
                  <li className="flex gap-3">
                    <span className="flex-shrink-0 w-6 h-6 rounded-full bg-[#1C4C8A] text-white flex items-center justify-center text-xs font-semibold">3</span>
                    <span><strong>Written by AI:</strong> A full blog post is generated with SEO metadata, schema markup, internal links, and a featured image — all optimized for your brand voice.</span>
                  </li>
                  <li className="flex gap-3">
                    <span className="flex-shrink-0 w-6 h-6 rounded-full bg-[#1C4C8A] text-white flex items-center justify-center text-xs font-semibold">4</span>
                    <span><strong>Published to your CMS:</strong> Blogs are sent to WordPress or via webhook. You can review before publishing or let them go live automatically.</span>
                  </li>
                </ol>
              </section>

              {/* Topic Bank */}
              <section>
                <h3 className="text-lg font-semibold mb-3 text-primary">Topic Bank</h3>
                <div className="space-y-3">
                  <div className="flex gap-3 p-3 rounded-lg bg-muted hover:bg-accent transition-colors">
                    <Search className="h-5 w-5 text-foreground flex-shrink-0 mt-0.5" />
                    <div>
                      <h4 className="font-medium text-sm mb-1">Discovery</h4>
                      <p className="text-xs opacity-70">Topics are automatically discovered based on your profile — market area, specializations, and target clients. When your topic bank runs low, new topics are researched during the next blog generation.</p>
                    </div>
                  </div>
                  <div className="flex gap-3 p-3 rounded-lg bg-muted hover:bg-accent transition-colors">
                    <FileText className="h-5 w-5 text-foreground flex-shrink-0 mt-0.5" />
                    <div>
                      <h4 className="font-medium text-sm mb-1">BOFU Scores</h4>
                      <p className="text-xs opacity-70">Each topic gets a BOFU score (0–100) based on buyer/seller intent, local relevance, keyword competition, content freshness, and market fit. Higher scores indicate topics more likely to convert visitors into leads.</p>
                    </div>
                  </div>
                  <div className="flex gap-3 p-3 rounded-lg bg-muted hover:bg-accent transition-colors">
                    <PenTool className="h-5 w-5 text-foreground flex-shrink-0 mt-0.5" />
                    <div>
                      <h4 className="font-medium text-sm mb-1">Prioritize & Skip</h4>
                      <p className="text-xs opacity-70">Drag topics to reorder your write priority — the topic at the top of your list gets written next. Skip topics you don&apos;t want, and they won&apos;t be selected by the pipeline.</p>
                    </div>
                  </div>
                </div>
              </section>

              {/* Blog Pipeline */}
              <section>
                <h3 className="text-lg font-semibold mb-3 text-primary">Blog Pipeline</h3>
                <div className="flex gap-3 p-3 rounded-lg bg-muted hover:bg-accent transition-colors">
                  <Globe className="h-5 w-5 text-foreground flex-shrink-0 mt-0.5" />
                  <div>
                    <h4 className="font-medium text-sm mb-1">What happens when you click &ldquo;Write&rdquo;</h4>
                    <p className="text-xs opacity-70">The pipeline runs through several steps: topic research, BOFU scoring, AI writing, SEO metadata generation, featured image creation, and CMS publishing. You can track progress in real-time from the dashboard.</p>
                  </div>
                </div>
              </section>

              {/* Refining Blogs */}
              <section>
                <h3 className="text-lg font-semibold mb-3 text-primary">Refining Blogs</h3>
                <div className="flex gap-3 p-3 rounded-lg bg-muted hover:bg-accent transition-colors">
                  <MessageSquare className="h-5 w-5 text-foreground flex-shrink-0 mt-0.5" />
                  <div>
                    <h4 className="font-medium text-sm mb-1">Chat Refinement</h4>
                    <p className="text-xs opacity-70">Open any blog and use the refinement chat to make changes — adjust tone, add details, restructure sections, or rewrite paragraphs. Each version is saved so you can compare. When you&apos;re satisfied, click &ldquo;Sync to CMS&rdquo; to push updates to your website.</p>
                  </div>
                </div>
              </section>

              {/* Scheduling */}
              <section>
                <h3 className="text-lg font-semibold mb-3 text-primary">Scheduling</h3>
                <div className="flex gap-3 p-3 rounded-lg bg-muted hover:bg-accent transition-colors">
                  <Clock className="h-5 w-5 text-foreground flex-shrink-0 mt-0.5" />
                  <div>
                    <h4 className="font-medium text-sm mb-1">Automated Publishing</h4>
                    <p className="text-xs opacity-70">Set your weekly publishing schedule — choose which days and how many blogs per week. Blog Engine checks hourly and automatically generates blogs on your scheduled days. Usage resets each Monday.</p>
                  </div>
                </div>
              </section>

              {/* CMS Connection */}
              <section>
                <h3 className="text-lg font-semibold mb-3 text-primary">CMS Connection</h3>
                <div className="flex gap-3 p-3 rounded-lg bg-muted hover:bg-accent transition-colors">
                  <Globe className="h-5 w-5 text-foreground flex-shrink-0 mt-0.5" />
                  <div>
                    <h4 className="font-medium text-sm mb-1">WordPress & Webhooks</h4>
                    <p className="text-xs opacity-70">Connect your WordPress site for automatic publishing with SEO plugin support (Yoast, Rank Math). Or use a webhook to integrate with Squarespace, custom sites, or any platform that accepts HTTP POST requests. Configure your connection in Settings.</p>
                  </div>
                </div>
              </section>

              {/* Tips */}
              <section>
                <h3 className="text-lg font-semibold mb-3 text-primary">Tips for Best Results</h3>
                <div className="flex gap-3 p-3 rounded-lg bg-muted hover:bg-accent transition-colors">
                  <Lightbulb className="h-5 w-5 text-foreground flex-shrink-0 mt-0.5" />
                  <div>
                    <ul className="space-y-2 text-xs opacity-70 list-disc list-inside">
                      <li><strong>Review before publishing</strong> — auto-generated blogs are high quality but a quick review ensures accuracy for your market.</li>
                      <li><strong>Use the refinement chat</strong> — it&apos;s the fastest way to adjust tone, add local details, or restructure content.</li>
                      <li><strong>Reorder your topics</strong> — drag your most important topics to the top so they get written first.</li>
                      <li><strong>Keep your profile up to date</strong> — the more detail in your profile (neighborhoods, specializations, CTAs), the better your blogs will be.</li>
                      <li><strong>Skip irrelevant topics</strong> — this helps the AI learn what works for your market.</li>
                      <li><strong>Check your topic bank</strong> — when it runs low, new topics are discovered automatically on the next run.</li>
                    </ul>
                  </div>
                </div>
              </section>

            </div>
          </DialogBody>

          <DialogFooter>
            <Button
              onClick={() => onOpenChange(false)}
              className="!bg-[#1C4C8A] !text-white hover:!bg-[#183f73]"
            >
              Got it!
            </Button>
          </DialogFooter>
        </DialogContent>
      </div>
    </Dialog>
  );
}
