"use client";

import { useState, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import {
  ArrowRight,
  ArrowLeft,
  Plus,
  Trash2,
  Loader2,
  Check,
  Sparkles,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

interface RadarSetupFormProps {
  profile: {
    full_name?: string;
    business_name?: string;
    [key: string]: unknown;
  };
}

interface QuerySuggestion {
  id: string;
  query_text: string;
  category?: string;
}

const STEPS = [
  { id: 1, label: "Brand Variations" },
  { id: 2, label: "Competitors" },
  { id: 3, label: "Query Selection" },
];

export function RadarSetupForm({ profile }: RadarSetupFormProps) {
  const router = useRouter();
  const [step, setStep] = useState(1);
  const [loading, setLoading] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  // Step 1: Brand Variations
  const [brandVariations, setBrandVariations] = useState<string[]>(() => {
    const initial: string[] = [];
    if (profile.full_name) initial.push(profile.full_name as string);
    if (profile.business_name) initial.push(profile.business_name as string);
    if (initial.length === 0) initial.push("");
    return initial;
  });

  // Step 2: Competitors
  const [competitors, setCompetitors] = useState<string[]>(["", "", ""]);

  // Step 3: Query suggestions
  const [suggestions, setSuggestions] = useState<QuerySuggestion[]>([]);
  const [selectedQueries, setSelectedQueries] = useState<Set<string>>(new Set());
  const [loadingSuggestions, setLoadingSuggestions] = useState(false);

  const fetchSuggestions = useCallback(async () => {
    setLoadingSuggestions(true);
    try {
      const res = await fetch("/api/apps/radar/queries/discover", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          brand_variations: brandVariations.filter(Boolean),
          competitors: competitors.filter(Boolean),
        }),
      });
      if (res.ok) {
        const data = await res.json();
        setSuggestions(data.suggestions || []);
        // Auto-select all by default
        setSelectedQueries(
          new Set((data.suggestions || []).map((s: QuerySuggestion) => s.id))
        );
      }
    } catch {
      // Will show empty state
    } finally {
      setLoadingSuggestions(false);
    }
  }, [brandVariations, competitors]);

  // Fetch suggestions when entering step 3
  useEffect(() => {
    if (step === 3 && suggestions.length === 0) {
      fetchSuggestions();
    }
  }, [step, suggestions.length, fetchSuggestions]);

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

  const updateCompetitor = (index: number, value: string) => {
    setCompetitors((prev) => {
      const next = [...prev];
      next[index] = value;
      return next;
    });
  };

  const addCompetitor = () => {
    if (competitors.length >= 5) return;
    setCompetitors((prev) => [...prev, ""]);
  };

  const removeCompetitor = (index: number) => {
    if (competitors.length <= 1) return;
    setCompetitors((prev) => prev.filter((_, i) => i !== index));
  };

  const toggleQuery = (id: string) => {
    setSelectedQueries((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  };

  const selectAll = () => {
    setSelectedQueries(new Set(suggestions.map((s) => s.id)));
  };

  const deselectAll = () => {
    setSelectedQueries(new Set());
  };

  const canProceed = () => {
    switch (step) {
      case 1:
        return brandVariations.some((v) => v.trim().length > 0);
      case 2:
        return competitors.some((c) => c.trim().length > 0);
      case 3:
        return true; // queries are optional — user can add later from Research
      default:
        return false;
    }
  };

  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async () => {
    if (!canProceed()) return;
    setSubmitting(true);
    setError(null);

    try {
      // 1. Save config WITHOUT completing onboarding yet
      const configRes = await fetch("/api/apps/radar/config", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          brand_variations: brandVariations.filter(Boolean),
          onboarding_completed: false,
        }),
      });

      if (!configRes.ok) {
        const data = await configRes.json();
        throw new Error(data.error || "Failed to create config");
      }

      // 2. Save competitors
      const validCompetitors = competitors.filter(Boolean);
      if (validCompetitors.length > 0) {
        const compRes = await fetch("/api/apps/radar/competitors", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            competitors: validCompetitors.map((name) => ({ name })),
          }),
        });
        if (!compRes.ok) {
          throw new Error("Failed to save competitors");
        }
      }

      // 3. Save selected queries
      const selectedSuggestions = suggestions.filter((s) =>
        selectedQueries.has(s.id)
      );
      if (selectedSuggestions.length > 0) {
        const queryRes = await fetch("/api/apps/radar/queries", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            queries: selectedSuggestions.map((s) => ({
              query_text: s.query_text,
              category: s.category,
              source: "ai_generated",
            })),
          }),
        });
        if (!queryRes.ok) {
          throw new Error("Failed to save queries");
        }
      }

      // 4. Mark onboarding complete now that all data is saved
      const completeRes = await fetch("/api/apps/radar/config", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ onboarding_completed: true }),
      });

      if (!completeRes.ok) {
        throw new Error("Failed to complete onboarding");
      }

      // 5. Trigger first check (non-blocking — don't fail onboarding if this errors)
      fetch("/api/apps/radar/checks", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ trigger: "manual" }),
      }).catch(() => {});

      // Redirect to dashboard
      router.push("/apps/radar/dashboard");
    } catch (err) {
      console.error("Radar onboarding submit error:", err);
      const message =
        err instanceof Error ? err.message : "Something went wrong";
      setError(message);
      setSubmitting(false);
    }
  };

  return (
    <div className="h-full overflow-y-auto">
      <div className="max-w-2xl mx-auto px-6 py-8">
        {/* Progress steps */}
        <div className="flex items-center justify-center gap-2 mb-8">
          {STEPS.map((s, i) => (
            <div key={s.id} className="flex items-center gap-2">
              <div
                className={cn(
                  "flex items-center gap-2 px-3 py-1.5 rounded-full text-xs font-medium transition-colors",
                  step === s.id
                    ? "bg-[#e0a458]/10 text-[#e0a458] border border-[#e0a458]/30"
                    : step > s.id
                      ? "bg-green-500/10 text-green-400 border border-green-500/30"
                      : "text-muted-foreground border border-border"
                )}
              >
                {step > s.id ? (
                  <Check className="h-3 w-3" />
                ) : (
                  <span>{s.id}</span>
                )}
                <span className="hidden sm:inline">{s.label}</span>
              </div>
              {i < STEPS.length - 1 && (
                <div
                  className={cn(
                    "w-8 h-px",
                    step > s.id ? "bg-green-500/50" : "bg-border"
                  )}
                />
              )}
            </div>
          ))}
        </div>

        {/* Step 1: Brand Variations */}
        {step === 1 && (
          <div className="space-y-6">
            <div>
              <h2 className="text-xl font-bold text-foreground">
                Brand Variations
              </h2>
              <p className="text-sm text-muted-foreground mt-1">
                Add the names AI engines might use when recommending you. Include
                your name, business name, team name, and any common variations.
              </p>
            </div>

            <div className="space-y-3">
              {brandVariations.map((variation, index) => (
                <div key={index} className="flex gap-2">
                  <input
                    type="text"
                    value={variation}
                    onChange={(e) => updateBrandVariation(index, e.target.value)}
                    placeholder={
                      index === 0
                        ? "Your full name"
                        : index === 1
                          ? "Business or team name"
                          : "Another variation..."
                    }
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
          </div>
        )}

        {/* Step 2: Competitors */}
        {step === 2 && (
          <div className="space-y-6">
            <div>
              <h2 className="text-xl font-bold text-foreground">Competitors</h2>
              <p className="text-sm text-muted-foreground mt-1">
                Add 3-5 competitors you want to track. Radar will monitor how
                often they appear compared to you across AI engines.
              </p>
            </div>

            <div className="space-y-3">
              {competitors.map((competitor, index) => (
                <div key={index} className="flex gap-2">
                  <input
                    type="text"
                    value={competitor}
                    onChange={(e) => updateCompetitor(index, e.target.value)}
                    placeholder={`Competitor ${index + 1} name or business`}
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

            {competitors.length < 5 && (
              <Button
                variant="outline"
                size="sm"
                onClick={addCompetitor}
                className="text-[#e0a458] border-[#e0a458]/30 hover:bg-[#e0a458]/10"
              >
                <Plus className="h-3.5 w-3.5 mr-1.5" />
                Add Competitor
              </Button>
            )}
          </div>
        )}

        {/* Step 3: Query Selection */}
        {step === 3 && (
          <div className="space-y-6">
            <div>
              <h2 className="text-xl font-bold text-foreground">
                Select Queries to Monitor
              </h2>
              <p className="text-sm text-muted-foreground mt-1">
                We generated query suggestions based on your profile. Select the
                ones you want Radar to track across AI engines.
              </p>
            </div>

            {loadingSuggestions ? (
              <div className="flex flex-col items-center justify-center py-12 gap-3">
                <div className="w-10 h-10 rounded-full bg-[#e0a458]/10 flex items-center justify-center">
                  <Sparkles className="h-5 w-5 text-[#e0a458] animate-pulse" />
                </div>
                <p className="text-sm text-muted-foreground">
                  Generating query suggestions...
                </p>
              </div>
            ) : suggestions.length > 0 ? (
              <>
                <div className="flex items-center justify-between">
                  <span className="text-xs text-muted-foreground">
                    {selectedQueries.size} of {suggestions.length} selected
                  </span>
                  <div className="flex gap-2">
                    <button
                      onClick={selectAll}
                      className="text-xs text-[#e0a458] hover:underline"
                    >
                      Select all
                    </button>
                    <span className="text-xs text-muted-foreground">|</span>
                    <button
                      onClick={deselectAll}
                      className="text-xs text-muted-foreground hover:text-foreground"
                    >
                      Deselect all
                    </button>
                  </div>
                </div>

                <div className="space-y-2 max-h-[400px] overflow-y-auto pr-1">
                  {suggestions.map((suggestion) => {
                    const isSelected = selectedQueries.has(suggestion.id);
                    return (
                      <button
                        key={suggestion.id}
                        type="button"
                        onClick={() => toggleQuery(suggestion.id)}
                        className={cn(
                          "w-full flex items-start gap-3 rounded-lg border p-3 text-left transition-colors",
                          isSelected
                            ? "border-[#e0a458]/40 bg-[#e0a458]/5"
                            : "border-border hover:border-[#e0a458]/20 hover:bg-accent/30"
                        )}
                      >
                        <div
                          className={cn(
                            "mt-0.5 shrink-0 w-4 h-4 rounded border flex items-center justify-center transition-colors",
                            isSelected
                              ? "bg-[#e0a458] border-[#e0a458]"
                              : "border-border"
                          )}
                        >
                          {isSelected && (
                            <Check className="h-3 w-3 text-white" />
                          )}
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="text-sm text-foreground">
                            {suggestion.query_text}
                          </p>
                          {suggestion.category && (
                            <span className="inline-block mt-1 text-[10px] px-1.5 py-0.5 rounded bg-[#1c4c8a]/20 text-[#1c4c8a] dark:text-blue-300">
                              {suggestion.category}
                            </span>
                          )}
                        </div>
                      </button>
                    );
                  })}
                </div>
              </>
            ) : (
              <div className="text-center py-12">
                <p className="text-sm text-muted-foreground">
                  No suggestions available. You can add queries manually later.
                </p>
              </div>
            )}
          </div>
        )}

        {/* Error message */}
        {error && (
          <div className="mt-6 rounded-lg border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-destructive">
            {error}
          </div>
        )}

        {/* Navigation buttons */}
        <div className="flex items-center justify-between mt-8 pt-6 border-t border-border">
          {step > 1 ? (
            <Button
              variant="outline"
              onClick={() => setStep((s) => s - 1)}
              disabled={submitting}
            >
              <ArrowLeft className="h-4 w-4 mr-1.5" />
              Back
            </Button>
          ) : (
            <div />
          )}

          {step < 3 ? (
            <Button
              onClick={() => setStep((s) => s + 1)}
              disabled={!canProceed() || loading}
              className="bg-[#e0a458] hover:bg-[#c88d3e] text-white"
            >
              Continue
              <ArrowRight className="h-4 w-4 ml-1.5" />
            </Button>
          ) : (
            <Button
              onClick={handleSubmit}
              disabled={!canProceed() || submitting}
              className="bg-[#e0a458] hover:bg-[#c88d3e] text-white"
            >
              {submitting ? (
                <>
                  <Loader2 className="h-4 w-4 mr-1.5 animate-spin" />
                  Setting up...
                </>
              ) : (
                <>
                  Launch Radar
                  <ArrowRight className="h-4 w-4 ml-1.5" />
                </>
              )}
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}
