"use client";

import { useEffect, useState } from "react";
import { Sparkles, Loader2 } from "lucide-react";
import type { HlSegment } from "@/types/hyperlocal";

// ============================================================
// Live progress for the Generate phase.
//
// Polling already runs from run-client (3s interval). We read
// the live count from hl_emails (passed in via emailsCount) NOT
// run.emails_drafted — the latter is only written once at the
// very end of the generate function, so it jumps 0 → N. Counting
// emails directly gives a tick-up-as-they-land progress bar.
//
// Rotating headline keeps the 1-3 minute wait from feeling like
// a dead spinner — gives the page a sense of life.
// ============================================================

// Real-estate-flavored rotating messages. Tone: dry, knowing, a
// little bit at AI's expense. New entries welcome — keep them to
// a single line under ~80 chars so the layout doesn't reflow.
const WITTY_MESSAGES = [
  "Teaching AI to write like an agent who actually knows the comps",
  "Translating median DOM into 'your buyers should know this'",
  "Convincing AI that \"lots of inventory\" isn't a real quote",
  "Composing the dual-perspective seller/buyer pitch",
  "Wrapping cold MLS data in your brand colors",
  "Pulling neighborhood vibes from raw transaction history",
  "Helping AI sound less like Zillow, more like you",
  "Negotiating exclamation-mark count (the answer is zero)",
  "Reminding AI that \"cute\" isn't a market analysis term",
  "Asking AI to channel its inner top producer",
  "Turning 0.976 list-to-sale ratio into something a human would read aloud",
  "Making median sale price sound interesting",
  "Threading the needle between 'data-driven' and 'still readable'",
  "Teaching AI that \"charming\" usually just means \"small\"",
  "Stopping AI from using \"stunning\" three times in one paragraph",
  "Replacing \"luxury\" with something buyers might actually believe",
  "Refusing to let any email open with \"In today's market…\"",
  "Reminding AI that real estate isn't synonyms for \"investment opportunity\"",
  "Calculating whether 14 days on market reads as \"fast\" or \"concerning\"",
  "Telling AI that a 1990s ranch is not \"mid-century\"",
  "Quietly deleting the word \"nestled\"",
  "Avoiding the phrase \"motivated seller\" by mutual agreement",
  "Translating square footage into \"feels like home\"",
  "Coaching AI on the difference between \"starter\" and \"fixer-upper\"",
  "Eradicating every instance of \"must-see\"",
  "Reminding AI that homeowners don't need a buydown explainer today",
  "Debating whether \"open floor plan\" still impresses anyone",
  "Making sure the headline doesn't mention the Fed",
  "Banning sentences that begin with \"Looking to…\"",
  "Insisting that \"vibes\" and \"rigorous analysis\" can coexist",
  "Halving every comma, then halving them again",
  "Converting \"97.6% list-to-sale\" into \"homes here sell at near full price\"",
  "Asking AI to write like the agent's smartest client deserves",
  "Removing the phrase \"in the current real estate landscape\"",
  "Coaching AI on local geography, not just ZIP code numbers",
  "Confirming no email starts with \"Hope this finds you well\"",
  "Teaching AI that 1,847 sq ft means different things in different cities",
  "Translating \"median DOM under 30\" into \"houses don't sit\"",
  "Negotiating with AI on how many bullet points make a \"report\"",
  "Helping AI distinguish \"great schools\" claims that hold up",
  "Convincing AI not to compare your neighborhood to \"the new Brooklyn\"",
  "Replacing \"diverse housing stock\" with concrete examples",
  "Reminding AI that homeowners care about THEIR ZIP, not the metro",
  "Turning quarterly trends into something Q4 buyers can use",
  "Skipping the \"as your trusted real estate advisor\" line entirely",
  "Removing every dash that thinks it's a comma",
  "Reminding AI that homeowners already know what a kitchen is",
  "Distinguishing \"Brentwood\" from \"Brentwood Hills\" (locally significant)",
  "Pairing buyer-side stats with seller-side so nobody feels left out",
  "Asking AI to remember which ZIP it's writing about between paragraphs",
];

function useRotatingMessage(intervalMs = 4000): string {
  const [idx, setIdx] = useState(() =>
    Math.floor(Math.random() * WITTY_MESSAGES.length),
  );
  useEffect(() => {
    const id = setInterval(() => {
      // Pick a different one each time so we never repeat back-to-back.
      setIdx((prev) => {
        let next = Math.floor(Math.random() * WITTY_MESSAGES.length);
        if (next === prev && WITTY_MESSAGES.length > 1) {
          next = (prev + 1) % WITTY_MESSAGES.length;
        }
        return next;
      });
    }, intervalMs);
    return () => clearInterval(id);
  }, [intervalMs]);
  return WITTY_MESSAGES[idx];
}

export function GenerateProgress({
  segments,
  emailsCount,
}: {
  segments: HlSegment[];
  /** Live count of drafted emails for this run, from hl_emails. */
  emailsCount: number;
}) {
  const headline = useRotatingMessage(6000);
  // Total = segments we'd actually write a draft for (ready status).
  // Sub-threshold segments are not in scope so don't pad the denom.
  const targetCount = segments.filter(
    (s) => !s.below_min_size && s.status === "ready",
  ).length;
  const drafted = emailsCount;
  const pct = targetCount > 0 ? Math.min(100, Math.round((drafted / targetCount) * 100)) : 0;
  const remaining = Math.max(0, targetCount - drafted);

  return (
    <div className="rounded-lg border border-border bg-card p-6 sm:p-8 text-center flex flex-col justify-center gap-5 h-full min-h-[460px]">
      <div className="flex items-center justify-center gap-2 min-h-[1.75rem] px-2">
        <Loader2 className="h-5 w-5 text-primary animate-spin shrink-0" />
        <p
          key={headline}
          className="text-sm font-semibold text-foreground animate-in fade-in duration-500"
        >
          {headline}
        </p>
      </div>

      <div className="flex flex-col items-center gap-2">
        <Sparkles className="h-8 w-8 text-primary/60" />
        <p className="text-4xl sm:text-5xl font-bold tabular-nums text-foreground">
          {drafted}
          <span className="text-muted-foreground/40 text-2xl"> / {targetCount}</span>
        </p>
        <p className="text-xs text-muted-foreground">
          drafts written · {remaining} remaining
        </p>
      </div>

      {/* Progress bar */}
      <div className="max-w-md mx-auto">
        <div className="h-1.5 rounded-full bg-muted overflow-hidden">
          <div
            className="h-full bg-primary transition-all duration-500 ease-out"
            style={{ width: `${pct}%` }}
          />
        </div>
        <p className="text-[11px] text-muted-foreground mt-2">
          AI is composing per-segment market reports with your real MLS
          numbers. Usually 1–3 minutes for 10 segments — scales linearly.
        </p>
      </div>
    </div>
  );
}
