"use client";

import { useEffect, useState } from "react";
import {
  Users,
  Loader2,
  CheckCircle2,
  RefreshCw,
  Send,
  ShieldCheck,
  AlertCircle,
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
// ActiveCampaign connection management — replaces the generic
// webhook-config panel for AC connections. Mirrors MailchimpManagePanel
// (account header, list/audience picker, test-send) but doesn't surface
// webhook status since Phase 1 doesn't ship webhooks yet.
// ============================================================

type ConnectionRow = HlEmailConnection & {
  provider_metadata?: {
    activecampaign?: {
      base_url?: string;
      list_id?: string;
      list_name?: string;
      member_count?: number | null;
      account_name?: string | null;
      account_email?: string | null;
      webhook_id?: string | null;
      webhook_error?: string | null;
    };
  } | null;
};

interface AcList {
  id: string;
  name: string;
  member_count: number | null;
}

export function ActiveCampaignManagePanel({
  connection,
  onUpdated,
}: {
  connection: ConnectionRow;
  onUpdated: () => void;
}) {
  const toast = useHlToast();
  const meta = connection.provider_metadata?.activecampaign;
  const currentListId = meta?.list_id ?? null;
  const currentListName = meta?.list_name ?? null;
  const memberCount = meta?.member_count ?? null;
  const accountName = meta?.account_name ?? null;
  const accountEmail = meta?.account_email ?? null;
  const webhookOk = !!meta?.webhook_id;
  const accountHost = (() => {
    try {
      return meta?.base_url ? new URL(meta.base_url).host : null;
    } catch {
      return null;
    }
  })();

  const [lists, setLists] = useState<AcList[] | null>(null);
  const [loadingLists, setLoadingLists] = useState(false);
  const [switching, setSwitching] = useState(false);
  const [pendingListId, setPendingListId] = useState<string | null>(null);

  const [testTemplate, setTestTemplate] = useState<string>(PREVIEW_TEMPLATES[0].key);
  const [testTo, setTestTo] = useState<string>("");
  const [testing, setTesting] = useState(false);
  const [lastTestTo, setLastTestTo] = useState<string | null>(null);

  const loadLists = async () => {
    setLoadingLists(true);
    try {
      const res = await fetch(
        `/api/apps/hyperlocal/email-connections/${connection.id}/activecampaign/lists`,
      );
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "Failed to load lists");
      setLists(json.lists ?? []);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to load lists");
    } finally {
      setLoadingLists(false);
    }
  };

  useEffect(() => {
    void loadLists();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [connection.id]);

  const switchList = async (listId: string) => {
    if (listId === currentListId) return;
    setSwitching(true);
    setPendingListId(listId);
    try {
      const res = await fetch(
        `/api/apps/hyperlocal/email-connections/${connection.id}/activecampaign/list`,
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ list_id: listId }),
        },
      );
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "Switch failed");
      toast.success(`Switched to "${json.list?.name}"`);
      onUpdated();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Switch failed");
    } finally {
      setSwitching(false);
      setPendingListId(null);
    }
  };

  const sendTest = async () => {
    if (!currentListId) {
      toast.error("Pick a list before sending a test.");
      return;
    }
    setTesting(true);
    try {
      const res = await fetch(
        `/api/apps/hyperlocal/email-connections/${connection.id}/activecampaign/test-send`,
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
      setLastTestTo(json.to);
      toast.success(
        `Test sent to ${json.to}`,
        "Check your inbox — subject starts with [PREVIEW].",
      );
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Test send failed");
    } finally {
      setTesting(false);
    }
  };

  return (
    <div className="rounded-md border border-border p-3 space-y-4">
      <div className="flex items-center gap-2">
        <Users className="h-4 w-4 text-primary" />
        <h4 className="text-sm font-semibold">ActiveCampaign settings</h4>
      </div>

      {/* Account */}
      <div className="text-xs text-muted-foreground">
        Connected as{" "}
        <span className="text-foreground/90 font-medium">
          {accountName ?? accountEmail ?? "ActiveCampaign user"}
        </span>
        {accountEmail && accountName && (
          <span className="opacity-70"> ({accountEmail})</span>
        )}
        {accountHost && <span className="opacity-60"> · {accountHost}</span>}
      </div>

      {/* List picker */}
      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <label className="text-xs font-medium">List</label>
          <button
            type="button"
            onClick={() => void loadLists()}
            className="text-[11px] text-muted-foreground hover:text-foreground inline-flex items-center gap-1"
            disabled={loadingLists}
          >
            {loadingLists ? (
              <Loader2 className="h-3 w-3 animate-spin" />
            ) : (
              <RefreshCw className="h-3 w-3" />
            )}
            Refresh
          </button>
        </div>

        {lists && lists.length > 0 ? (
          <Select
            value={pendingListId ?? currentListId ?? undefined}
            onValueChange={switchList}
            disabled={switching}
          >
            <SelectTrigger className="text-xs">
              <SelectValue placeholder="Pick a list" />
            </SelectTrigger>
            <SelectContent>
              {lists.map((l) => (
                <SelectItem key={l.id} value={l.id}>
                  {l.name}
                  {l.member_count != null && (
                    <span className="text-muted-foreground">
                      {" "}
                      · {l.member_count.toLocaleString()} contacts
                    </span>
                  )}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        ) : loadingLists ? (
          <p className="text-xs text-muted-foreground">Loading lists…</p>
        ) : (
          <p className="text-xs text-muted-foreground">
            {currentListName ?? "No list selected"}
            {memberCount != null && (
              <span className="opacity-70">
                {" "}
                · {memberCount.toLocaleString()} contacts
              </span>
            )}
          </p>
        )}

        {switching && (
          <p className="text-[11px] text-muted-foreground flex items-center gap-1">
            <Loader2 className="h-3 w-3 animate-spin" />
            Switching list…
          </p>
        )}

        {lists && lists.length === 1 && (
          <p className="text-[11px] text-muted-foreground/80">
            Only one list on this account. Add more in AC → Contacts → Lists.
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
              — bounce, unsubscribe, open, and click events flow back to
              Hyperlocal automatically.
            </div>
          </>
        ) : (
          <>
            <AlertCircle className="h-3.5 w-3.5 text-amber-500 shrink-0 mt-0.5" />
            <div className="text-muted-foreground">
              <span className="text-amber-500 font-medium">Webhook not configured.</span>{" "}
              {meta?.webhook_error ?? "Reconnect to provision."}
            </div>
          </>
        )}
      </div>

      {/* Test send */}
      {currentListId && (
        <div className="rounded-md border border-border bg-background/40 p-3 space-y-2">
          <div className="flex items-center gap-2">
            <Send className="h-3.5 w-3.5 text-primary" />
            <p className="text-xs font-medium">Send a test through ActiveCampaign</p>
          </div>
          <p className="text-[11px] text-muted-foreground leading-relaxed">
            Creates a draft message + campaign, fires AC&apos;s v1 test-send
            endpoint, then deletes the draft. Test arrives via AC&apos;s real
            sending infrastructure (their footer + unsubscribe link).
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
              Creating draft in AC + sending… (5–10s)
            </p>
          )}
          {!testing && lastTestTo && (
            <p className="text-[11px] text-emerald-500 flex items-center gap-1">
              <CheckCircle2 className="h-3 w-3" />
              Sent to {lastTestTo} — check inbox for &quot;[PREVIEW]&quot; subject.
            </p>
          )}
        </div>
      )}

      {/* Phase note footer */}
      <div className="pt-1 border-t border-border/60 flex items-center gap-1.5 text-[11px] text-emerald-500">
        <CheckCircle2 className="h-3 w-3" />
        ActiveCampaign owns the sending domain, footer, and unsubscribe link.
      </div>
    </div>
  );
}
