"use client";

import { useState, useCallback } from "react";
import {
  Plus,
  Trash2,
  Save,
  Loader2,
  Check,
  Crown,
  CreditCard,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { RadarUpgradeModal } from "@/components/radar/RadarUpgradeModal";
import {
  AI_ENGINES,
  AI_ENGINE_LABELS,
  type AIEngine,
  type RadarConfig,
  type RadarCompetitor,
} from "@/types/radar";

interface SettingsClientProps {
  config: RadarConfig;
  competitors: RadarCompetitor[];
}

export function SettingsClient({
  config: initialConfig,
  competitors: initialCompetitors,
}: SettingsClientProps) {
  const [brandVariations, setBrandVariations] = useState<string[]>(
    initialConfig.brand_variations.length > 0
      ? initialConfig.brand_variations
      : [""]
  );
  const [competitors, setCompetitors] = useState<string[]>(
    initialCompetitors.length > 0
      ? initialCompetitors.map((c) => c.name)
      : [""]
  );
  const [monitoredEngines, setMonitoredEngines] = useState<Set<AIEngine>>(
    new Set(initialConfig.monitored_engines)
  );
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [showUpgradeModal, setShowUpgradeModal] = useState(false);
  const [managingSubscription, setManagingSubscription] = useState(false);

  // Brand variations
  const updateBrandVariation = (index: number, value: string) => {
    setBrandVariations((prev) => {
      const next = [...prev];
      next[index] = value;
      return next;
    });
  };

  const addBrandVariation = () => {
    setBrandVariations((prev) => [...prev, ""]);
  };

  const removeBrandVariation = (index: number) => {
    if (brandVariations.length <= 1) return;
    setBrandVariations((prev) => prev.filter((_, i) => i !== index));
  };

  // Competitors
  const updateCompetitor = (index: number, value: string) => {
    setCompetitors((prev) => {
      const next = [...prev];
      next[index] = value;
      return next;
    });
  };

  const addCompetitor = () => {
    setCompetitors((prev) => [...prev, ""]);
  };

  const removeCompetitor = (index: number) => {
    if (competitors.length <= 1) return;
    setCompetitors((prev) => prev.filter((_, i) => i !== index));
  };

  // Engine toggles
  const toggleEngine = (engine: AIEngine) => {
    setMonitoredEngines((prev) => {
      const next = new Set(prev);
      if (next.has(engine)) {
        // Don't allow deselecting all
        if (next.size <= 1) return prev;
        next.delete(engine);
      } else {
        next.add(engine);
      }
      return next;
    });
  };

  // Save
  const handleSave = useCallback(async () => {
    setSaving(true);
    setSaved(false);

    try {
      const res = await fetch("/api/apps/radar/config", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          brand_variations: brandVariations.filter(Boolean),
          monitored_engines: Array.from(monitoredEngines),
          competitors: competitors.filter(Boolean).map((name) => ({ name })),
        }),
      });

      if (res.ok) {
        setSaved(true);
        setTimeout(() => setSaved(false), 3000);
      }
    } catch {
      // Error handled silently
    } finally {
      setSaving(false);
    }
  }, [brandVariations, competitors, monitoredEngines]);

  // Manage subscription
  const handleManageSubscription = useCallback(async () => {
    setManagingSubscription(true);
    try {
      const res = await fetch("/api/apps/radar/manage-subscription", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
      });

      if (res.ok) {
        const data = await res.json();
        if (data.url) {
          window.location.href = data.url;
          return;
        }
      }
    } catch {
      // Error handled silently
    } finally {
      setManagingSubscription(false);
    }
  }, []);

  const TIER_LABELS: Record<string, string> = {
    pro: "Pro",
    silver: "Silver",
    gold: "Gold",
    platinum: "Platinum",
  };

  return (
    <div className="h-full overflow-y-auto">
      <div className="max-w-3xl mx-auto px-4 sm:px-6 py-6 space-y-8">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-xl font-bold text-foreground">Settings</h2>
            <p className="text-sm text-muted-foreground mt-0.5">
              Configure your Radar monitoring preferences.
            </p>
          </div>
          <Button
            onClick={handleSave}
            disabled={saving}
            className="bg-[#e0a458] hover:bg-[#c88d3e] text-white"
          >
            {saving ? (
              <>
                <Loader2 className="h-4 w-4 mr-1.5 animate-spin" />
                Saving...
              </>
            ) : saved ? (
              <>
                <Check className="h-4 w-4 mr-1.5" />
                Saved
              </>
            ) : (
              <>
                <Save className="h-4 w-4 mr-1.5" />
                Save Changes
              </>
            )}
          </Button>
        </div>

        {/* Section 1: Brand Variations */}
        <section className="space-y-4">
          <div>
            <h3 className="text-sm font-semibold text-foreground">
              Brand Variations
            </h3>
            <p className="text-xs text-muted-foreground mt-0.5">
              Names that AI engines might use when recommending you.
            </p>
          </div>

          <div className="space-y-2">
            {brandVariations.map((variation, index) => (
              <div key={index} className="flex gap-2">
                <input
                  type="text"
                  value={variation}
                  onChange={(e) => updateBrandVariation(index, e.target.value)}
                  placeholder="Name variation..."
                  className="flex-1 rounded-lg border border-border bg-card px-4 py-2.5 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-[#e0a458]/50 focus:border-[#e0a458]"
                />
                {brandVariations.length > 1 && (
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={() => removeBrandVariation(index)}
                    className="shrink-0 text-muted-foreground hover:text-destructive"
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                )}
              </div>
            ))}
          </div>

          <Button
            variant="outline"
            size="sm"
            onClick={addBrandVariation}
            className="text-[#e0a458] border-[#e0a458]/30 hover:bg-[#e0a458]/10"
          >
            <Plus className="h-3.5 w-3.5 mr-1.5" />
            Add Variation
          </Button>
        </section>

        <hr className="border-border" />

        {/* Section 2: Competitors */}
        <section className="space-y-4">
          <div>
            <h3 className="text-sm font-semibold text-foreground">
              Competitors
            </h3>
            <p className="text-xs text-muted-foreground mt-0.5">
              Track how you compare to these competitors across AI engines.
            </p>
          </div>

          <div className="space-y-2">
            {competitors.map((competitor, index) => (
              <div key={index} className="flex gap-2">
                <input
                  type="text"
                  value={competitor}
                  onChange={(e) => updateCompetitor(index, e.target.value)}
                  placeholder="Competitor name or business..."
                  className="flex-1 rounded-lg border border-border bg-card px-4 py-2.5 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-[#e0a458]/50 focus:border-[#e0a458]"
                />
                {competitors.length > 1 && (
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={() => removeCompetitor(index)}
                    className="shrink-0 text-muted-foreground hover:text-destructive"
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                )}
              </div>
            ))}
          </div>

          <Button
            variant="outline"
            size="sm"
            onClick={addCompetitor}
            className="text-[#e0a458] border-[#e0a458]/30 hover:bg-[#e0a458]/10"
          >
            <Plus className="h-3.5 w-3.5 mr-1.5" />
            Add Competitor
          </Button>
        </section>

        <hr className="border-border" />

        {/* Section 3: Monitored Engines */}
        <section className="space-y-4">
          <div>
            <h3 className="text-sm font-semibold text-foreground">
              Monitored Engines
            </h3>
            <p className="text-xs text-muted-foreground mt-0.5">
              Select which AI engines Radar should check during monitoring runs.
            </p>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
            {AI_ENGINES.map((engine) => {
              const isChecked = monitoredEngines.has(engine);
              return (
                <button
                  key={engine}
                  type="button"
                  onClick={() => toggleEngine(engine)}
                  className={cn(
                    "flex items-center gap-2 rounded-lg border px-3 py-2.5 text-sm transition-colors text-left",
                    isChecked
                      ? "border-[#e0a458]/40 bg-[#e0a458]/5 text-foreground"
                      : "border-border text-muted-foreground hover:border-[#e0a458]/20"
                  )}
                >
                  <div
                    className={cn(
                      "shrink-0 w-4 h-4 rounded border flex items-center justify-center transition-colors",
                      isChecked
                        ? "bg-[#e0a458] border-[#e0a458]"
                        : "border-border"
                    )}
                  >
                    {isChecked && (
                      <Check className="h-3 w-3 text-white" />
                    )}
                  </div>
                  <span className="truncate text-xs">{AI_ENGINE_LABELS[engine]}</span>
                </button>
              );
            })}
          </div>

          <p className="text-[10px] text-muted-foreground">
            At least one engine must be selected.
          </p>
        </section>

        <hr className="border-border" />

        {/* Section 4: Subscription */}
        <section className="space-y-4">
          <div>
            <h3 className="text-sm font-semibold text-foreground">
              Subscription
            </h3>
            <p className="text-xs text-muted-foreground mt-0.5">
              Manage your Radar plan and billing.
            </p>
          </div>

          <div className="rounded-lg border bg-card p-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div
                  className="w-10 h-10 rounded-xl flex items-center justify-center"
                  style={{
                    background:
                      "linear-gradient(135deg, #1c4c8a 0%, #e0a458 100%)",
                  }}
                >
                  <Crown className="h-5 w-5 text-white" />
                </div>
                <div>
                  <p className="text-sm font-semibold text-foreground">
                    {TIER_LABELS[initialConfig.tier] || initialConfig.tier} Plan
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {initialConfig.query_limit} queries · {initialConfig.monitoring_frequency} monitoring ·{" "}
                    {initialConfig.manual_checks_limit} manual checks ·{" "}
                    {initialConfig.audits_limit} audits
                  </p>
                </div>
              </div>
            </div>

            <div className="flex gap-2 mt-4">
              <Button
                onClick={() => setShowUpgradeModal(true)}
                className="bg-[#e0a458] hover:bg-[#c88d3e] text-white"
                size="sm"
              >
                <Crown className="h-3.5 w-3.5 mr-1.5" />
                Upgrade Plan
              </Button>

              {initialConfig.stripe_subscription_id && (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={handleManageSubscription}
                  disabled={managingSubscription}
                >
                  {managingSubscription ? (
                    <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" />
                  ) : (
                    <CreditCard className="h-3.5 w-3.5 mr-1.5" />
                  )}
                  Manage Subscription
                </Button>
              )}
            </div>
          </div>
        </section>
      </div>

      <RadarUpgradeModal
        open={showUpgradeModal}
        onClose={() => setShowUpgradeModal(false)}
      />
    </div>
  );
}
