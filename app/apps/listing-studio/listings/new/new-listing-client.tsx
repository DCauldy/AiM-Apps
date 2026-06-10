"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { ArrowLeft, Loader2, MapPin, Wand2, AlertCircle } from "lucide-react";

import { cn } from "@/lib/utils";
import type {
  PropertyFacts,
  PropertyLookupResponse,
  ListingResponse,
} from "@/types/listing-studio";

type Step = "address" | "review";

export function NewListingClient() {
  const router = useRouter();
  const [step, setStep] = useState<Step>("address");

  const [address, setAddress] = useState("");
  const [lookingUp, setLookingUp] = useState(false);
  const [prefilledFromApi, setPrefilledFromApi] = useState(false);
  const [lookupError, setLookupError] = useState<string | null>(null);

  const [facts, setFacts] = useState<PropertyFacts>({});
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  async function handleLookup() {
    if (!address.trim()) return;
    setLookingUp(true);
    setLookupError(null);
    try {
      const res = await fetch("/api/apps/listing-studio/property-lookup", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ address: address.trim() }),
      });
      const data = (await res.json()) as PropertyLookupResponse;
      if (data.facts) {
        setFacts({
          city: data.facts.city ?? undefined,
          state: data.facts.state ?? undefined,
          zip: data.facts.zip ?? undefined,
          beds: data.facts.beds ?? undefined,
          baths: data.facts.baths ?? undefined,
          living_area_sqft: data.facts.living_area_sqft ?? undefined,
          lot_area_sqft: data.facts.lot_area_sqft ?? undefined,
          year_built: data.facts.year_built ?? undefined,
          property_type: data.facts.property_type ?? undefined,
          garage_spaces: data.facts.garage_spaces ?? undefined,
          last_sale_price_cents: data.facts.last_sale_price_cents ?? undefined,
          last_sale_date: data.facts.last_sale_date ?? undefined,
          estimated_value_cents: data.facts.estimated_value_cents ?? undefined,
          // Carry zpid through to the DB — required for downstream comps +
          // market-trend RapidAPI calls.
          zpid: (data.facts as { zpid?: string | null }).zpid ?? undefined,
          // Hero image (Zillow MLS photo or Street View). Falls back to
          // Mapbox satellite in SubjectHero when null.
          image_url:
            (data.facts as { image_url?: string | null }).image_url ?? undefined,
          // Coordinates power the Mapbox satellite fallback image.
          latitude:
            (data.facts as { latitude?: number | null }).latitude ?? undefined,
          longitude:
            (data.facts as { longitude?: number | null }).longitude ?? undefined,
        });
        setPrefilledFromApi(true);
      } else {
        setPrefilledFromApi(false);
        setLookupError(
          data.error ??
            "Couldn't find this address in the data source. Enter facts manually.",
        );
      }
      setStep("review");
    } catch {
      setLookupError("Network error. You can still enter facts manually.");
      setStep("review");
    } finally {
      setLookingUp(false);
    }
  }

  async function handleSkipLookup() {
    setPrefilledFromApi(false);
    setLookupError(null);
    setStep("review");
  }

  async function handleSave() {
    setSaving(true);
    setSaveError(null);
    try {
      const res = await fetch("/api/apps/listing-studio/listings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          address: address.trim(),
          property_facts: facts,
          prefilled_from_api: prefilledFromApi,
        }),
      });
      const data = (await res.json()) as ListingResponse | { error: string };
      if (!res.ok || !("listing" in data)) {
        throw new Error(("error" in data && data.error) || "Failed to create listing");
      }
      router.push(`/apps/listing-studio/listings/${data.listing.id}`);
    } catch (err) {
      setSaveError(err instanceof Error ? err.message : "Save failed");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="h-full overflow-y-auto">
      <div className="max-w-2xl mx-auto px-6 py-8 space-y-6">
        <Link
          href="/apps/listing-studio/listings"
          className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors"
        >
          <ArrowLeft className="h-3.5 w-3.5" />
          Back to Listings
        </Link>

        {step === "address" ? (
          <div className="space-y-4">
            <div>
              <h1 className="font-sans text-xl font-bold text-foreground">
                New Listing
              </h1>
              <p className="text-sm text-muted-foreground mt-1">
                Enter an address — we&apos;ll pre-fill the facts from public
                records. You can edit anything before saving.
              </p>
            </div>

            <div className="rounded-lg border border-border bg-card p-5 space-y-4">
              <label className="block">
                <span className="text-xs font-medium text-muted-foreground">
                  Property address
                </span>
                <div className="mt-1.5 relative">
                  <MapPin className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                  <input
                    type="text"
                    value={address}
                    onChange={(e) => setAddress(e.target.value)}
                    placeholder="123 Main St, Cincinnati, OH 45202"
                    className="w-full h-11 pl-9 pr-3 rounded-md border border-border bg-background text-sm"
                    onKeyDown={(e) => {
                      if (e.key === "Enter" && address.trim() && !lookingUp) {
                        void handleLookup();
                      }
                    }}
                  />
                </div>
              </label>

              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={handleLookup}
                  disabled={!address.trim() || lookingUp}
                  className="inline-flex items-center gap-2 px-4 py-2 text-sm font-medium rounded-md text-white shadow-sm transition-opacity hover:opacity-90 disabled:opacity-50"
                  style={{
                    background:
                      "linear-gradient(135deg, #1E293B 0%, #D4A35C 100%)",
                  }}
                >
                  {lookingUp ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <Wand2 className="h-4 w-4" />
                  )}
                  Look up facts
                </button>
                <button
                  type="button"
                  onClick={handleSkipLookup}
                  disabled={!address.trim() || lookingUp}
                  className="text-xs text-muted-foreground hover:text-foreground transition-colors disabled:opacity-50"
                >
                  or enter manually
                </button>
              </div>
            </div>
          </div>
        ) : (
          <div className="space-y-4">
            <div>
              <h1 className="font-sans text-xl font-bold text-foreground">
                Review property facts
              </h1>
              <p className="text-sm text-muted-foreground mt-1 truncate">
                {address}
              </p>
            </div>

            {lookupError && (
              <div className="flex items-start gap-2 rounded-md border border-amber-500/30 bg-amber-500/5 px-3 py-2">
                <AlertCircle className="h-3.5 w-3.5 text-amber-500 mt-0.5 shrink-0" />
                <p className="text-xs text-amber-500 dark:text-amber-400">
                  {lookupError}
                </p>
              </div>
            )}

            {prefilledFromApi && !lookupError && (
              <div className="flex items-start gap-2 rounded-md border border-[#D4A35C]/30 bg-[#D4A35C]/5 px-3 py-2">
                <Wand2 className="h-3.5 w-3.5 text-[#D4A35C] mt-0.5 shrink-0" />
                <p className="text-xs text-[#D4A35C]">
                  Prefilled from public records. Review and correct any field.
                </p>
              </div>
            )}

            <div className="rounded-lg border border-border bg-card p-5">
              <FactsForm facts={facts} onChange={setFacts} />
            </div>

            {saveError && (
              <div className="flex items-start gap-2 rounded-md border border-destructive/30 bg-destructive/5 px-3 py-2">
                <AlertCircle className="h-3.5 w-3.5 text-destructive mt-0.5 shrink-0" />
                <p className="text-xs text-destructive">{saveError}</p>
              </div>
            )}

            <div className="flex items-center justify-between">
              <button
                type="button"
                onClick={() => setStep("address")}
                className="text-xs text-muted-foreground hover:text-foreground"
              >
                ← Change address
              </button>
              <button
                type="button"
                onClick={handleSave}
                disabled={saving}
                className="inline-flex items-center gap-2 px-4 py-2 text-sm font-medium rounded-md text-white shadow-sm transition-opacity hover:opacity-90 disabled:opacity-50"
                style={{
                  background:
                    "linear-gradient(135deg, #1E293B 0%, #D4A35C 100%)",
                }}
              >
                {saving ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : null}
                Create prospect
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function FactsForm({
  facts,
  onChange,
}: {
  facts: PropertyFacts;
  onChange: (next: PropertyFacts) => void;
}) {
  const set = <K extends keyof PropertyFacts>(k: K, v: PropertyFacts[K]) =>
    onChange({ ...facts, [k]: v });

  const numOrNull = (raw: string): number | null => {
    if (raw.trim() === "") return null;
    const n = Number(raw.replace(/[,$]/g, ""));
    return Number.isFinite(n) ? n : null;
  };

  return (
    <div className="grid grid-cols-2 gap-4">
      <Field label="City">
        <Input
          value={facts.city ?? ""}
          onChange={(v) => set("city", v || null)}
        />
      </Field>
      <Field label="State">
        <Input
          value={facts.state ?? ""}
          onChange={(v) => set("state", v || null)}
          maxLength={2}
          className="uppercase"
        />
      </Field>
      <Field label="ZIP">
        <Input
          value={facts.zip ?? ""}
          onChange={(v) => set("zip", v || null)}
          inputMode="numeric"
        />
      </Field>
      <Field label="Property type">
        <Select
          value={facts.property_type ?? ""}
          onChange={(v) => set("property_type", v || null)}
          options={[
            { value: "", label: "—" },
            { value: "single_family", label: "Single Family" },
            { value: "condo", label: "Condo" },
            { value: "townhouse", label: "Townhouse" },
            { value: "multi", label: "Multi-family" },
            { value: "land", label: "Land" },
            { value: "other", label: "Other" },
          ]}
        />
      </Field>
      <Field label="Beds">
        <Input
          value={facts.beds?.toString() ?? ""}
          onChange={(v) => set("beds", numOrNull(v))}
          inputMode="numeric"
        />
      </Field>
      <Field label="Baths">
        <Input
          value={facts.baths?.toString() ?? ""}
          onChange={(v) => set("baths", numOrNull(v))}
          inputMode="decimal"
        />
      </Field>
      <Field label="Living area (sqft)">
        <Input
          value={facts.living_area_sqft?.toString() ?? ""}
          onChange={(v) => set("living_area_sqft", numOrNull(v))}
          inputMode="numeric"
        />
      </Field>
      <Field label="Lot (sqft)">
        <Input
          value={facts.lot_area_sqft?.toString() ?? ""}
          onChange={(v) => set("lot_area_sqft", numOrNull(v))}
          inputMode="numeric"
        />
      </Field>
      <Field label="Year built">
        <Input
          value={facts.year_built?.toString() ?? ""}
          onChange={(v) => set("year_built", numOrNull(v))}
          inputMode="numeric"
        />
      </Field>
      <Field label="Garage spaces">
        <Input
          value={facts.garage_spaces?.toString() ?? ""}
          onChange={(v) => set("garage_spaces", numOrNull(v))}
          inputMode="numeric"
        />
      </Field>
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
    <label className="block">
      <span className="text-xs font-medium text-muted-foreground">{label}</span>
      <div className="mt-1.5">{children}</div>
    </label>
  );
}

function Input({
  value,
  onChange,
  className,
  ...rest
}: {
  value: string;
  onChange: (v: string) => void;
  className?: string;
  inputMode?: "numeric" | "decimal" | "text";
  maxLength?: number;
}) {
  return (
    <input
      type="text"
      value={value}
      onChange={(e) => onChange(e.target.value)}
      className={cn(
        "w-full h-10 px-3 rounded-md border border-border bg-background text-sm",
        className,
      )}
      {...rest}
    />
  );
}

function Select({
  value,
  onChange,
  options,
}: {
  value: string;
  onChange: (v: string) => void;
  options: { value: string; label: string }[];
}) {
  return (
    <select
      value={value}
      onChange={(e) => onChange(e.target.value)}
      className="w-full h-10 px-3 rounded-md border border-border bg-background text-sm"
    >
      {options.map((o) => (
        <option key={o.value} value={o.value}>
          {o.label}
        </option>
      ))}
    </select>
  );
}
