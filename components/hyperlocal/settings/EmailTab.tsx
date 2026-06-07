"use client";

import { useState } from "react";
import { Star, Trash2, AlertCircle, CheckCircle2, Loader2, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useHlToast } from "@/components/hyperlocal/use-hl-toast";
import { useHlDialog } from "@/components/hyperlocal/ui/HlDialog";
import { EMAIL_PROVIDER_LABELS } from "@/types/hyperlocal";
import type { HlEmailConnection } from "@/types/hyperlocal";

export function EmailTab({
  initialConnections,
}: {
  initialConnections: HlEmailConnection[];
}) {
  const toast = useHlToast();
  const { confirm, dialog } = useHlDialog();
  const [connections, setConnections] = useState(initialConnections);
  const [resendApiKey, setResendApiKey] = useState("");
  const [resendDomain, setResendDomain] = useState("");
  const [resendFrom, setResendFrom] = useState("");
  const [resendName, setResendName] = useState("");
  const [resendSaving, setResendSaving] = useState(false);
  const [resendDns, setResendDns] = useState<unknown>(null);
  const [checkingId, setCheckingId] = useState<string | null>(null);

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
      setResendDns(json.dns_records);
      toast.success(
        json.status === "verified"
          ? "Domain verified"
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
            return (
              <li
                key={c.id}
                className="rounded-lg border border-border bg-card p-4 flex items-start justify-between gap-4"
              >
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
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
                    {!pending && c.is_active && (
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
