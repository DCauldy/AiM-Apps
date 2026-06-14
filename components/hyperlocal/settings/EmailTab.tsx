"use client";

import { useState } from "react";
import {
  Star,
  Trash2,
  AlertCircle,
  CheckCircle2,
  Loader2,
  RefreshCw,
  PauseCircle,
  ShieldCheck,
  Zap,
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
import { useHlDialog } from "@/components/hyperlocal/ui/HlDialog";
import { EMAIL_PROVIDER_LABELS } from "@/types/hyperlocal";
import type { EmailProvider, HlEmailConnection } from "@/types/hyperlocal";
import { PREVIEW_TEMPLATES } from "@/lib/hyperlocal/email/preview-templates";
import { IntegrationGrid } from "@/components/hyperlocal/settings/IntegrationGrid";
import { MailchimpManagePanel } from "@/components/hyperlocal/settings/MailchimpManagePanel";
import { ActiveCampaignManagePanel } from "@/components/hyperlocal/settings/ActiveCampaignManagePanel";
import { PROVIDER_BRANDS as PROVIDER_BRANDS_FOR_CONFIRM } from "@/lib/integrations/provider-logos";

// Client-side shape includes a `webhook_secret_set` boolean (the server never
// sends the secret itself) and the pause-state fields.
type ConnectionRow = HlEmailConnection & {
  webhook_secret_set?: boolean;
  paused?: boolean;
  paused_reason?: string | null;
  paused_at?: string | null;
};

export function EmailTab({
  initialConnections,
}: {
  initialConnections: HlEmailConnection[];
}) {
  const toast = useHlToast();
  const { confirm, dialog } = useHlDialog();
  const [connections, setConnections] = useState<ConnectionRow[]>(
    initialConnections as ConnectionRow[]
  );
  // Provider-aware setup form. Resend + SendGrid share the BYO-domain
  // shape (API key + domain + from + display name). Mailchimp diverges
  // (API key only, no domain, picks audience automatically) so the form
  // adapts.
  type SetupProvider = "resend" | "sendgrid" | "mailchimp" | "activecampaign";
  const [setupProvider, setSetupProvider] = useState<SetupProvider>("resend");
  const [mailchimpApiKey, setMailchimpApiKey] = useState("");
  const [mailchimpName, setMailchimpName] = useState("");
  const [mailchimpSaving, setMailchimpSaving] = useState(false);
  const [acApiUrl, setAcApiUrl] = useState("");
  const [acApiKey, setAcApiKey] = useState("");
  const [acName, setAcName] = useState("");
  const [acSaving, setAcSaving] = useState(false);
  const [resendApiKey, setResendApiKey] = useState("");
  const [resendDomain, setResendDomain] = useState("");
  const [resendFrom, setResendFrom] = useState("");
  const [resendName, setResendName] = useState("");
  const [resendSaving, setResendSaving] = useState(false);
  const [resendDns, setResendDns] = useState<unknown>(null);
  const [checkingId, setCheckingId] = useState<string | null>(null);
  const [webhookSecretInput, setWebhookSecretInput] = useState<Record<string, string>>({});
  const [savingSecretId, setSavingSecretId] = useState<string | null>(null);
  const [provisioningId, setProvisioningId] = useState<string | null>(null);
  const [resumingId, setResumingId] = useState<string | null>(null);
  const [previewingId, setPreviewingId] = useState<string | null>(null);
  const [previewTo, setPreviewTo] = useState<Record<string, string>>({});
  const [previewTemplate, setPreviewTemplate] = useState<Record<string, string>>({});

  const connectMailchimp = async () => {
    const key = mailchimpApiKey.trim();
    if (!key) {
      toast.error("Mailchimp API key required");
      return;
    }
    if (!key.includes("-")) {
      toast.error("Mailchimp key format is 'abc123def-us12' (key + datacenter)");
      return;
    }
    setMailchimpSaving(true);
    try {
      const res = await fetch(
        "/api/apps/hyperlocal/email-connections/mailchimp/connect",
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            api_key: key,
            display_name: mailchimpName.trim() || undefined,
          }),
        },
      );
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "Connect failed");
      setMailchimpApiKey("");
      setMailchimpName("");
      setSetupOpen(false);
      await refresh();
      toast.success(
        `Mailchimp connected — audience "${json.audience?.name ?? "default"}" selected`,
      );
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Connect failed");
    } finally {
      setMailchimpSaving(false);
    }
  };

  const connectActiveCampaign = async () => {
    const url = acApiUrl.trim();
    const key = acApiKey.trim();
    if (!url) {
      toast.error("ActiveCampaign API URL required");
      return;
    }
    if (!key) {
      toast.error("ActiveCampaign API key required");
      return;
    }
    setAcSaving(true);
    try {
      const res = await fetch(
        "/api/apps/hyperlocal/email-connections/activecampaign/connect",
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            api_url: url,
            api_key: key,
            display_name: acName.trim() || undefined,
          }),
        },
      );
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "Connect failed");
      setAcApiUrl("");
      setAcApiKey("");
      setAcName("");
      setSetupOpen(false);
      await refresh();
      toast.success(
        `ActiveCampaign connected — list "${json.list?.name ?? "default"}" selected`,
      );
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Connect failed");
    } finally {
      setAcSaving(false);
    }
  };

  const sendPreview = async (id: string) => {
    const toEmail = (previewTo[id] ?? "").trim();
    const template = previewTemplate[id] ?? PREVIEW_TEMPLATES[0].key;
    setPreviewingId(id);
    try {
      const res = await fetch(
        `/api/apps/hyperlocal/email-connections/${id}/preview-send`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            template,
            ...(toEmail ? { to_email: toEmail } : {}),
          }),
        },
      );
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "Preview send failed");
      toast.success(`Preview sent to ${json.to}`);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Preview send failed");
    } finally {
      setPreviewingId(null);
    }
  };

  const provisionWebhook = async (id: string) => {
    setProvisioningId(id);
    try {
      const res = await fetch(
        `/api/apps/hyperlocal/email-connections/${id}/webhook/provision`,
        { method: "POST" },
      );
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "Provisioning failed");
      await refresh();
      toast.success(
        json.reused
          ? "Linked to existing Resend webhook"
          : "Webhook created in Resend and verified",
      );
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Provisioning failed");
    } finally {
      setProvisioningId(null);
    }
  };

  // Use NEXT_PUBLIC_APP_URL so SSR + client agree (window.location.origin is
  // undefined during SSR and differs between server-render and hydration,
  // tripping React's hydration mismatch detector). Fallback for safety only.
  const APP_URL_FALLBACK = "http://localhost:6060";
  const APP_ORIGIN =
    (process.env.NEXT_PUBLIC_APP_URL ?? APP_URL_FALLBACK).replace(/\/+$/, "");
  const webhookUrl = (_id: string) => {
    // Single endpoint — the route resolves which connection's secret to
    // verify against by tracing the payload's email_id back through the
    // recipient row. All connections share this URL, each has its own secret.
    return `${APP_ORIGIN}/api/webhooks/resend`;
  };

  const saveWebhookSecret = async (id: string) => {
    const secret = (webhookSecretInput[id] ?? "").trim();
    if (!secret) {
      toast.error("Paste your Resend signing secret first");
      return;
    }
    setSavingSecretId(id);
    try {
      const res = await fetch(`/api/apps/hyperlocal/email-connections/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ webhook_secret: secret }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "Save failed");
      setWebhookSecretInput((prev) => ({ ...prev, [id]: "" }));
      await refresh();
      toast.success("Signing secret saved — Resend events now verified");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Save failed");
    } finally {
      setSavingSecretId(null);
    }
  };

  const resumeConnection = async (id: string) => {
    setResumingId(id);
    try {
      const res = await fetch(`/api/apps/hyperlocal/email-connections/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ paused: false }),
      });
      if (!res.ok) {
        const json = await res.json().catch(() => ({}));
        throw new Error(json.error ?? "Resume failed");
      }
      await refresh();
      toast.success("Connection resumed");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Resume failed");
    } finally {
      setResumingId(null);
    }
  };

  const copyUrl = (id: string) => {
    if (typeof navigator === "undefined") return;
    void navigator.clipboard.writeText(webhookUrl(id));
    toast.success("Webhook URL copied");
  };

  const refresh = async () => {
    const res = await fetch("/api/apps/hyperlocal/email-connections");
    const json = await res.json();
    setConnections(json.connections ?? []);
  };

  const verifyResend = async () => {
    if (!resendApiKey.trim() || !resendDomain.trim() || !resendFrom.trim()) {
      toast.error("API key, domain, and from address are required");
      return;
    }
    const expectedPrefix = setupProvider === "resend" ? "re_" : "SG.";
    if (!resendApiKey.trim().startsWith(expectedPrefix)) {
      toast.error(
        setupProvider === "resend"
          ? "Resend API keys start with 're_'"
          : "SendGrid API keys start with 'SG.'",
      );
      return;
    }
    const endpoint =
      setupProvider === "resend"
        ? "/api/apps/hyperlocal/email-connections/resend/verify-domain"
        : "/api/apps/hyperlocal/email-connections/sendgrid/verify-domain";
    setResendSaving(true);
    try {
      const res = await fetch(
        endpoint,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            api_key: resendApiKey.trim(),
            domain: resendDomain.trim(),
            from_email: resendFrom.trim(),
            display_name: resendName.trim() || undefined,
          }),
        }
      );
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "Verification failed");
      // Already-verified domains don't need DNS instructions — hide the
      // records panel when there's nothing for the user to do.
      setResendDns(json.status === "verified" ? null : json.dns_records);
      toast.success(
        json.status === "verified"
          ? json.reused
            ? "Wired up to your existing Resend domain"
            : "Domain verified"
          : "Add the DNS records below, then check status"
      );
      await refresh();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Verification failed");
    } finally {
      setResendSaving(false);
    }
  };

  const checkDomain = async (id: string) => {
    setCheckingId(id);
    try {
      const res = await fetch(
        `/api/apps/hyperlocal/email-connections/resend/check-domain?connection_id=${id}`
      );
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "Check failed");
      if (json.status === "verified") toast.success("Domain verified!");
      else toast.error("Still pending — DNS may take up to 72 hours");
      await refresh();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Check failed");
    } finally {
      setCheckingId(null);
    }
  };

  const setDefault = async (id: string) => {
    const res = await fetch(`/api/apps/hyperlocal/email-connections/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ is_default: true }),
    });
    if (!res.ok) {
      toast.error("Failed to set default");
      return;
    }
    await refresh();
    toast.success("Default updated");
  };

  const remove = async (id: string) => {
    const ok = await confirm({
      title: "Disconnect this sending account?",
      message:
        "Past run history is unaffected, but new runs will need a different sender.",
      confirmLabel: "Disconnect",
      destructive: true,
    });
    if (!ok) return;
    const res = await fetch(`/api/apps/hyperlocal/email-connections/${id}`, {
      method: "DELETE",
    });
    if (!res.ok) {
      const json = await res.json().catch(() => ({}));
      toast.error(json.error ?? "Delete failed");
      return;
    }
    setConnections((prev) => prev.filter((c) => c.id !== id));
    toast.success("Disconnected");
  };

  const providerDisplay = setupProvider === "resend" ? "Resend" : "SendGrid";
  const apiKeyHelp =
    setupProvider === "resend" ? (
      <>
        Get one at{" "}
        <a
          href="https://resend.com/api-keys"
          target="_blank"
          rel="noopener noreferrer"
          className="underline hover:no-underline"
        >
          resend.com/api-keys
        </a>{" "}
        — full-access permission is required for domain verification.
      </>
    ) : (
      <>
        Get one at{" "}
        <a
          href="https://app.sendgrid.com/settings/api_keys"
          target="_blank"
          rel="noopener noreferrer"
          className="underline hover:no-underline"
        >
          app.sendgrid.com/settings/api_keys
        </a>{" "}
        — needs <strong>Mail Send</strong> + <strong>Settings</strong> permissions
        for domain auth and webhook setup.
      </>
    );

  // Setup panel only opens when the user clicks Connect on a non-OAuth card.
  // Mailchimp uses OAuth, so it never opens this panel — it jumps to /oauth/start.
  const [setupOpen, setSetupOpen] = useState(false);

  const handleConnect = async (provider: EmailProvider) => {
    // One sending connection at a time. When the agent already has a
    // different provider connected, show a confirm modal before kicking
    // off the new flow. The server will auto-disconnect the prior one
    // after the new connection successfully persists.
    const existing = connections[0];
    if (existing && existing.provider !== provider) {
      const newName =
        PROVIDER_BRANDS_FOR_CONFIRM[provider]?.name ?? provider;
      const oldName =
        PROVIDER_BRANDS_FOR_CONFIRM[existing.provider]?.name ?? existing.provider;
      const ok = await confirm({
        title: `Replace your sending account?`,
        message: `Hyperlocal sends through one provider at a time. Connecting ${newName} will disconnect your current ${oldName} (${existing.email_address}) once the new connection is authorized. Past send history is preserved.`,
        confirmLabel: `Continue with ${newName}`,
      });
      if (!ok) return;
    }

    if (provider === "mailchimp") {
      // OAuth flow — navigate to the start route. The callback will
      // auto-disconnect any prior connection after persisting the new one.
      window.location.href =
        "/api/apps/hyperlocal/email-connections/mailchimp/oauth/start";
      return;
    }

    if (
      provider === "resend" ||
      provider === "sendgrid" ||
      provider === "activecampaign"
    ) {
      setSetupProvider(provider);
      setSetupOpen(true);
      // Smooth scroll the panel into view once it renders.
      setTimeout(() => {
        document
          .getElementById("setup-panel")
          ?.scrollIntoView({ behavior: "smooth", block: "start" });
      }, 50);
    }
    // Others are "Coming soon" — IntegrationCard disables them.
  };

  return (
    <div className="space-y-6">
      {dialog}
      <p className="text-sm text-muted-foreground">
        Hyperlocal sends through your own email provider so deliverability,
        domain ownership, and billing stay with you. Use whichever sending
        account you already have.
      </p>

      <IntegrationGrid
        connections={connections}
        onConnect={handleConnect}
      />

      {/* Inline setup panel for Resend / SendGrid — opens when Connect is clicked */}
      {setupOpen && (
      <div
        id="setup-panel"
        className="rounded-lg border border-primary/30 bg-card p-5 space-y-4"
      >
        <div className="flex items-start justify-between gap-3 flex-wrap">
          <h3 className="text-sm font-semibold">
            Connect{" "}
            {setupProvider === "resend"
              ? "Resend"
              : setupProvider === "sendgrid"
                ? "SendGrid"
                : setupProvider === "mailchimp"
                  ? "Mailchimp"
                  : "ActiveCampaign"}
          </h3>
          <div className="flex items-center gap-2">
            {/* Quick-switch pills only between Resend ↔ SendGrid since they
                share the BYO-domain form shape. Mailchimp + AC have totally
                different forms and showing these would be misleading. */}
            {(setupProvider === "resend" || setupProvider === "sendgrid") && (
              <div className="flex items-center gap-1 p-0.5 rounded-md border border-border bg-background text-xs">
                {(["resend", "sendgrid"] as const).map((p) => (
                  <button
                    key={p}
                    type="button"
                    onClick={() => setSetupProvider(p)}
                    className={`px-2.5 py-1 rounded ${setupProvider === p ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground"}`}
                  >
                    {p === "resend" ? "Resend" : "SendGrid"}
                  </button>
                ))}
              </div>
            )}
            <button
              type="button"
              onClick={() => setSetupOpen(false)}
              className="text-xs text-muted-foreground hover:text-foreground"
            >
              Close
            </button>
          </div>
        </div>
        {setupProvider === "mailchimp" ? (
          <div className="space-y-4">
            <p className="text-xs text-muted-foreground leading-relaxed">
              We&apos;ll validate the key, list your audiences, pick the first
              one as your default, and auto-provision the webhook so bounce /
              unsubscribe events flow back to Hyperlocal. <strong>Mailchimp
              handles the sending domain + CAN-SPAM footer + unsubscribe</strong>
              — Hyperlocal just generates the content and creates the campaign.
            </p>
            <Field label="Mailchimp API key">
              <Input
                type="password"
                value={mailchimpApiKey}
                onChange={(e) => setMailchimpApiKey(e.target.value)}
                placeholder="abc123def456-us12"
              />
              <p className="text-xs text-muted-foreground mt-1">
                Get one at{" "}
                <a
                  href="https://us1.admin.mailchimp.com/account/api/"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="underline hover:no-underline"
                >
                  mailchimp.com → Profile → Extras → API keys
                </a>
                . Format is <code className="text-foreground/80">key-us12</code> — the
                datacenter (e.g. <code className="text-foreground/80">us12</code>) is
                the part after the dash.
              </p>
            </Field>
            <Field label="Display name (optional)">
              <Input
                value={mailchimpName}
                onChange={(e) => setMailchimpName(e.target.value)}
                placeholder="My Mailchimp"
              />
            </Field>
            <div className="flex justify-end">
              <Button onClick={connectMailchimp} disabled={mailchimpSaving}>
                {mailchimpSaving ? (
                  <>
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" /> Connecting…
                  </>
                ) : (
                  "Connect Mailchimp"
                )}
              </Button>
            </div>
          </div>
        ) : setupProvider === "activecampaign" ? (
          <div className="space-y-4">
            <p className="text-xs text-muted-foreground leading-relaxed">
              Paste your API URL + key from AC&apos;s Developer settings.
              We&apos;ll validate, list your AC lists, and pick the first as
              your default. <strong>ActiveCampaign handles the sending
              domain + CAN-SPAM footer + unsubscribe</strong> — Hyperlocal
              just generates the content.
            </p>
            <Field label="API URL">
              <Input
                value={acApiUrl}
                onChange={(e) => setAcApiUrl(e.target.value)}
                placeholder="https://your-account.api-us1.com"
              />
              <p className="text-xs text-muted-foreground mt-1">
                Find it in ActiveCampaign → Settings → Developer.
                Some accounts use regional endpoints (e.g.{" "}
                <code className="text-foreground/80">.api-us2.com</code>) —
                paste exactly what AC shows.
              </p>
            </Field>
            <Field label="API key">
              <Input
                type="password"
                value={acApiKey}
                onChange={(e) => setAcApiKey(e.target.value)}
                placeholder="••••••••••••••••••••••••••••••"
              />
              <p className="text-xs text-muted-foreground mt-1">
                Same place — Settings → Developer. Per-user key; keep it private.
              </p>
            </Field>
            <Field label="Display name (optional)">
              <Input
                value={acName}
                onChange={(e) => setAcName(e.target.value)}
                placeholder="My ActiveCampaign"
              />
            </Field>
            <div className="flex justify-end">
              <Button onClick={connectActiveCampaign} disabled={acSaving}>
                {acSaving ? (
                  <>
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" /> Connecting…
                  </>
                ) : (
                  "Connect ActiveCampaign"
                )}
              </Button>
            </div>
          </div>
        ) : (
          <>
        <p className="text-xs text-muted-foreground">
          We&apos;ll validate the key, kick off domain authentication, and return
          the DNS records to add. Once DNS propagates (5 min – 24 hr), come
          back and click <strong>Check</strong>.
        </p>
        <Field label={`${providerDisplay} API key`}>
          <Input
            type="password"
            value={resendApiKey}
            onChange={(e) => setResendApiKey(e.target.value)}
            placeholder={setupProvider === "resend" ? "re_••••••••••••••••••" : "SG.••••••••••••••••••"}
          />
          <p className="text-xs text-muted-foreground mt-1">{apiKeyHelp}</p>
        </Field>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <Field label="Domain">
            <Input
              value={resendDomain}
              onChange={(e) => setResendDomain(e.target.value)}
              placeholder="mail.yourbrokerage.com"
            />
          </Field>
          <Field label="From address">
            <Input
              type="email"
              value={resendFrom}
              onChange={(e) => setResendFrom(e.target.value)}
              placeholder="jane@mail.yourbrokerage.com"
            />
          </Field>
          <Field label="Display name">
            <Input
              value={resendName}
              onChange={(e) => setResendName(e.target.value)}
              placeholder="Jane Smith"
            />
          </Field>
        </div>
        <div className="flex justify-end">
          <Button onClick={verifyResend} disabled={resendSaving}>
            {resendSaving ? (
              <>
                <Loader2 className="h-4 w-4 mr-2 animate-spin" /> Verifying…
              </>
            ) : (
              "Start verification"
            )}
          </Button>
        </div>
        {resendDns != null && (
          <details className="rounded-md border border-border p-3" open>
            <summary className="text-xs font-medium cursor-pointer">
              Required DNS records
            </summary>
            <pre className="mt-2 text-[11px] font-mono whitespace-pre-wrap overflow-x-auto">
              {JSON.stringify(resendDns, null, 2)}
            </pre>
          </details>
        )}
        <details className="rounded-md border border-border bg-muted/30 p-3">
          <summary className="text-xs font-medium cursor-pointer flex items-center gap-2">
            <CheckCircle2 className="h-3.5 w-3.5 text-emerald-500" />
            Recommended: DMARC on your root domain
          </summary>
          <div className="mt-2 space-y-2 text-xs text-muted-foreground leading-relaxed">
            <p>
              Your provider handles SPF + DKIM on the sending subdomain
              (e.g. <code className="text-foreground/80">mail.yourbrokerage.com</code>
              or <code className="text-foreground/80">em.yourbrokerage.com</code>).
              For best inbox placement Gmail and Yahoo also expect a DMARC
              record on the <strong>root domain</strong> (e.g.{" "}
              <code className="text-foreground/80">yourbrokerage.com</code>).
              One DMARC record covers every sending provider you connect.
            </p>
            <p className="text-amber-500/90">
              <strong>Check first:</strong> if a <code className="text-foreground/80">_dmarc</code>{" "}
              record already exists, <em>edit</em> it — don&apos;t add a second.
              Only one TXT at that host is honored.
            </p>
            <p>
              If you don&apos;t have one yet, start with a non-enforcing record
              so you can monitor before tightening to <code className="text-foreground/80">p=quarantine</code>
              {" "}or <code className="text-foreground/80">p=reject</code>:
            </p>
            <pre className="text-[11px] font-mono bg-background border border-border rounded p-2 overflow-x-auto">{`Type:   TXT
Host:   _dmarc
Value:  v=DMARC1; p=none; rua=mailto:dmarc@yourbrokerage.com`}</pre>
            <p>
              The <code className="text-foreground/80">rua</code> address has to
              actually receive mail — set up a <code className="text-foreground/80">dmarc@</code>
              {" "}alias if you don&apos;t have one, otherwise the aggregate
              reports go nowhere and the monitoring is useless.
            </p>
            <p>
              Already on <code className="text-foreground/80">p=reject</code>?
              Make sure the <em>aspf</em> + <em>adkim</em> alignment modes are
              <em> relaxed</em> (the default) so your sending subdomain passes
              alignment.
            </p>
          </div>
        </details>
          </>
        )}
      </div>
      )}

      {/* Existing connections */}
      {connections.length === 0 ? (
        <div id="connected-list" className="rounded-lg border border-dashed border-border p-8 text-center">
          <p className="text-sm text-muted-foreground">
            No sending accounts connected yet — pick one from the grid above.
          </p>
        </div>
      ) : (
        <ul id="connected-list" className="space-y-2">
          {connections.map((c) => {
            const pending =
              c.provider === "resend" && c.resend_dkim_status !== "verified";
            const hasSecret = !!c.webhook_secret_set;
            const isPaused = !!c.paused;
            return (
              <li
                key={c.id}
                className="rounded-lg border border-border bg-card p-4 space-y-3"
              >
                <div className="flex items-start justify-between gap-4">
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2 flex-wrap">
                      <p className="font-medium text-sm truncate">
                        {c.display_name || c.email_address}
                      </p>
                      {c.is_default && (
                        <span className="inline-flex items-center gap-1 text-[10px] uppercase font-medium text-emerald-500 bg-emerald-500/10 px-1.5 py-0.5 rounded">
                          <Star className="h-3 w-3" /> Default
                        </span>
                      )}
                      {pending && (
                        <span className="inline-flex items-center gap-1 text-[10px] uppercase font-medium text-amber-500 bg-amber-500/10 px-1.5 py-0.5 rounded">
                          <AlertCircle className="h-3 w-3" /> Pending DNS
                        </span>
                      )}
                      {isPaused && (
                        <span className="inline-flex items-center gap-1 text-[10px] uppercase font-medium text-rose-500 bg-rose-500/10 px-1.5 py-0.5 rounded">
                          <PauseCircle className="h-3 w-3" /> Paused
                        </span>
                      )}
                      {!hasSecret && !pending && (
                        <span className="inline-flex items-center gap-1 text-[10px] uppercase font-medium text-amber-500 bg-amber-500/10 px-1.5 py-0.5 rounded">
                          <AlertCircle className="h-3 w-3" /> Webhook not configured
                        </span>
                      )}
                      {!pending && c.is_active && !isPaused && hasSecret && (
                        <CheckCircle2 className="h-4 w-4 text-emerald-500" />
                      )}
                    </div>
                    <p className="text-xs text-muted-foreground mt-0.5">
                      {EMAIL_PROVIDER_LABELS[c.provider]} · {c.email_address}
                    </p>
                    {c.last_error && (
                      <p className="text-xs text-destructive mt-1">
                        {c.last_error}
                      </p>
                    )}
                  </div>
                  <div className="flex items-center gap-1 shrink-0">
                    {pending && (
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => checkDomain(c.id)}
                        disabled={checkingId === c.id}
                      >
                        {checkingId === c.id ? (
                          <Loader2 className="h-3.5 w-3.5 animate-spin" />
                        ) : (
                          <>
                            <RefreshCw className="h-3.5 w-3.5 mr-1.5" /> Check
                          </>
                        )}
                      </Button>
                    )}
                    {!c.is_default && c.is_active && (
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => setDefault(c.id)}
                      >
                        Set default
                      </Button>
                    )}
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => remove(c.id)}
                    >
                      <Trash2 className="h-4 w-4 text-destructive" />
                    </Button>
                  </div>
                </div>

                {/* Preview email — design iteration tool. Hidden for
                    Mailchimp (campaign-mode) since dispatchEmail() rejects
                    those; the MailchimpManagePanel has its own test-send
                    button that goes through Mailchimp's actions/test API. */}
                {c.is_active && !isPaused && !pending && c.provider !== "mailchimp" && c.provider !== "activecampaign" && (
                  <div className="rounded-md border border-border bg-background/40 p-3">
                    <div className="flex items-center gap-2 mb-2">
                      <Send className="h-3.5 w-3.5 text-primary" />
                      <p className="text-xs font-medium">Preview your email design</p>
                    </div>
                    <p className="text-[11px] text-muted-foreground mb-2 leading-relaxed">
                      Sends a synthetic market report through this connection using
                      your profile + branding. Real renderer, real footer, real
                      unsubscribe link — no campaign needed.
                    </p>
                    <div className="space-y-2">
                      {(() => {
                        const selectedKey = previewTemplate[c.id] ?? PREVIEW_TEMPLATES[0].key;
                        const selected = PREVIEW_TEMPLATES.find((t) => t.key === selectedKey);
                        return (
                          <>
                            <Select
                              value={selectedKey}
                              onValueChange={(v) =>
                                setPreviewTemplate((prev) => ({ ...prev, [c.id]: v }))
                              }
                            >
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
                            {selected && (
                              <p className="text-[11px] text-muted-foreground px-0.5">
                                {selected.description}
                              </p>
                            )}
                          </>
                        );
                      })()}
                      <div className="flex items-center gap-2">
                        <Input
                          type="email"
                          value={previewTo[c.id] ?? ""}
                          onChange={(e) =>
                            setPreviewTo((prev) => ({ ...prev, [c.id]: e.target.value }))
                          }
                          placeholder="Send to (defaults to your account email)"
                          className="text-xs"
                        />
                        <Button
                          size="sm"
                          onClick={() => sendPreview(c.id)}
                          disabled={previewingId === c.id}
                          className="gap-1.5 shrink-0"
                        >
                          {previewingId === c.id ? (
                            <Loader2 className="h-3.5 w-3.5 animate-spin" />
                          ) : (
                            <>
                              <Send className="h-3.5 w-3.5" /> Send preview
                            </>
                          )}
                        </Button>
                      </div>
                    </div>
                  </div>
                )}

                {/* Paused banner — surface the kill-switch reason + Resume */}
                {isPaused && (
                  <div className="rounded-md border border-rose-500/30 bg-rose-500/5 p-3 space-y-2">
                    <div className="flex items-start gap-2">
                      <PauseCircle className="h-4 w-4 text-rose-500 shrink-0 mt-0.5" />
                      <div className="min-w-0 flex-1">
                        <p className="text-xs font-medium text-rose-500">
                          Sending paused
                        </p>
                        <p className="text-xs text-muted-foreground mt-0.5">
                          {c.paused_reason ?? "Deliverability threshold tripped."}
                        </p>
                      </div>
                    </div>
                    <div className="flex justify-end">
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => resumeConnection(c.id)}
                        disabled={resumingId === c.id}
                      >
                        {resumingId === c.id ? (
                          <Loader2 className="h-3.5 w-3.5 animate-spin" />
                        ) : (
                          "Resume sending"
                        )}
                      </Button>
                    </div>
                  </div>
                )}

                {/* Provider-specific management panel */}
                {c.provider === "mailchimp" ? (
                  <MailchimpManagePanel connection={c} onUpdated={refresh} />
                ) : c.provider === "activecampaign" ? (
                  <ActiveCampaignManagePanel connection={c} onUpdated={refresh} />
                ) : (
                /* Webhook configuration (transactional providers) */
                <details
                  className={`rounded-md border p-3 ${hasSecret ? "border-border" : "border-amber-500/30 bg-amber-500/5"}`}
                  open={!hasSecret}
                >
                  <summary className="text-xs font-medium cursor-pointer flex items-center gap-2">
                    {hasSecret ? (
                      <ShieldCheck className="h-3.5 w-3.5 text-emerald-500" />
                    ) : (
                      <AlertCircle className="h-3.5 w-3.5 text-amber-500" />
                    )}
                    {hasSecret
                      ? "Webhook configured — events are signature-verified"
                      : "Webhook setup (required for bounce + complaint tracking)"}
                  </summary>
                  <div className="mt-3 space-y-2 text-xs text-muted-foreground">
                    {!hasSecret && (
                      <div className="flex items-start gap-3 flex-wrap">
                        <p className="flex-1 min-w-[260px] leading-relaxed">
                          One click — we create the webhook in your Resend
                          account using the API key you already provided.
                          <span className="text-amber-500/90"> Required so bounces, complaints, and the kill switch work.</span>
                        </p>
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => provisionWebhook(c.id)}
                          disabled={provisioningId === c.id}
                          className="gap-1.5 shrink-0"
                        >
                          {provisioningId === c.id ? (
                            <Loader2 className="h-3.5 w-3.5 animate-spin" />
                          ) : (
                            <>
                              <Zap className="h-3.5 w-3.5" /> Set up automatically
                            </>
                          )}
                        </Button>
                      </div>
                    )}
                    {hasSecret && (
                      <p className="leading-relaxed">
                        Every Resend event is verified against your signing secret.
                        Bounces auto-suppress, complaint rate trips the kill switch,
                        and engagement metrics flow into your dashboard.
                      </p>
                    )}

                    {/* Advanced fallback for agents whose API key lacks webhooks scope. */}
                    <details className="pt-1">
                      <summary className="text-[11px] cursor-pointer text-muted-foreground/70 hover:text-foreground inline-flex">
                        Set up manually instead
                      </summary>
                      <div className="mt-2 space-y-2 pl-3 border-l border-border/60">
                        <p>Add a webhook in your Resend dashboard pointing to:</p>
                        <div className="flex items-center gap-2">
                          <code className="flex-1 bg-background border border-border rounded px-2 py-1.5 text-[11px] font-mono overflow-x-auto">
                            {webhookUrl(c.id)}
                          </code>
                          <Button size="sm" variant="outline" onClick={() => copyUrl(c.id)}>
                            Copy
                          </Button>
                        </div>
                        <p>
                          Subscribe to <code className="text-foreground/80">email.*</code> and
                          paste the <strong>Signing Secret</strong>:
                        </p>
                        <div className="flex items-center gap-2">
                          <Input
                            type="password"
                            value={webhookSecretInput[c.id] ?? ""}
                            onChange={(e) =>
                              setWebhookSecretInput((prev) => ({
                                ...prev,
                                [c.id]: e.target.value,
                              }))
                            }
                            placeholder={hasSecret ? "•••••••• (paste to rotate)" : "whsec_••••••••••••••••"}
                          />
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => saveWebhookSecret(c.id)}
                            disabled={savingSecretId === c.id}
                          >
                            {savingSecretId === c.id ? (
                              <Loader2 className="h-3.5 w-3.5 animate-spin" />
                            ) : hasSecret ? (
                              "Update"
                            ) : (
                              "Save"
                            )}
                          </Button>
                        </div>
                      </div>
                    </details>
                  </div>
                </details>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

function Field({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-1.5">
      <label className="text-xs font-medium text-muted-foreground">{label}</label>
      {children}
    </div>
  );
}
