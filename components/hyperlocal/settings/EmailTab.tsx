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
import type { HlEmailConnection } from "@/types/hyperlocal";
import { PREVIEW_TEMPLATES } from "@/lib/hyperlocal/email/preview-templates";

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

  const webhookUrl = (id: string) => {
    if (typeof window === "undefined") return "";
    return `${window.location.origin}/api/webhooks/resend`;
    // Note: single endpoint — the route looks up which connection's secret to
    // verify against by tracing the payload's email_id back through the
    // recipient row. So all connections share this URL, but each has its own
    // signing secret in Resend.
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
    if (!resendApiKey.trim().startsWith("re_")) {
      toast.error("Resend API keys start with 're_'");
      return;
    }
    setResendSaving(true);
    try {
      const res = await fetch(
        "/api/apps/hyperlocal/email-connections/resend/verify-domain",
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
      toast.error("Delete failed");
      return;
    }
    setConnections((prev) => prev.filter((c) => c.id !== id));
    toast.success("Disconnected");
  };

  return (
    <div className="space-y-4">
      {dialog}
      <p className="text-sm text-muted-foreground">
        Hyperlocal sends through your own Resend account so deliverability,
        domain ownership, and billing stay with you. Connect your API key
        and verified sending domain below.
      </p>

      {/* Resend setup panel */}
      <div className="rounded-lg border border-border bg-card p-5 space-y-4">
        <h3 className="text-sm font-semibold">Connect your Resend account</h3>
        <p className="text-xs text-muted-foreground">
          We&apos;ll validate the key, kick off domain verification, and return
          the DNS records to add. Once DNS propagates (5 min – 24 hr), come
          back and click <strong>Check</strong>.
        </p>
        <Field label="Resend API key">
          <Input
            type="password"
            value={resendApiKey}
            onChange={(e) => setResendApiKey(e.target.value)}
            placeholder="re_••••••••••••••••••"
          />
          <p className="text-xs text-muted-foreground mt-1">
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
          </p>
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
              Resend handles SPF + DKIM on the sending subdomain (e.g.{" "}
              <code className="text-foreground/80">mail.yourbrokerage.com</code>).
              For best inbox placement Gmail and Yahoo also expect a DMARC
              record on the <strong>root domain</strong> (the part after the
              first dot, e.g. <code className="text-foreground/80">yourbrokerage.com</code>).
            </p>
            <p>
              If you don&apos;t have one yet, start with a non-enforcing record so
              you can monitor before tightening:
            </p>
            <pre className="text-[11px] font-mono bg-background border border-border rounded p-2 overflow-x-auto">{`Type:   TXT
Host:   _dmarc
Value:  v=DMARC1; p=none; rua=mailto:postmaster@yourbrokerage.com`}</pre>
            <p>
              Already on <code className="text-foreground/80">p=reject</code>?
              Make sure the <em>aspf</em> + <em>adkim</em> alignment modes are
              <em> relaxed</em> (the default) so your sending subdomain passes.
            </p>
          </div>
        </details>
      </div>

      {/* Existing connections */}
      {connections.length === 0 ? (
        <div className="rounded-lg border border-dashed border-border p-8 text-center">
          <p className="text-sm text-muted-foreground">
            No sending accounts connected yet.
          </p>
        </div>
      ) : (
        <ul className="space-y-2">
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

                {/* Preview email — design iteration tool */}
                {c.is_active && !isPaused && !pending && (
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

                {/* Webhook configuration */}
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
