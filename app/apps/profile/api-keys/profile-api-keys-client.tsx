"use client";

import { useMemo, useState } from "react";
import { Check, KeyRound, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useToast } from "@/components/ui/toast";
import type { UserApiKeyConfig } from "@/lib/user-api-keys/registry";
import type { UserApiKeySummary } from "@/lib/user-api-keys/server";

type Props = {
  registry: readonly UserApiKeyConfig[];
  initialApiKeys: UserApiKeySummary[];
};

type ApiKeyState = Record<string, UserApiKeySummary | undefined>;

export function ProfileApiKeysClient({ registry, initialApiKeys }: Props) {
  const { addToast } = useToast();
  const [values, setValues] = useState<Record<string, string>>({});
  const [apiKeys, setApiKeys] = useState<ApiKeyState>(() =>
    Object.fromEntries(initialApiKeys.map((key) => [key.service_key, key]))
  );
  const [busy, setBusy] = useState<string | null>(null);

  const configuredCount = useMemo(
    () => registry.filter((config) => apiKeys[config.key]?.has_key).length,
    [apiKeys, registry]
  );

  async function save(serviceKey: string) {
    const apiKey = values[serviceKey]?.trim() ?? "";
    if (!apiKey) {
      addToast({
        title: "API key required",
        description: "Paste a key before saving this integration.",
        variant: "destructive",
      });
      return;
    }

    setBusy(serviceKey);
    try {
      const res = await fetch("/api/profile/api-keys", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ service_key: serviceKey, api_key: apiKey }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "Failed to save API key");

      setApiKeys((prev) => ({ ...prev, [serviceKey]: json.apiKey }));
      setValues((prev) => ({ ...prev, [serviceKey]: "" }));
      addToast({ title: "API key saved" });
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

  async function remove(serviceKey: string) {
    setBusy(serviceKey);
    try {
      const res = await fetch(
        `/api/profile/api-keys?service_key=${encodeURIComponent(serviceKey)}`,
        { method: "DELETE" }
      );
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "Failed to remove API key");

      setApiKeys((prev) => ({ ...prev, [serviceKey]: undefined }));
      setValues((prev) => ({ ...prev, [serviceKey]: "" }));
      addToast({ title: "API key removed" });
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

  return (
    <div className="max-w-4xl mx-auto p-6 space-y-6">
      <header className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold">API Keys</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Store user-level API keys for external integrations used across your apps.
          </p>
        </div>
        <div className="text-xs text-muted-foreground pt-2 shrink-0">
          {configuredCount} of {registry.length} configured
        </div>
      </header>

      <div className="space-y-3">
        {registry.map((config) => {
          const saved = apiKeys[config.key];
          const isBusy = busy === config.key;

          return (
            <section key={config.key} className="glass-card rounded-lg p-4 space-y-4">
              <div className="flex items-start justify-between gap-4">
                <div className="min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <h2 className="font-semibold truncate">{config.name}</h2>
                    {saved?.has_key && (
                      <span className="inline-flex items-center gap-1 text-xs font-medium text-foreground bg-foreground/10 px-2 py-0.5 rounded-full">
                        <Check className="h-3 w-3" /> Configured
                      </span>
                    )}
                  </div>
                  <p className="text-sm text-muted-foreground">
                    {saved?.updated_at
                      ? `Last updated ${new Date(saved.updated_at).toLocaleDateString()}`
                      : "No API key saved"}
                  </p>
                </div>
                {saved?.has_key && (
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => remove(config.key)}
                    disabled={isBusy}
                    title={`Remove ${config.name} API key`}
                    className="text-destructive hover:bg-destructive/10 shrink-0"
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                )}
              </div>

              <div className="flex flex-col sm:flex-row gap-3">
                <label className="sr-only" htmlFor={`${config.key}-api-key`}>
                  {config.name} API key
                </label>
                <Input
                  id={`${config.key}-api-key`}
                  type="password"
                  autoComplete="off"
                  value={values[config.key] ?? ""}
                  onChange={(event) =>
                    setValues((prev) => ({
                      ...prev,
                      [config.key]: event.target.value,
                    }))
                  }
                  placeholder={saved?.has_key ? "Paste a new key to replace the saved key" : "Paste API key"}
                  disabled={isBusy}
                />
                <Button
                  className="gap-2 shrink-0"
                  onClick={() => save(config.key)}
                  disabled={isBusy}
                >
                  <KeyRound className="h-4 w-4" />
                  {saved?.has_key ? "Update Key" : "Save Key"}
                </Button>
              </div>
            </section>
          );
        })}
      </div>
    </div>
  );
}
