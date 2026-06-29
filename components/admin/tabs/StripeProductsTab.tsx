"use client";

import { useEffect, useState } from "react";
import { CheckCircle2, XCircle, Loader2, Save } from "lucide-react";
import { useToast } from "@/components/ui/toast";

interface Setting {
  key: string;
  value: string;
  description: string | null;
}

interface VerifyResult {
  ok: boolean;
  product?: {
    id: string;
    name: string;
    active: boolean;
    description: string | null;
  };
  prices?: Array<{
    id: string;
    amountCents: number | null;
    currency: string;
    interval: string | null;
    intervalCount: number | null;
    nickname: string | null;
  }>;
  error?: string;
}

/** Stripe-related admin_settings keys + human labels for this tab. */
const STRIPE_KEYS: Record<string, { label: string; help: string }> = {
  stripe_profile_slot_product_id: {
    label: "Profile Slot product",
    help: "Stripe Product ID for the annual Profile Slot add-on. The active recurring Price attached to this product is what users are subscribed to when they buy a Profile.",
  },
};

export function StripeProductsTab() {
  const { addToast } = useToast();
  const [settings, setSettings] = useState<Setting[]>([]);
  const [edits, setEdits] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState<string | null>(null);
  const [verifying, setVerifying] = useState<string | null>(null);
  const [verifyResults, setVerifyResults] = useState<Record<string, VerifyResult>>({});

  useEffect(() => {
    fetch("/api/admin/settings")
      .then((r) => (r.ok ? r.json() : Promise.reject()))
      .then((data: Setting[]) => setSettings(data))
      .catch(() =>
        addToast({
          title: "Error",
          description: "Failed to load admin settings",
          variant: "destructive",
        })
      )
      .finally(() => setLoading(false));
  }, [addToast]);

  async function save(key: string) {
    const value = edits[key] ?? settings.find((s) => s.key === key)?.value ?? "";
    setSaving(key);
    try {
      const res = await fetch("/api/admin/settings", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ key, value }),
      });
      if (!res.ok) throw new Error("Save failed");
      setSettings((prev) =>
        prev.some((s) => s.key === key)
          ? prev.map((s) => (s.key === key ? { ...s, value } : s))
          : [...prev, { key, value, description: STRIPE_KEYS[key]?.help ?? null }]
      );
      setEdits((prev) => {
        const next = { ...prev };
        delete next[key];
        return next;
      });
      addToast({ title: "Saved" });
    } catch (err) {
      addToast({
        title: "Could not save",
        description: err instanceof Error ? err.message : "Try again shortly.",
        variant: "destructive",
      });
    } finally {
      setSaving(null);
    }
  }

  async function verify(key: string) {
    const productId = (edits[key] ?? settings.find((s) => s.key === key)?.value ?? "").trim();
    if (!productId) {
      addToast({
        title: "Nothing to verify",
        description: "Paste a Stripe Product ID first.",
        variant: "destructive",
      });
      return;
    }
    setVerifying(key);
    try {
      const res = await fetch("/api/admin/stripe/verify", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ productId }),
      });
      const data = (await res.json()) as VerifyResult;
      setVerifyResults((prev) => ({ ...prev, [key]: data }));
    } catch {
      setVerifyResults((prev) => ({
        ...prev,
        [key]: { ok: false, error: "Network error" },
      }));
    } finally {
      setVerifying(null);
    }
  }

  if (loading) return <div className="text-muted-foreground">Loading…</div>;

  return (
    <div className="space-y-6">
      <p className="text-sm text-muted-foreground">
        Stripe Product IDs are looked up at runtime so you can rotate prices in
        Stripe without redeploys. Pasting a new Product ID here takes effect on
        the next checkout or webhook event.
      </p>

      {Object.entries(STRIPE_KEYS).map(([key, meta]) => {
        const current = settings.find((s) => s.key === key)?.value ?? "";
        const draft = edits[key] ?? current;
        const dirty = draft !== current;
        const result = verifyResults[key];

        return (
          <div key={key} className="border rounded-lg p-5 space-y-3">
            <div>
              <p className="font-semibold">{meta.label}</p>
              <p className="text-xs text-muted-foreground mt-0.5">{meta.help}</p>
            </div>

            <div className="flex items-center gap-2">
              <input
                type="text"
                value={draft}
                onChange={(e) =>
                  setEdits((prev) => ({ ...prev, [key]: e.target.value }))
                }
                placeholder="prod_…"
                className="flex-1 h-9 px-3 rounded-md border bg-background text-sm font-mono"
              />
              <button
                onClick={() => verify(key)}
                disabled={verifying === key}
                className="h-9 px-3 rounded-md border text-sm hover:bg-accent transition-colors disabled:opacity-50 flex items-center gap-1.5"
              >
                {verifying === key ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                ) : null}
                Verify
              </button>
              <button
                onClick={() => save(key)}
                disabled={saving === key || !dirty}
                className="h-9 px-3 rounded-md text-sm bg-primary text-primary-foreground hover:bg-primary/90 transition-colors disabled:opacity-50 flex items-center gap-1.5"
              >
                {saving === key ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                ) : (
                  <Save className="h-3.5 w-3.5" />
                )}
                Save
              </button>
            </div>

            {result && <VerifyPanel result={result} />}
          </div>
        );
      })}
    </div>
  );
}

function VerifyPanel({ result }: { result: VerifyResult }) {
  if (!result.ok) {
    return (
      <div className="flex items-start gap-2 rounded-md border border-destructive/40 bg-destructive/10 p-3 text-sm">
        <XCircle className="h-4 w-4 text-destructive shrink-0 mt-0.5" />
        <div>
          <p className="font-medium text-destructive">Lookup failed</p>
          <p className="text-xs text-muted-foreground mt-0.5">{result.error}</p>
        </div>
      </div>
    );
  }

  const yearly = result.prices?.find((p) => p.interval === "year");
  const otherPrices = (result.prices ?? []).filter((p) => p !== yearly);

  return (
    <div className="rounded-md border border-emerald-500/40 bg-emerald-500/5 p-3 text-sm space-y-2">
      <div className="flex items-start gap-2">
        <CheckCircle2 className="h-4 w-4 text-emerald-500 shrink-0 mt-0.5" />
        <div>
          <p className="font-medium">{result.product?.name}</p>
          <p className="text-xs text-muted-foreground font-mono mt-0.5">
            {result.product?.id} · {result.product?.active ? "active" : "inactive"}
          </p>
          {result.product?.description && (
            <p className="text-xs text-muted-foreground mt-1">{result.product.description}</p>
          )}
        </div>
      </div>

      {result.prices && result.prices.length > 0 ? (
        <div className="space-y-1 pl-6">
          {yearly && <PriceRow price={yearly} preferred />}
          {otherPrices.map((p) => (
            <PriceRow key={p.id} price={p} />
          ))}
        </div>
      ) : (
        <p className="pl-6 text-xs text-muted-foreground">
          No active prices attached. Add one in Stripe before users can subscribe.
        </p>
      )}
    </div>
  );
}

function PriceRow({
  price,
  preferred,
}: {
  price: NonNullable<VerifyResult["prices"]>[number];
  preferred?: boolean;
}) {
  const amount = price.amountCents != null ? (price.amountCents / 100).toFixed(2) : "?";
  const interval = price.interval
    ? `/${price.intervalCount && price.intervalCount > 1 ? `${price.intervalCount} ${price.interval}s` : price.interval}`
    : "";
  return (
    <div className="flex items-center justify-between gap-3 text-xs">
      <div className="flex items-center gap-2">
        <span className="font-mono text-muted-foreground">{price.id}</span>
        {preferred && (
          <span className="px-1.5 py-0.5 rounded bg-emerald-500/20 text-emerald-600 dark:text-emerald-400 text-[10px] font-semibold uppercase">
            Used
          </span>
        )}
      </div>
      <span className="font-medium">
        ${amount} {price.currency.toUpperCase()}
        {interval}
      </span>
    </div>
  );
}
