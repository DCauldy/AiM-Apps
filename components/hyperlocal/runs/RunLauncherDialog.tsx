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
import { CRM_PLATFORM_LABELS, EMAIL_PROVIDER_LABELS } from "@/types/hyperlocal";
import type {
  HlCampaign,
  HlCrmConnection,
  HlEmailConnection,
  PlatformSenderProfile,
  PlatformBrandingProfile,
} from "@/types/hyperlocal";

interface OptionsResponse {
  crmConnections: Pick<HlCrmConnection, "id" | "platform" | "label">[];
  emailConnections: Pick<HlEmailConnection, "id" | "provider" | "email_address" | "display_name" | "is_default">[];
  senderProfiles: Pick<PlatformSenderProfile, "id" | "full_name" | "is_default">[];
  brandingProfiles: Pick<PlatformBrandingProfile, "id" | "name" | "is_default">[];
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
  const [senderId, setSenderId] = useState("");
  const [brandingId, setBrandingId] = useState("");
  const [launching, setLaunching] = useState(false);

  useEffect(() => {
    void (async () => {
      const [crm, email, sender, branding] = await Promise.all([
        fetch("/api/apps/hyperlocal/crm-connections").then((r) => r.json()),
        fetch("/api/apps/hyperlocal/email-connections")
          .then((r) => (r.ok ? r.json() : { connections: [] }))
          .catch(() => ({ connections: [] })),
        fetch("/api/apps/hyperlocal/sender-profiles").then((r) => r.json()),
        fetch("/api/apps/hyperlocal/branding-profiles").then((r) => r.json()),
      ]);
      const payload: OptionsResponse = {
        crmConnections: (crm.connections ?? []).filter(
          (c: HlCrmConnection) => c.is_active
        ),
        emailConnections: email.connections ?? [],
        senderProfiles: sender.profiles ?? [],
        brandingProfiles: branding.profiles ?? [],
      };
      setOpts(payload);
      if (payload.crmConnections[0]) setCrmId(payload.crmConnections[0].id);
      const defaultEmail =
        payload.emailConnections.find((e) => e.is_default) ??
        payload.emailConnections[0];
      if (defaultEmail) setEmailId(defaultEmail.id);
      const defaultSender =
        payload.senderProfiles.find((s) => s.is_default) ??
        payload.senderProfiles[0];
      if (defaultSender) setSenderId(defaultSender.id);
      const defaultBrand =
        payload.brandingProfiles.find((b) => b.is_default) ??
        payload.brandingProfiles[0];
      if (defaultBrand) setBrandingId(defaultBrand.id);
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
          sender_profile_id: senderId || null,
          branding_profile_id: brandingId || null,
          email_connection_id: emailId || null,
        }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "Failed to launch");
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
                  options={opts.crmConnections.map((c) => ({
                    value: c.id,
                    label: c.label || CRM_PLATFORM_LABELS[c.platform],
                  }))}
                />
              )}

              <SelectRow
                label="Sender"
                value={senderId}
                onChange={setSenderId}
                options={opts.senderProfiles.map((s) => ({
                  value: s.id,
                  label: s.full_name + (s.is_default ? " (default)" : ""),
                }))}
                placeholder={
                  opts.senderProfiles.length === 0
                    ? "No sender profiles yet"
                    : undefined
                }
              />

              <SelectRow
                label="Brand"
                value={brandingId}
                onChange={setBrandingId}
                options={opts.brandingProfiles.map((b) => ({
                  value: b.id,
                  label: b.name + (b.is_default ? " (default)" : ""),
                }))}
                placeholder={
                  opts.brandingProfiles.length === 0
                    ? "No branding profiles yet"
                    : undefined
                }
              />

              <SelectRow
                label="Send from"
                value={emailId}
                onChange={setEmailId}
                options={opts.emailConnections.map((e) => ({
                  value: e.id,
                  label: `${e.display_name || e.email_address} (${EMAIL_PROVIDER_LABELS[e.provider]})`,
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
