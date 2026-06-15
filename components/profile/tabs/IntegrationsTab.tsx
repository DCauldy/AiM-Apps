"use client";

import { useEffect, useMemo, useState } from "react";
import {
  CheckCircle2,
  KeyRound,
  Loader2,
  Mic,
  Trash2,
  UserSquare2,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useToast } from "@/components/ui/toast";
import { useConfirm } from "@/components/ui/confirm";
import {
  USER_APIKEY_REGISTRY,
  type UserApiKeyServiceKey,
} from "@/lib/user-api-keys/registry";
import type { UserApiKeySummary } from "@/lib/user-api-keys/server";

// ============================================================
// Profile Integrations tab.
//
// API keys for BYO third-party services consumed by per-profile
// renders. Today: ElevenLabs (voice) + HeyGen (avatar), both used
// by Tours. Each platform_profile holds its own keys so a multi-
// profile user can run a different ElevenLabs/HeyGen account per
// persona.
//
// Mirrors the card pattern of CRM + Mail tabs (icon, name,
// tagline, status badge, Connect/Manage). Storage path: same
// inline-form pattern as the legacy /apps/profile/api-keys page
// that this replaced.
// ============================================================

interface IntegrationsTabProps {
  /** The profile being edited. Null in "new profile" creation mode
   *  — the form needs an id to scope keys to a profile, so we show
   *  a "save your profile first" empty state instead. */
  profileId: string | null;
}

interface ServiceMeta {
  key: UserApiKeyServiceKey;
  name: string;
  tagline: string;
  brandColor: string;
  Icon: React.ComponentType<{ className?: string }>;
  helpUrl: string;
  placeholder: string;
}

const SERVICE_META: Record<UserApiKeyServiceKey, ServiceMeta> = {
  elevenlabs: {
    key: "elevenlabs",
    name: "ElevenLabs",
    tagline: "Voice generation for Tours voiceover + avatar renders.",
    brandColor: "#000000",
    Icon: Mic,
    helpUrl: "https://elevenlabs.io/app/settings/api-keys",
    placeholder: "sk_…",
  },
  heygen: {
    key: "heygen",
    name: "HeyGen",
    tagline: "Avatar video generation for Tours avatar tours.",
    brandColor: "#7B5BFF",
    Icon: UserSquare2,
    helpUrl: "https://app.heygen.com/settings/api",
    placeholder: "Bearer …",
  },
};

export function ProfileIntegrationsTab({ profileId }: IntegrationsTabProps) {
  const { addToast } = useToast();
  const confirm = useConfirm();
  const [keys, setKeys] = useState<Record<string, UserApiKeySummary | undefined>>(
    {},
  );
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);
  const [editing, setEditing] = useState<UserApiKeyServiceKey | null>(null);
  const [drafts, setDrafts] = useState<Record<string, string>>({});

  useEffect(() => {
    if (!profileId) {
      setLoading(false);
      return;
    }
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch(`/api/profiles/${profileId}/api-keys`);
        const json = await res.json();
        if (!res.ok) throw new Error(json.error ?? "Failed to load API keys");
        if (cancelled) return;
        setKeys(
          Object.fromEntries(
            (json.apiKeys as UserApiKeySummary[]).map((k) => [k.service_key, k]),
          ),
        );
      } catch (err) {
        if (!cancelled) {
          addToast({
            title: "Couldn't load integrations",
            description: err instanceof Error ? err.message : "Unknown error",
            variant: "destructive",
          });
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [profileId, addToast]);

  const configuredCount = useMemo(
    () => USER_APIKEY_REGISTRY.filter((c) => keys[c.key]?.has_key).length,
    [keys],
  );

  async function save(serviceKey: UserApiKeyServiceKey) {
    if (!profileId) return;
    const apiKey = drafts[serviceKey]?.trim() ?? "";
    if (!apiKey) {
      addToast({
        title: "API key required",
        description: "Paste a key before saving.",
        variant: "destructive",
      });
      return;
    }
    setBusy(serviceKey);
    try {
      const res = await fetch(`/api/profiles/${profileId}/api-keys`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ service_key: serviceKey, api_key: apiKey }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "Failed to save API key");
      setKeys((prev) => ({ ...prev, [serviceKey]: json.apiKey }));
      setDrafts((prev) => ({ ...prev, [serviceKey]: "" }));
      setEditing(null);
      addToast({ title: `${SERVICE_META[serviceKey].name} connected` });
    } catch (err) {
      addToast({
        title: "Could not save API key",
        description: err instanceof Error ? err.message : "Unknown error",
        variant: "destructive",
      });
    } finally {
      setBusy(null);
    }
  }

  async function remove(serviceKey: UserApiKeyServiceKey) {
    if (!profileId) return;
    const ok = await confirm({
      title: `Remove ${SERVICE_META[serviceKey].name} key?`,
      description:
        "Any feature on this profile that uses this service will stop working until you reconnect.",
      confirmLabel: "Remove",
      variant: "destructive",
    });
    if (!ok) return;
    setBusy(serviceKey);
    try {
      const res = await fetch(
        `/api/profiles/${profileId}/api-keys?service_key=${encodeURIComponent(serviceKey)}`,
        { method: "DELETE" },
      );
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "Failed to remove API key");
      setKeys((prev) => ({ ...prev, [serviceKey]: undefined }));
      setDrafts((prev) => ({ ...prev, [serviceKey]: "" }));
      addToast({ title: `${SERVICE_META[serviceKey].name} removed` });
    } catch (err) {
      addToast({
        title: "Could not remove API key",
        description: err instanceof Error ? err.message : "Unknown error",
        variant: "destructive",
      });
    } finally {
      setBusy(null);
    }
  }

  if (!profileId) {
    return (
      <div className="max-w-2xl rounded-lg border border-border bg-muted/30 p-6 text-sm text-muted-foreground">
        <KeyRound className="h-4 w-4 mb-3 text-muted-foreground" />
        Save your profile first to manage integrations. API keys are stored
        per profile so each persona can run its own ElevenLabs / HeyGen
        account.
      </div>
    );
  }

  return (
    <div className="space-y-5">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h2 className="text-lg font-semibold">Integrations</h2>
          <p className="text-sm text-muted-foreground mt-0.5">
            Bring-your-own API keys for third-party services used by Tours.
            Each profile keeps its own keys.
          </p>
        </div>
        <span className="text-xs text-muted-foreground pt-1 shrink-0 whitespace-nowrap">
          {configuredCount} of {USER_APIKEY_REGISTRY.length} configured
        </span>
      </div>

      {loading ? (
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" /> Loading…
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {USER_APIKEY_REGISTRY.map((entry) => {
            const meta = SERVICE_META[entry.key];
            const status = keys[entry.key];
            const isConnected = Boolean(status?.has_key);
            const isEditing = editing === entry.key;
            const isBusy = busy === entry.key;

            return (
              <div
                key={entry.key}
                className={`relative rounded-lg border bg-card p-4 flex flex-col gap-3 transition-colors ${
                  isConnected
                    ? "border-emerald-500/30"
                    : "border-border hover:border-border/80"
                }`}
              >
                <div className="flex items-start gap-3">
                  <div
                    className="flex items-center justify-center w-10 h-10 rounded-md shrink-0"
                    style={{
                      backgroundColor: `${meta.brandColor}15`,
                      color: meta.brandColor,
                    }}
                  >
                    <meta.Icon className="h-5 w-5" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <p className="text-sm font-semibold truncate">{meta.name}</p>
                      {isConnected && (
                        <CheckCircle2 className="h-3.5 w-3.5 text-emerald-500 shrink-0" />
                      )}
                    </div>
                    <p className="text-xs text-muted-foreground mt-0.5 leading-snug">
                      {meta.tagline}
                    </p>
                  </div>
                </div>

                {isEditing ? (
                  <div className="space-y-2">
                    <Input
                      type="password"
                      autoComplete="off"
                      autoFocus
                      placeholder={meta.placeholder}
                      value={drafts[entry.key] ?? ""}
                      onChange={(e) =>
                        setDrafts((prev) => ({ ...prev, [entry.key]: e.target.value }))
                      }
                      className="text-xs font-mono"
                    />
                    <div className="flex items-center justify-between gap-2">
                      <a
                        href={meta.helpUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-[11px] text-muted-foreground hover:text-foreground underline underline-offset-2"
                      >
                        Get your key →
                      </a>
                      <div className="flex gap-2">
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          onClick={() => {
                            setEditing(null);
                            setDrafts((prev) => ({ ...prev, [entry.key]: "" }));
                          }}
                          disabled={isBusy}
                        >
                          Cancel
                        </Button>
                        <Button
                          type="button"
                          size="sm"
                          onClick={() => save(entry.key)}
                          disabled={isBusy || !(drafts[entry.key]?.trim())}
                        >
                          {isBusy ? <Loader2 className="h-3 w-3 animate-spin" /> : "Save"}
                        </Button>
                      </div>
                    </div>
                  </div>
                ) : (
                  <div className="flex items-center justify-end gap-2 pt-1">
                    {isConnected ? (
                      <>
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          onClick={() => remove(entry.key)}
                          disabled={isBusy}
                          className="gap-1.5 text-muted-foreground hover:text-destructive"
                        >
                          {isBusy ? (
                            <Loader2 className="h-3 w-3 animate-spin" />
                          ) : (
                            <Trash2 className="h-3 w-3" />
                          )}
                          Remove
                        </Button>
                        <Button
                          type="button"
                          size="sm"
                          variant="outline"
                          onClick={() => setEditing(entry.key)}
                          disabled={isBusy}
                        >
                          Replace key
                        </Button>
                      </>
                    ) : (
                      <Button
                        type="button"
                        size="sm"
                        onClick={() => setEditing(entry.key)}
                        disabled={isBusy}
                        className="gap-1.5"
                      >
                        <KeyRound className="h-3.5 w-3.5" /> Connect
                      </Button>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
