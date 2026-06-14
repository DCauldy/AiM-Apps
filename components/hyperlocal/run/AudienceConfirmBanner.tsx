"use client";

import { useEffect, useState } from "react";
import { Users, Loader2, AlertCircle, CheckCircle2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useHlToast } from "@/components/hyperlocal/use-hl-toast";

// ============================================================
// Awaiting-audience-confirmation banner — surfaces when a campaign-mode
// run (Mailchimp etc.) needs the agent to approve adding new contacts
// to their ESP audience (which affects their ESP billing).
//
// On mount, GETs /audience-confirm for the bucketing diff. Two actions:
//   - Approve and send → POST action=approve, full send happens
//   - Send only to subscribed → POST action=skip_new, new contacts skipped
// ============================================================

interface PreviewResponse {
  audience_name: string | null;
  bucketing: {
    subscribed: number;
    unsubscribed: number;
    cleaned: number;
    pending: number;
    not_found: number;
  };
  new_contacts: string[];
}

export function AudienceConfirmBanner({
  runId,
  onResolved,
}: {
  runId: string;
  onResolved: () => void;
}) {
  const toast = useHlToast();
  const [preview, setPreview] = useState<PreviewResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState<"approve" | "skip_new" | null>(null);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const res = await fetch(
          `/api/apps/hyperlocal/runs/${runId}/audience-confirm`,
        );
        const json = await res.json();
        if (!cancelled) {
          if (res.ok) setPreview(json);
          else toast.error(json.error ?? "Couldn't load audience diff");
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [runId]);

  const submit = async (action: "approve" | "skip_new") => {
    setSubmitting(action);
    try {
      const res = await fetch(
        `/api/apps/hyperlocal/runs/${runId}/audience-confirm`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ action }),
        },
      );
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "Action failed");
      toast.success(
        action === "approve"
          ? "Audience updated and campaign sent"
          : "Campaign sent — new contacts skipped",
      );
      onResolved();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Action failed");
    } finally {
      setSubmitting(null);
    }
  };

  if (loading) {
    return (
      <div className="rounded-lg border border-border bg-card p-6 flex items-center gap-3 text-sm text-muted-foreground">
        <Loader2 className="h-4 w-4 animate-spin" />
        Checking audience…
      </div>
    );
  }

  if (!preview) return null;

  const newCount = preview.bucketing.not_found;
  const subscribedCount = preview.bucketing.subscribed;
  const audience = preview.audience_name ?? "your audience";

  return (
    <div className="rounded-lg border border-amber-500/30 bg-amber-500/5 p-5 space-y-4">
      <div className="flex items-start gap-3">
        <Users className="h-5 w-5 text-amber-500 shrink-0 mt-0.5" />
        <div className="flex-1 min-w-0">
          <h3 className="text-sm font-semibold">Confirm audience changes</h3>
          <p className="text-xs text-muted-foreground mt-1 leading-relaxed">
            We checked your recipient list against <strong>{audience}</strong>.
          </p>
        </div>
      </div>

      <ul className="text-xs space-y-1.5 pl-8">
        <li className="flex items-center gap-2">
          <CheckCircle2 className="h-3.5 w-3.5 text-emerald-500" />
          <span><strong className="text-foreground">{subscribedCount}</strong> already subscribed — will be sent the campaign</span>
        </li>
        {newCount > 0 && (
          <li className="flex items-center gap-2">
            <AlertCircle className="h-3.5 w-3.5 text-amber-500" />
            <span>
              <strong className="text-foreground">{newCount}</strong> not in audience yet — adding them <em>may affect your ESP plan</em>
            </span>
          </li>
        )}
        {preview.bucketing.unsubscribed > 0 && (
          <li className="text-muted-foreground">
            {preview.bucketing.unsubscribed} previously unsubscribed — will be skipped
          </li>
        )}
        {preview.bucketing.cleaned > 0 && (
          <li className="text-muted-foreground">
            {preview.bucketing.cleaned} flagged as undeliverable — will be skipped
          </li>
        )}
        {preview.bucketing.pending > 0 && (
          <li className="text-muted-foreground">
            {preview.bucketing.pending} pending double-opt-in — will be skipped
          </li>
        )}
      </ul>

      {newCount > 0 && preview.new_contacts.length > 0 && preview.new_contacts.length <= 12 && (
        <details className="text-xs pl-8">
          <summary className="cursor-pointer text-muted-foreground hover:text-foreground">
            Show the {newCount} new contacts
          </summary>
          <ul className="mt-2 font-mono text-[11px] text-muted-foreground space-y-0.5 max-h-40 overflow-y-auto">
            {preview.new_contacts.map((e) => (
              <li key={e}>{e}</li>
            ))}
          </ul>
        </details>
      )}

      <div className="flex flex-wrap gap-2 justify-end pt-2 border-t border-amber-500/20">
        {newCount > 0 && (
          <Button
            variant="outline"
            size="sm"
            onClick={() => void submit("skip_new")}
            disabled={!!submitting}
          >
            {submitting === "skip_new" ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : (
              `Send only to ${subscribedCount} subscribed`
            )}
          </Button>
        )}
        <Button
          size="sm"
          onClick={() => void submit("approve")}
          disabled={!!submitting}
        >
          {submitting === "approve" ? (
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
          ) : newCount > 0 ? (
            `Add ${newCount} and send`
          ) : (
            "Send campaign"
          )}
        </Button>
      </div>
    </div>
  );
}
