"use client";

import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogClose, DialogBody, DialogFooter } from "./dialog";
import { Button } from "./button";
import { Sparkles, Brain, Search, User, Video, Mic, Image, FileText, History, Shuffle } from "lucide-react";

interface HowToUseModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function HowToUseModal({ open, onOpenChange }: HowToUseModalProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <div className="rotating-gradient-border-wrapper relative">
        <DialogContent className="max-w-2xl max-h-[90vh] flex flex-col m-0 !rounded-[calc(0.5rem-3px)] !shadow-none relative z-10 bg-background">
          <DialogHeader>
            <div className="flex items-center justify-between w-full">
              <DialogTitle className="text-2xl font-bold text-foreground">How to use Prompt Studio</DialogTitle>
              <DialogClose onClose={() => onOpenChange(false)} />
            </div>
          </DialogHeader>

          <DialogBody className="overflow-y-auto">
            <div className="space-y-6 text-foreground">

              {/* What is Prompt Studio */}
              <section>
                <h3 className="text-lg font-semibold mb-2 text-primary">What is Prompt Studio?</h3>
                <p className="text-sm leading-relaxed opacity-90">
                  Prompt Studio transforms your rough idea into a polished, ready-to-use AI prompt.
                  Describe what you want, answer a few smart questions, and get a professionally
                  engineered prompt optimized for ChatGPT, Claude, Gemini, and more — in seconds.
                </p>
              </section>

              {/* How it works */}
              <section>
                <h3 className="text-lg font-semibold mb-3 text-primary">How it works</h3>
                <ol className="space-y-3 text-sm leading-relaxed opacity-90">
                  <li className="flex gap-3">
                    <span className="flex-shrink-0 w-6 h-6 rounded-full bg-[#1C4C8A] text-white flex items-center justify-center text-xs font-semibold">1</span>
                    <span><strong>Describe your need:</strong> Type your rough idea — or use the microphone to dictate it. Be as brief or detailed as you like. A first draft generates automatically in the right panel while your questions load.</span>
                  </li>
                  <li className="flex gap-3">
                    <span className="flex-shrink-0 w-6 h-6 rounded-full bg-[#1C4C8A] text-white flex items-center justify-center text-xs font-semibold">2</span>
                    <span><strong>Answer the clarifying questions:</strong> 3–5 smart questions appear one at a time in the left panel. Select from preset options or add your own. Progress dots turn green as you answer each one. Your answers are saved automatically.</span>
                  </li>
                  <li className="flex gap-3">
                    <span className="flex-shrink-0 w-6 h-6 rounded-full bg-[#1C4C8A] text-white flex items-center justify-center text-xs font-semibold">3</span>
                    <span><strong>Click Improve Prompt:</strong> Your answers are applied to generate a refined, professional prompt that streams live into the right panel.</span>
                  </li>
                  <li className="flex gap-3">
                    <span className="flex-shrink-0 w-6 h-6 rounded-full bg-[#1C4C8A] text-white flex items-center justify-center text-xs font-semibold">4</span>
                    <span><strong>Copy and use it:</strong> Hit Copy to grab your prompt. Bookmark it to save it, publish it to the community library, or keep refining with another round.</span>
                  </li>
                </ol>
              </section>

              {/* Left Panel Tabs */}
              <section>
                <h3 className="text-lg font-semibold mb-3 text-primary">Left Panel Tabs</h3>
                <div className="space-y-3">
                  <div className="flex gap-3 p-3 rounded-lg bg-muted hover:bg-accent transition-colors">
                    <Sparkles className="h-5 w-5 text-foreground flex-shrink-0 mt-0.5" />
                    <div>
                      <h4 className="font-medium text-sm mb-1">Inputs</h4>
                      <p className="text-xs opacity-70">Your lazy prompt and auto-generated questions live here. Answer questions using preset options or your own custom text. Questions and answers are saved automatically — they'll still be here after a page refresh.</p>
                    </div>
                  </div>
                  <div className="flex gap-3 p-3 rounded-lg bg-muted hover:bg-accent transition-colors">
                    <FileText className="h-5 w-5 text-foreground flex-shrink-0 mt-0.5" />
                    <div>
                      <h4 className="font-medium text-sm mb-1">Context</h4>
                      <p className="text-xs opacity-70">Add extra background that should shape the prompt — your tone, target audience, word count limits, or anything specific to your market or brand. This context is included every time you refine.</p>
                    </div>
                  </div>
                  <div className="flex gap-3 p-3 rounded-lg bg-muted hover:bg-accent transition-colors">
                    <History className="h-5 w-5 text-foreground flex-shrink-0 mt-0.5" />
                    <div>
                      <h4 className="font-medium text-sm mb-1">Versions</h4>
                      <p className="text-xs opacity-70">Every time you click Improve Prompt, a new version is saved. Switch between versions at any time to compare results or pick up from an earlier draft without losing your work.</p>
                    </div>
                  </div>
                </div>
              </section>

              {/* Tools */}
              <section>
                <h3 className="text-lg font-semibold mb-3 text-primary">Available Tools</h3>
                <div className="space-y-3">
                  <div className="flex gap-3 p-3 rounded-lg bg-muted hover:bg-accent transition-colors">
                    <Mic className="h-5 w-5 text-foreground flex-shrink-0 mt-0.5" />
                    <div>
                      <h4 className="font-medium text-sm mb-1">Voice Dump</h4>
                      <p className="text-xs opacity-70">Rather than typing, click the microphone icon in the prompt input to record your idea. Your voice is transcribed automatically using OpenAI Whisper. Great for brain-dumping a listing description or marketing idea on the go.</p>
                    </div>
                  </div>
                  <div className="flex gap-3 p-3 rounded-lg bg-muted hover:bg-accent transition-colors">
                    <Sparkles className="h-5 w-5 text-foreground flex-shrink-0 mt-0.5" />
                    <div>
                      <h4 className="font-medium text-sm mb-1">Prompt Type Selector</h4>
                      <p className="text-xs opacity-70">The prompt type is auto-detected from your description, but you can override it manually. Each type uses a specialized system prompt tuned for that output format and use case.</p>
                    </div>
                  </div>
                  <div className="flex gap-3 p-3 rounded-lg bg-muted hover:bg-accent transition-colors">
                    <Shuffle className="h-5 w-5 text-foreground flex-shrink-0 mt-0.5" />
                    <div>
                      <h4 className="font-medium text-sm mb-1">What's Next Suggestions</h4>
                      <p className="text-xs opacity-70">After each refinement, two suggestions appear below your prompt — a logical "Try Next" follow-up and a "Wild Card" creative direction. Click "Start Prompt" on either to jump straight into a new session.</p>
                    </div>
                  </div>
                </div>
              </section>

              {/* Prompt Types */}
              <section>
                <h3 className="text-lg font-semibold mb-3 text-primary">Prompt Types</h3>
                <div className="space-y-3">
                  <div className="flex gap-3 p-3 rounded-lg bg-muted hover:bg-accent transition-colors">
                    <Sparkles className="h-5 w-5 text-foreground flex-shrink-0 mt-0.5" />
                    <div>
                      <h4 className="font-medium text-sm mb-1">Standard</h4>
                      <p className="text-xs opacity-70">General-purpose prompt engineering. Best for most real estate marketing, copywriting, and business tasks.</p>
                    </div>
                  </div>
                  <div className="flex gap-3 p-3 rounded-lg bg-muted hover:bg-accent transition-colors">
                    <Brain className="h-5 w-5 text-foreground flex-shrink-0 mt-0.5" />
                    <div>
                      <h4 className="font-medium text-sm mb-1">Reasoning</h4>
                      <p className="text-xs opacity-70">Optimized for logical analysis, multi-step problem solving, and strategic thinking tasks.</p>
                    </div>
                  </div>
                  <div className="flex gap-3 p-3 rounded-lg bg-muted hover:bg-accent transition-colors">
                    <Search className="h-5 w-5 text-foreground flex-shrink-0 mt-0.5" />
                    <div>
                      <h4 className="font-medium text-sm mb-1">Deep Research</h4>
                      <p className="text-xs opacity-70">For market research, neighborhood analysis, and data-driven prompts that require multi-source verification and citations.</p>
                    </div>
                  </div>
                  <div className="flex gap-3 p-3 rounded-lg bg-muted hover:bg-accent transition-colors">
                    <User className="h-5 w-5 text-foreground flex-shrink-0 mt-0.5" />
                    <div>
                      <h4 className="font-medium text-sm mb-1">Custom GPT / Agent</h4>
                      <p className="text-xs opacity-70">Build system prompts for your own Custom GPTs or AI agents — great for creating a branded real estate assistant.</p>
                    </div>
                  </div>
                  <div className="flex gap-3 p-3 rounded-lg bg-muted hover:bg-accent transition-colors">
                    <Video className="h-5 w-5 text-foreground flex-shrink-0 mt-0.5" />
                    <div>
                      <h4 className="font-medium text-sm mb-1">Video</h4>
                      <p className="text-xs opacity-70">Prompts for AI video tools like Veo, Runway, Kling, and Pika — property tours, neighborhood reels, and social content.</p>
                    </div>
                  </div>
                  <div className="flex gap-3 p-3 rounded-lg bg-muted hover:bg-accent transition-colors">
                    <Mic className="h-5 w-5 text-foreground flex-shrink-0 mt-0.5" />
                    <div>
                      <h4 className="font-medium text-sm mb-1">Voice / Audio</h4>
                      <p className="text-xs opacity-70">For ElevenLabs, TTS, and voice generation platforms. Outputs XML/SSML-formatted prompts for natural-sounding audio.</p>
                    </div>
                  </div>
                  <div className="flex gap-3 p-3 rounded-lg bg-muted hover:bg-accent transition-colors">
                    <Image className="h-5 w-5 text-foreground flex-shrink-0 mt-0.5" />
                    <div>
                      <h4 className="font-medium text-sm mb-1">Image</h4>
                      <p className="text-xs opacity-70">Optimized for AI image generation tools. Uses photography terminology — aperture, lighting, composition — for detailed, high-quality results.</p>
                    </div>
                  </div>
                </div>
              </section>

              {/* Best Practices */}
              <section>
                <h3 className="text-lg font-semibold mb-3 text-primary">Tips for Best Results</h3>
                <ul className="space-y-2 text-sm leading-relaxed opacity-90 list-disc list-inside">
                  <li><strong>Don't overthink the lazy prompt</strong> — a rough sentence is enough. The questions do the heavy lifting.</li>
                  <li><strong>Answer all the questions</strong> — even partial answers significantly improve the output. Green dots show your progress.</li>
                  <li><strong>Use the Context tab</strong> for anything that applies to multiple prompts — your brand voice, target audience, or market area.</li>
                  <li><strong>Use Versions</strong> to compare results from different sets of answers without losing your previous work.</li>
                  <li><strong>Let the type auto-detect</strong> — Prompt Studio usually picks the right one. Override it manually if you know what you need.</li>
                  <li><strong>Explore Wild Card suggestions</strong> — they often surface creative AI use cases you wouldn't think to ask for.</li>
                </ul>
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
