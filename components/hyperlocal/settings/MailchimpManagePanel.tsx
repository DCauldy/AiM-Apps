"use client";

import { useEffect, useState } from "react";
import {
  Users,
  Loader2,
  CheckCircle2,
  AlertCircle,
  ShieldCheck,
  RefreshCw,
  Send,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useHlToast } from "@/components/hyperlocal/use-hl-toast";
import { PREVIEW_TEMPLATES } from "@/lib/hyperlocal/email/preview-templates";
import type { HlEmailConnection } from "@/types/hyperlocal";

// ============================================================
// Mailchimp connection management — replaces the generic webhook-config
// panel for Mailchimp connections (which auto-provision webhooks via
// OAuth). Surfaces account + audience picker + webhook status. Switching
// audience re-provisions the webhook on the new list.
// ============================================================

type ConnectionRow = HlEmailConnection & {
  webhook_secret_set?: boolean;
  provider_metadata?: {
    mailchimp?: {
      dc?: string;
      audience_id?: string;
      audience_name?: string;
      member_count?: number | null;
      webhook_id?: string | null;
      webhook_error?: string | null;
      login_name?: string;
    };
  } | null;
};

interface Audience {
  id: string;
  name: string;
  member_count: number | null;
}

export function MailchimpManagePanel({
  connection,
  onUpdated,
}: {
  connection: ConnectionRow;
  onUpdated: () => void;
}) {
  const toast = useHlToast();
  const meta = connection.provider_metadata?.mailchimp;
  const currentAudienceId = meta?.audience_id ?? null;
  const currentAudienceName = meta?.audience_name ?? null;
  const memberCount = meta?.member_count ?? null;
  const webhookOk = !!meta?.webhook_id;

  const [audiences, setAudiences] = useState<Audience[] | null>(null);
  const [loadingAudiences, setLoadingAudiences] = useState(false);
  const [switching, setSwitching] = useState(false);
  const [pendingAudienceId, setPendingAudienceId] = useState<string | null>(null);

  const [testTemplate, setTestTemplate] = useState<string>(PREVIEW_TEMPLATES[0].key);
  const [testTo, setTestTo] = useState<string>("");
  const [testing, setTesting] = useState(false);
  const [lastTestTo, setLastTestTo] = useState<string | null>(null);

  const loadAudiences = async () => {
    setLoadingAudiences(true);
    try {
      const res = await fetch(
        `/api/apps/hyperlocal/email-connections/${connection.id}/mailchimp/audiences`,
      );
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "Failed to load audiences");
      setAudiences(json.audiences ?? []);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to load audiences");
    } finally {
      setLoadingAudiences(false);
    }
  };

  useEffect(() => {
    void loadAudiences();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [connection.id]);

  const sendTest = async () => {
    if (!currentAudienceId) {
      toast.error("Pick an audience before sending a test.");
      return;
    }
    setTesting(true);
    try {
      const res = await fetch(
        `/api/apps/hyperlocal/email-connections/${connection.id}/mailchimp/test-send`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            template: testTemplate,
            ...(testTo.trim() ? { to_email: testTo.trim() } : {}),
          }),
        },
      );
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "Test send failed");
      // Track sent state in-panel as a secondary signal — toast can be
      // missed if the request takes a while and the user looks away.
      setLastTestTo(json.to);
      toast.success(
        `Test sent to ${json.to}`,
        "Check your inbox — Mailchimp prefixes test sends with [TEST].",
      );
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Test send failed");
    } finally {
      setTesting(false);
    }
  };

  const switchAudience = async (audienceId: string) => {
    if (audienceId === currentAudienceId) return;
    setSwitching(true);
    setPendingAudienceId(audienceId);
    try {
      const res = await fetch(
        `/api/apps/hyperlocal/email-connections/${connection.id}/mailchimp/audience`,
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ audience_id: audienceId }),
        },
      );
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "Switch failed");
      toast.success(
        json.webhook === "provisioned"
          ? `Switched to "${json.audience?.name}" — webhook re-provisioned`
          : `Switched to "${json.audience?.name}"${json.webhook_error ? ` (${json.webhook_error})` : ""}`,
      );
      onUpdated();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Switch failed");
    } finally {
      setSwitching(false);
      setPendingAudienceId(null);
    }
  };

  return (
    <div className="rounded-md border border-border p-3 space-y-4">
      <div className="flex items-center gap-2">
        <Users className="h-4 w-4 text-primary" />
        <h4 className="text-sm font-semibold">Mailchimp settings</h4>
      </div>

      {/* Account */}
      <div className="text-xs text-muted-foreground">
        Connected to{" "}
        <span className="text-foreground/90 font-medium">
          {meta?.login_name ?? "Mailchimp"}
        </span>{" "}
        ({connection.email_address})
        {meta?.dc && <span className="opacity-60"> · datacenter {meta.dc}</span>}
      </div>

      {/* Audience picker */}
      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <label className="text-xs font-medium">Audience</label>
          <button
            type="button"
            onClick={() => void loadAudiences()}
            className="text-[11px] text-muted-foreground hover:text-foreground inline-flex items-center gap-1"
            disabled={loadingAudiences}
          >
            {loadingAudiences ? (
              <Loader2 className="h-3 w-3 animate-spin" />
            ) : (
              <RefreshCw className="h-3 w-3" />
            )}
            Refresh
          </button>
        </div>

        {audiences && audiences.length > 0 ? (
          <Select
            value={pendingAudienceId ?? currentAudienceId ?? undefined}
            onValueChange={switchAudience}
            disabled={switching}
          >
            <SelectTrigger className="text-xs">
              <SelectValue placeholder="Pick an audience" />
            </SelectTrigger>
            <SelectContent>
              {audiences.map((a) => (
                <SelectItem key={a.id} value={a.id}>
                  {a.name}
                  {a.member_count != null && (
                    <span className="text-muted-foreground"> · {a.member_count.toLocaleString()} contacts</span>
                  )}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        ) : loadingAudiences ? (
          <p className="text-xs text-muted-foreground">Loading audiences…</p>
        ) : (
          <p className="text-xs text-muted-foreground">
            {currentAudienceName ?? "No audience selected"}
            {memberCount != null && (
              <span className="opacity-70"> · {memberCount.toLocaleString()} contacts</span>
            )}
          </p>
        )}

        {switching && (
          <p className="text-[11px] text-muted-foreground flex items-center gap-1">
            <Loader2 className="h-3 w-3 animate-spin" />
            Switching audience + re-provisioning webhook…
          </p>
        )}

        {audiences && audiences.length === 1 && (
          <p className="text-[11px] text-muted-foreground/80">
            Only one audience on this account. Add more at mailchimp.com →
            Audience → Manage Audience.
          </p>
        )}
      </div>

      {/* Webhook status */}
      <div className="flex items-start gap-2 text-xs">
        {webhookOk ? (
          <>
            <ShieldCheck className="h-3.5 w-3.5 text-emerald-500 shrink-0 mt-0.5" />
            <div className="text-muted-foreground">
              <span className="text-foreground/90 font-medium">Webhook active</span>{" "}
              — bounce, unsubscribe, and campaign events flow back to Hyperlocal
              automatically. Switching audience re-provisions on the new list.
            </div>
          </>
        ) : (
          <>
            <AlertCircle className="h-3.5 w-3.5 text-amber-500 shrink-0 mt-0.5" />
            <div className="text-muted-foreground">
              <span className="text-amber-500 font-medium">Webhook not configured.</span>{" "}
              {meta?.webhook_error ?? "Switch audiences to re-provision."}
            </div>
          </>
        )}
      </div>

      {/* Send a test through Mailchimp — campaign-mode preview. Creates a
          draft campaign, attaches HTML, fires actions/test, deletes the draft.
          Shows the agent the real recipient experience (Mailchimp footer +
          unsub link + their sending IPs). */}
      {currentAudienceId && (
        <div className="rounded-md border border-border bg-background/40 p-3 space-y-2">
          <div className="flex items-center gap-2">
            <Send className="h-3.5 w-3.5 text-primary" />
            <p className="text-xs font-medium">Send a test through Mailchimp</p>
          </div>
          <p className="text-[11px] text-muted-foreground leading-relaxed">
            Renders a synthetic market report, ships it via Mailchimp's
            actions/test endpoint, then deletes the draft. You'll see what
            real recipients see — including Mailchimp's auto-injected footer.
          </p>
          <Select value={testTemplate} onValueChange={setTestTemplate}>
            <SelectTrigger className="text-xs h-9">
              <SelectValue placeholder="Pick a template" />
            </SelectTrigger>
            <SelectContent>
              {PREVIEW_TEMPLATES.map((t) => (
                <SelectItem key={t.key} value={t.key}>
                  {t.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <div className="flex items-center gap-2">
            <Input
              type="email"
              value={testTo}
              onChange={(e) => setTestTo(e.target.value)}
              placeholder="Send to (defaults to your account email)"
              className="text-xs"
            />
            <Button
              size="sm"
              onClick={() => void sendTest()}
              disabled={testing}
              className="gap-1.5 shrink-0"
            >
              {testing ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : (
                <>
                  <Send className="h-3.5 w-3.5" /> Send test
                </>
              )}
            </Button>
          </div>
          {testing && (
            <p className="text-[11px] text-muted-foreground flex items-center gap-1">
              <Loader2 className="h-3 w-3 animate-spin" />
              Creating draft campaign in Mailchimp + sending… (5–10s)
            </p>
          )}
          {!testing && lastTestTo && (
            <p className="text-[11px] text-emerald-500 flex items-center gap-1">
              <CheckCircle2 className="h-3 w-3" />
              Sent to {lastTestTo} — check inbox for "[TEST]" subject.
            </p>
          )}
        </div>
      )}

      {/* Connected check footer */}
      <div className="pt-1 border-t border-border/60 flex items-center gap-1.5 text-[11px] text-emerald-500">
        <CheckCircle2 className="h-3 w-3" />
        Mailchimp owns the sending domain, footer, and unsubscribe link.
      </div>
    </div>
  );
}
