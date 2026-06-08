"use client";

import { useRouter } from "next/navigation";
import {
  CheckCircle2,
  Mail,
  Database,
  ArrowRight,
} from "lucide-react";
import { Button } from "@/components/ui/button";

// ============================================================
// Hyperlocal onboarding gate.
//
// Sender identity, brokerage, and brand visuals are owned by the
// unified Profile (/apps/profile) and shared across every AiM app.
// All this screen needs to do is gate access to the dashboard on
// the two Hyperlocal-specific connections: a sending account
// (required) and a CRM (optional — CSV-per-run is an alternative).
//
// Name kept as `OnboardingChat` so existing imports don't break;
// the chat-style intake it used to ship was deleted in favor of
// editing the Profile directly.
// ============================================================

export function OnboardingChat({
  hasEmail,
  hasCrm,
}: {
  hasEmail: boolean;
  hasCrm: boolean;
}) {
  const router = useRouter();
  const headline =
    hasEmail && hasCrm
      ? "Everything's wired up"
      : hasEmail
        ? "Sender ready"
        : "Sender ready";
  const subline =
    hasEmail && hasCrm
      ? "Sending account verified, CRM connected. Head to the dashboard to run your first campaign."
      : hasEmail
        ? "You're set up to send. Connect a CRM whenever you want to automate contact pulls."
        : "One more thing — connect a sending account and you can run your first campaign.";

  return (
    <div className="container max-w-2xl mx-auto px-4 py-12">
      <div className="rounded-lg border border-border bg-card p-8 space-y-6">
        <div className="flex items-center gap-2">
          <CheckCircle2 className="h-5 w-5 text-emerald-500" />
          <h1 className="text-xl font-semibold">{headline}</h1>
        </div>
        <p className="text-sm text-muted-foreground">{subline}</p>

        <div className="space-y-3">
          <ConnectTile
            icon={<Mail className="h-5 w-5" />}
            title={hasEmail ? "Email connected" : "Connect a sending account"}
            description="Resend (BYO API key). Emails send from your own verified domain."
            cta={hasEmail ? "Manage email" : "Go to email settings"}
            href="/apps/hyperlocal/settings?tab=email"
            done={hasEmail}
          />
          <ConnectTile
            icon={<Database className="h-5 w-5" />}
            title={hasCrm ? "CRM connected" : "Connect a CRM"}
            description="Pull contacts automatically from Follow Up Boss, Lofty, Sierra, BoldTrail, CINC, Cloze, or GoHighLevel — or upload a CSV per run."
            cta={hasCrm ? "Manage CRM" : "Go to CRM settings"}
            href="/apps/hyperlocal/settings?tab=crm"
            done={hasCrm}
            optional
          />
        </div>

        <div className="flex justify-end items-center pt-4 border-t border-border">
          <Button
            onClick={() => router.push("/apps/hyperlocal/dashboard")}
            className="bg-[#E11D48] hover:bg-[#BE123C]"
          >
            {hasEmail ? "Go to dashboard" : "Skip for now"}
            <ArrowRight className="h-4 w-4 ml-2" />
          </Button>
        </div>
      </div>
    </div>
  );
}

function ConnectTile({
  icon,
  title,
  description,
  cta,
  href,
  done,
  optional,
}: {
  icon: React.ReactNode;
  title: string;
  description: string;
  cta: string;
  href: string;
  done?: boolean;
  optional?: boolean;
}) {
  return (
    <a
      href={href}
      className="flex items-start gap-3 rounded-lg border border-border bg-background p-4 hover:bg-muted/40 transition-colors"
    >
      <span
        className={`flex items-center justify-center w-9 h-9 rounded-md ${
          done
            ? "bg-emerald-500/10 text-emerald-500"
            : "bg-[#F43F5E]/10 text-[#F43F5E]"
        } shrink-0`}
      >
        {done ? <CheckCircle2 className="h-5 w-5" /> : icon}
      </span>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <p className="text-sm font-semibold">{title}</p>
          {optional && (
            <span className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground bg-muted px-1.5 py-0.5 rounded">
              Optional
            </span>
          )}
        </div>
        <p className="text-xs text-muted-foreground mt-0.5">{description}</p>
      </div>
      <span className="text-xs text-muted-foreground self-center shrink-0">
        {cta} →
      </span>
    </a>
  );
}
