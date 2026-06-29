"use client";

import { useEffect, useState } from "react";
import { Loader2 } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogBody,
  DialogClose,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { useHlToast } from "@/components/hyperlocal/use-hl-toast";
import { HyperlocalUpgradeModal } from "@/components/hyperlocal/HyperlocalUpgradeModal";
import { CRM_PLATFORM_LABELS, EMAIL_PROVIDER_LABELS } from "@/types/hyperlocal";
import type { HlCampaign } from "@/types/hyperlocal";
import type {
  AppCrmConnection,
  AppEmailConnection,
} from "@/types/platform-connections";

interface OptionsResponse {
  // CRM + email connections live on the platform connection layer now.
  // Each item is the platform identity joined with the Hyperlocal-app
  // state row — the displayable fields hang off `.connection`.
  crmConnections: AppCrmConnection<"hyperlocal">[];
  emailConnections: AppEmailConnection<"hyperlocal">[];
}

export function RunLauncherDialog({
  campaign,
  onClose,
  onLaunched,
}: {
  campaign: HlCampaign;
  onClose: () => void;
  onLaunched: (runId: string) => void;
}) {
  const toast = useHlToast();
  const [opts, setOpts] = useState<OptionsResponse | null>(null);
  const [crmId, setCrmId] = useState("");
  const [emailId, setEmailId] = useState("");
  const [launching, setLaunching] = useState(false);
  // When the server-side pack-cap gate fires (403, code "pack_limit_reached"),
  // capture the usage payload so the upgrade modal can show period reset etc.
  const [capInfo, setCapInfo] = useState<{
    periodEnd?: string;
    campaignsThisMonth: number;
    campaignsLimit: number;
  } | null>(null);

  useEffect(() => {
    // Sender + branding identity come from the user's active platform
    // profile (resolved server-side at launch), so the dialog only needs
    // a CRM connection and a sending account. Each fetch falls back to an
    // empty list on any non-OK/parse failure so the dialog never hangs on
    // the loading spinner.
    const safeFetch = (url: string): Promise<{ connections?: unknown[] }> =>
      fetch(url)
        .then((r) => (r.ok ? r.json() : {}))
        .catch(() => ({}));
    void (async () => {
      const [crm, email] = await Promise.all([
        safeFetch("/api/apps/hyperlocal/crm-connections"),
        safeFetch("/api/apps/hyperlocal/email-connections"),
      ]);
      const payload: OptionsResponse = {
        crmConnections: (
          (crm.connections ?? []) as AppCrmConnection<"hyperlocal">[]
        ).filter((c) => c.connection.is_active),
        emailConnections: (
          (email.connections ?? []) as AppEmailConnection<"hyperlocal">[]
        ).filter((e) => e.connection.is_active),
      };
      setOpts(payload);
      if (payload.crmConnections[0]) {
        setCrmId(payload.crmConnections[0].connection.id);
      }
      if (payload.emailConnections[0]) {
        setEmailId(payload.emailConnections[0].connection.id);
      }
    })();
  }, []);

  const launch = async () => {
    if (!crmId) {
      toast.error("Choose a CRM connection");
      return;
    }
    setLaunching(true);
    try {
      const res = await fetch("/api/apps/hyperlocal/runs", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          campaign_id: campaign.id,
          crm_connection_id: crmId,
          email_connection_id: emailId || null,
        }),
      });
      const json = await res.json();
      if (!res.ok) {
        // Server-side pack-cap gate. Surface the upgrade modal in-context
        // instead of a generic toast — the user just tried to act and
        // needs to know what to do next.
        if (res.status === 403 && json.code === "pack_limit_reached") {
          setCapInfo({
            periodEnd: json.usage?.periodEnd,
            campaignsThisMonth: json.usage?.campaignsThisMonth ?? 0,
            campaignsLimit: json.usage?.campaignsLimit ?? 0,
          });
          return;
        }
        throw new Error(json.error ?? "Failed to launch");
      }
      // Notify the header so the usage chip ticks up immediately —
      // HyperlocalHeader listens for this event and re-fetches.
      if (typeof window !== "undefined") {
        window.dispatchEvent(new Event("hyperlocal-usage-updated"));
      }
      onLaunched(json.run.id);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Launch failed");
    } finally {
      setLaunching(false);
    }
  };

  return (
    <Dialog open onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <div className="flex items-center justify-between w-full">
            <DialogTitle>Launch run: {campaign.name}</DialogTitle>
            <DialogClose onClose={onClose} />
          </div>
        </DialogHeader>
        <DialogBody>
          {!opts ? (
            <div className="text-center py-8">
              <Loader2 className="h-6 w-6 mx-auto text-muted-foreground animate-spin" />
            </div>
          ) : (
            <div className="space-y-4">
              {opts.crmConnections.length === 0 ? (
                <p className="text-sm text-destructive">
                  No active CRM connections. Add one in Settings first.
                </p>
              ) : (
                <SelectRow
                  label="CRM"
                  value={crmId}
                  onChange={setCrmId}
                  options={opts.crmConnections.map(({ connection }) => ({
                    value: connection.id,
                    label:
                      connection.label ||
                      CRM_PLATFORM_LABELS[connection.platform],
                  }))}
                />
              )}

              <SelectRow
                label="Send from"
                value={emailId}
                onChange={setEmailId}
                options={opts.emailConnections.map(({ connection }) => ({
                  value: connection.id,
                  label: `${connection.display_name || connection.email_address} (${EMAIL_PROVIDER_LABELS[connection.provider]})`,
                }))}
                placeholder={
                  opts.emailConnections.length === 0
                    ? "Required before sending (Phase 3)"
                    : undefined
                }
              />

              <p className="text-xs text-muted-foreground">
                Hyperlocal will pull contacts, group them by{" "}
                {campaign.segmentation}, then pause and ask you for MLS data.
                Nothing sends until you approve.
              </p>
            </div>
          )}
        </DialogBody>
        <div className="flex justify-end gap-3 p-6 border-t border-border">
          <Button variant="outline" onClick={onClose} disabled={launching}>
            Cancel
          </Button>
          <Button
            onClick={launch}
            disabled={launching || !opts || !crmId}
            className="bg-[#E11D48] hover:bg-[#BE123C]"
          >
            {launching ? (
              <>
                <Loader2 className="h-4 w-4 mr-2 animate-spin" /> Launching…
              </>
            ) : (
              "Launch run"
            )}
          </Button>
        </div>
      </DialogContent>
      <HyperlocalUpgradeModal
        open={!!capInfo}
        onClose={() => setCapInfo(null)}
        reason="limit"
        periodEnd={capInfo?.periodEnd}
        currentUsage={
          capInfo
            ? {
                campaignsThisMonth: capInfo.campaignsThisMonth,
                campaignsLimit: capInfo.campaignsLimit,
              }
            : undefined
        }
      />
    </Dialog>
  );
}

function SelectRow({
  label,
  value,
  onChange,
  options,
  placeholder,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  options: { value: string; label: string }[];
  placeholder?: string;
}) {
  return (
    <div className="space-y-1.5">
      <label className="text-xs font-medium text-muted-foreground">{label}</label>
      {options.length === 0 ? (
        <p className="text-xs text-muted-foreground italic">
          {placeholder ?? "None configured"}
        </p>
      ) : (
        <select
          value={value}
          onChange={(e) => onChange(e.target.value)}
          className="w-full h-10 rounded-md border border-border bg-background px-3 text-sm"
        >
          <option value="">— None —</option>
          {options.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </select>
      )}
    </div>
  );
}
