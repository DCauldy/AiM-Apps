"use client";

import { useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Database, KeyRound, Mail, MapPin, Palette, User } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/components/ui/toast";
import { cn } from "@/lib/utils";
import { getStateRequirements } from "@/lib/hyperlocal/email/state-requirements";
import { FontSelect } from "@/components/profile/FontSelect";
import { ProfileCrmTab } from "@/components/profile/tabs/CrmTab";
import { ProfileMailTab } from "@/components/profile/tabs/MailTab";
import { ProfileIntegrationsTab } from "@/components/profile/tabs/IntegrationsTab";
import type { PlatformProfile, PlatformProfileUpdate } from "@/types/platform-profile";

interface Props {
  /** When provided, editor patches this profile; otherwise it POSTs to /api/profiles. */
  initialProfile?: PlatformProfile;
}

/** Internal /apps/ paths are the only safe return targets. */
function safeReturn(path: string | null): string {
  if (!path || !path.startsWith("/apps/")) return "/apps/profile";
  return path;
}

type FormState = Partial<PlatformProfile>;

type Tab = "bio" | "market" | "brand" | "crm" | "mail" | "integrations";

const TABS: {
  id: Tab;
  label: string;
  Icon: React.ComponentType<{ className?: string }>;
}[] = [
  { id: "bio", label: "Bio", Icon: User },
  { id: "market", label: "Market", Icon: MapPin },
  { id: "brand", label: "Brand", Icon: Palette },
  { id: "crm", label: "CRM", Icon: Database },
  { id: "mail", label: "Mail", Icon: Mail },
  { id: "integrations", label: "Integrations", Icon: KeyRound },
];

const PROFESSIONAL_TYPES = [
  { value: "solo_agent", label: "Solo Agent" },
  { value: "team_leader", label: "Team Leader" },
  { value: "team_agent", label: "Team Agent" },
  { value: "broker_owner", label: "Broker / Owner" },
  { value: "loan_officer", label: "Loan Officer" },
  { value: "title_executive", label: "Title Executive" },
];

function asArray(s: string | undefined | null): string[] {
  if (!s) return [];
  return s
    .split(",")
    .map((x) => x.trim())
    .filter(Boolean);
}

function joinArray(arr: string[] | undefined | null): string {
  return (arr ?? []).join(", ");
}

export function ProfileEditor({ initialProfile }: Props) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const returnTo = safeReturn(searchParams.get("return_to"));
  const { addToast } = useToast();
  const [submitting, setSubmitting] = useState(false);
  const isEdit = Boolean(initialProfile);

  // Tab state via ?tab= query param — mirrors the CMA settings pattern so
  // deep-links from other surfaces (e.g. compliance banners that want to
  // drop the agent on a specific tab) work without extra plumbing.
  const initialTabParam = searchParams.get("tab");
  const resolvedInitialTab: Tab = TABS.find((t) => t.id === (initialTabParam as Tab))
    ? (initialTabParam as Tab)
    : "bio";
  const [activeTab, setActiveTab] = useState<Tab>(resolvedInitialTab);

  const [form, setForm] = useState<FormState>(
    initialProfile ?? {
      display_name: "",
      country: "United States",
      primary_color: "#1B7FB5",
      secondary_color: "#17A697",
      accent_color: "#31DBA5",
      heading_font: "Inter",
      body_font: "Inter",
      corner_style: "soft",
      button_shape: "rounded",
      density: "standard",
      header_treatment: "solid",
      sign_off: "Talk soon,",
      metric_box_style: "card",
      divider_style: "subtle",
    }
  );

  const set = <K extends keyof FormState>(key: K, value: FormState[K]) =>
    setForm((prev) => ({ ...prev, [key]: value }));

  // State-aware disclosure requirements for Hyperlocal email compliance.
  // The compliance gate in lib/hyperlocal/email/compliance.ts blocks runs
  // when any of these are missing for a profile that wants to send.
  const stateReqs = getStateRequirements(form.state);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!form.display_name || form.display_name.trim().length === 0) {
      addToast({
        title: "Display name required",
        description: "Give this profile a label so you can recognize it in the switcher.",
        variant: "destructive",
      });
      return;
    }

    setSubmitting(true);
    try {
      const url = isEdit ? `/api/profiles/${initialProfile!.id}` : "/api/profiles";
      const method = isEdit ? "PATCH" : "POST";
      const body: PlatformProfileUpdate = {
        ...form,
        counties: asArray(joinArray(form.counties)),
        neighborhoods: asArray(joinArray(form.neighborhoods)),
        target_clients: asArray(joinArray(form.target_clients)),
        specializations: asArray(joinArray(form.specializations)),
        property_types: asArray(joinArray(form.property_types)),
        seo_keywords: asArray(joinArray(form.seo_keywords)),
      };

      const res = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error ?? `Request failed: ${res.status}`);
      }

      addToast({ title: isEdit ? "Profile updated" : "Profile created" });
      router.push(isEdit ? "/apps/profile" : returnTo);
      router.refresh();
    } catch (err) {
      addToast({
        title: "Could not save",
        description: err instanceof Error ? err.message : "Unknown error",
        variant: "destructive",
      });
    } finally {
      setSubmitting(false);
    }
  }

  const showSave = activeTab === "bio" || activeTab === "market" || activeTab === "brand";

  // Form wrapping is conditional: Bio/Market/Brand share form state +
  // need the Save button, so they go inside <form>. CRM + Mail tabs
  // have their own modal forms (Connect CRM, Resend setup, etc.) —
  // wrapping them in <form> would nest forms which HTML forbids and
  // React blocks at submit time. Hence: wrap only when the active
  // tab actually needs the outer form.
  const Wrapper = showSave ? "form" : "div";
  const wrapperProps = showSave
    ? { onSubmit, className: "max-w-3xl mx-auto p-6 space-y-8" }
    : { className: "max-w-3xl mx-auto p-6 space-y-8" };

  return (
    <Wrapper {...wrapperProps}>
      <div className="space-y-1">
        <h1 className="text-2xl font-bold">
          {isEdit ? `Edit ${initialProfile?.display_name}` : "New Profile"}
        </h1>
        <p className="text-sm text-muted-foreground">
          Everything you set here applies across Prompt Studio, Blog Engine, Hyperlocal, and Radar
          when this profile is active.
        </p>
      </div>

      <div className="border-b border-border -mx-6 sm:mx-0 overflow-x-auto">
        <nav className="flex gap-1 px-6 sm:px-0">
          {TABS.map((tab) => {
            const Icon = tab.Icon;
            const isActive = activeTab === tab.id;
            return (
              <button
                key={tab.id}
                type="button"
                onClick={() => setActiveTab(tab.id)}
                className={cn(
                  "relative inline-flex items-center gap-1.5 px-3 py-2 text-sm font-medium transition-colors whitespace-nowrap",
                  isActive
                    ? "text-foreground"
                    : "text-muted-foreground hover:text-foreground",
                )}
              >
                <Icon className="h-3.5 w-3.5" />
                {tab.label}
                {isActive && (
                  <span className="absolute bottom-0 left-3 right-3 h-0.5 bg-primary rounded-full" />
                )}
              </button>
            );
          })}
        </nav>
      </div>

      {activeTab === "bio" && (
        <>
          <Section title="Identity" description="Who this profile represents.">
            <Field label="Display name" required>
              <Input
                value={form.display_name ?? ""}
                onChange={(e) => set("display_name", e.target.value)}
                placeholder="Smith Team — RE/MAX"
                required
              />
            </Field>
            <Field label="Full name">
              <Input
                value={form.full_name ?? ""}
                onChange={(e) => set("full_name", e.target.value)}
                placeholder="Jane Smith"
              />
            </Field>
            <Field label="Title">
              <Input
                value={form.title ?? ""}
                onChange={(e) => set("title", e.target.value)}
                placeholder="Realtor"
              />
            </Field>
            <Field label="Professional type">
              <select
                value={form.professional_type ?? ""}
                onChange={(e) =>
                  set("professional_type", (e.target.value || null) as FormState["professional_type"])
                }
                className="w-full h-10 px-3 rounded-md border bg-background text-sm"
              >
                <option value="">—</option>
                {PROFESSIONAL_TYPES.map((p) => (
                  <option key={p.value} value={p.value}>
                    {p.label}
                  </option>
                ))}
              </select>
            </Field>
            <Field
              label="Brokerage"
              required={stateReqs.requires_brokerage_disclosure}
            >
              <Input
                value={form.brokerage ?? ""}
                onChange={(e) => set("brokerage", e.target.value)}
                placeholder="Coldwell Banker"
              />
            </Field>
            <Field label="Bio" className="md:col-span-2">
              <Textarea
                value={form.bio ?? ""}
                onChange={(e) => set("bio", e.target.value)}
                rows={3}
                placeholder="Short third-person bio used in blog post bylines and email footers."
              />
            </Field>
          </Section>

          <Section title="Contact & CAN-SPAM" description="Used by Hyperlocal for email footers and reply-to.">
            <Field label="Phone">
              <Input value={form.phone ?? ""} onChange={(e) => set("phone", e.target.value)} />
            </Field>
            <Field label="Reply-to email">
              <Input
                type="email"
                value={form.reply_to_email ?? ""}
                onChange={(e) => set("reply_to_email", e.target.value)}
              />
            </Field>
            <Field
              label="Physical address"
              required
              className="md:col-span-2"
            >
              <Input
                value={form.physical_address ?? ""}
                onChange={(e) => set("physical_address", e.target.value)}
                placeholder="123 Main St, Cincinnati, OH 45202"
              />
              <p className="text-xs text-muted-foreground mt-1">
                CAN-SPAM requires a valid postal address on every marketing email.
                Use your brokerage address — not a home address — to keep personal
                location out of your sends.
              </p>
            </Field>
            <Field label="Sign-off">
              <Input
                value={form.sign_off ?? ""}
                onChange={(e) => set("sign_off", e.target.value)}
                placeholder="Talk soon,"
              />
            </Field>
          </Section>

          <Section
            title="Compliance"
            description={
              form.state
                ? `${stateReqs.display_name} disclosure rules apply to this profile's outbound email. Hyperlocal blocks sends that are missing any required field.`
                : "License info and required disclaimers. Set your state above so we apply the right disclosure rules."
            }
          >
            <Field
              label="License number"
              required={stateReqs.requires_license_number}
            >
              <Input
                value={form.license_number ?? ""}
                onChange={(e) => set("license_number", e.target.value)}
                placeholder="e.g. SL-3416289"
              />
            </Field>
            <Field label="Regulatory body">
              <Input
                value={form.regulatory_body ?? ""}
                onChange={(e) => set("regulatory_body", e.target.value)}
                placeholder="e.g. Texas Real Estate Commission"
              />
            </Field>
            <Field
              label="License info / supervising broker"
              required={stateReqs.requires_supervising_broker}
              className="md:col-span-2"
            >
              <Textarea
                value={form.license_info ?? ""}
                onChange={(e) => set("license_info", e.target.value)}
                rows={2}
                placeholder={
                  stateReqs.requires_supervising_broker
                    ? `${stateReqs.display_name} requires the supervising / sponsoring broker name + license in agent marketing.`
                    : "Optional. Add supervising broker info here if your state requires it."
                }
              />
            </Field>
            <Field label="Compliance notes" className="md:col-span-2">
              <Textarea
                value={form.compliance_notes ?? ""}
                onChange={(e) => set("compliance_notes", e.target.value)}
                rows={2}
              />
            </Field>
            <Field label="Legal disclaimer (email footer)" className="md:col-span-2">
              <Textarea
                value={form.legal_disclaimer ?? ""}
                onChange={(e) => set("legal_disclaimer", e.target.value)}
                rows={3}
              />
            </Field>
          </Section>

          <Section title="Web presence" description="Used for citations and internal-linking.">
            <Field label="Website URL">
              <Input
                value={form.website_url ?? ""}
                onChange={(e) => set("website_url", e.target.value)}
                placeholder="https://yourdomain.com"
              />
            </Field>
            <Field label="Blog URL">
              <Input
                value={form.blog_url ?? ""}
                onChange={(e) => set("blog_url", e.target.value)}
                placeholder="https://yourdomain.com/blog"
              />
            </Field>
            <Field label="SEO keywords (comma-separated)" className="md:col-span-2">
              <Input
                value={joinArray(form.seo_keywords)}
                onChange={(e) => set("seo_keywords", asArray(e.target.value))}
                placeholder="Cincinnati luxury homes, Hyde Park real estate"
              />
            </Field>
          </Section>
        </>
      )}

      {activeTab === "market" && (
        <>
          <Section title="Market" description="Where this profile operates.">
            <Field label="Country">
              <Input value={form.country ?? ""} onChange={(e) => set("country", e.target.value)} />
            </Field>
            <Field label="State">
              <Input value={form.state ?? ""} onChange={(e) => set("state", e.target.value)} />
            </Field>
            <Field label="Metro area">
              <Input
                value={form.metro_area ?? ""}
                onChange={(e) => set("metro_area", e.target.value)}
                placeholder="Cincinnati, OH"
              />
            </Field>
            <Field label="Counties (comma-separated)">
              <Input
                value={joinArray(form.counties)}
                onChange={(e) => set("counties", asArray(e.target.value))}
                placeholder="Hamilton, Butler, Warren"
              />
            </Field>
            <Field label="Neighborhoods (comma-separated)" className="md:col-span-2">
              <Input
                value={joinArray(form.neighborhoods)}
                onChange={(e) => set("neighborhoods", asArray(e.target.value))}
                placeholder="Hyde Park, Mt. Lookout, Oakley"
              />
            </Field>
          </Section>

          <Section title="Business focus" description="Who you serve and what you sell.">
            <Field label="Target clients (comma-separated)">
              <Input
                value={joinArray(form.target_clients)}
                onChange={(e) => set("target_clients", asArray(e.target.value))}
                placeholder="First-time buyers, investors, downsizers"
              />
            </Field>
            <Field label="Specializations (comma-separated)">
              <Input
                value={joinArray(form.specializations)}
                onChange={(e) => set("specializations", asArray(e.target.value))}
                placeholder="Luxury, relocation, new construction"
              />
            </Field>
            <Field label="Property types (comma-separated)" className="md:col-span-2">
              <Input
                value={joinArray(form.property_types)}
                onChange={(e) => set("property_types", asArray(e.target.value))}
                placeholder="Single-family, condos, multi-family"
              />
            </Field>
          </Section>
        </>
      )}

      {activeTab === "brand" && (
        <Section title="Brand visuals" description="Colors and assets used by Blog Engine images, Hyperlocal emails, and product UI.">
          <Field label="Primary color">
            <ColorInput value={form.primary_color ?? "#1B7FB5"} onChange={(v) => set("primary_color", v)} />
          </Field>
          <Field label="Secondary color">
            <ColorInput value={form.secondary_color ?? "#17A697"} onChange={(v) => set("secondary_color", v)} />
          </Field>
          <Field label="Accent color">
            <ColorInput value={form.accent_color ?? "#31DBA5"} onChange={(v) => set("accent_color", v)} />
          </Field>
          <Field label="Heading font">
            <FontSelect
              value={form.heading_font}
              onChange={(v) => set("heading_font", v)}
              placeholder="Pick a heading font"
            />
          </Field>
          <Field label="Body font">
            <FontSelect
              value={form.body_font}
              onChange={(v) => set("body_font", v)}
              placeholder="Pick a body font"
            />
          </Field>
          <Field
            label="Logo URL"
            hint="Previews on the brand header color (matches the email)."
          >
            <ImagePreviewField
              value={form.logo_url ?? ""}
              onChange={(v) => set("logo_url", v)}
              // Match the renderer's email-header treatment so the preview
              // looks identical to what the recipient sees.
              background={form.primary_color ?? "#1B7FB5"}
              maxHeight={36}
              shape="rectangle"
            />
          </Field>
          <Field label="Headshot URL">
            <ImagePreviewField
              value={form.headshot_url ?? ""}
              onChange={(v) => set("headshot_url", v)}
              background="#f5f5f5"
              maxHeight={72}
              shape="circle"
            />
          </Field>
          <Field label="Brokerage badge URL">
            <ImagePreviewField
              value={form.brokerage_badge_url ?? ""}
              onChange={(v) => set("brokerage_badge_url", v)}
              background="#f5f5f5"
              maxHeight={48}
              shape="rectangle"
            />
          </Field>
        </Section>
      )}

      {activeTab === "crm" && (
        <ProfileCrmTab profileId={initialProfile?.id ?? null} />
      )}

      {activeTab === "mail" && (
        <ProfileMailTab profileId={initialProfile?.id ?? null} />
      )}

      {activeTab === "integrations" && (
        <ProfileIntegrationsTab profileId={initialProfile?.id ?? null} />
      )}

      {showSave && (
        <div className="flex justify-end gap-3 sticky bottom-0 bg-background border-t pt-4">
          <Button type="button" variant="outline" onClick={() => router.back()} disabled={submitting}>
            Cancel
          </Button>
          <Button type="submit" disabled={submitting}>
            {submitting ? "Saving…" : isEdit ? "Save changes" : "Create profile"}
          </Button>
        </div>
      )}
    </Wrapper>
  );
}

function Section({
  title,
  description,
  children,
}: {
  title: string;
  description?: string;
  children: React.ReactNode;
}) {
  return (
    <section className="space-y-4">
      <div>
        <h2 className="text-lg font-semibold">{title}</h2>
        {description && <p className="text-sm text-muted-foreground">{description}</p>}
      </div>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">{children}</div>
    </section>
  );
}

function Field({
  label,
  required,
  className,
  hint,
  children,
}: {
  label: string;
  required?: boolean;
  className?: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <div className={`space-y-1.5 ${className ?? ""}`}>
      <label className="text-sm font-medium leading-none">
        {label}
        {required && <span className="text-destructive ml-0.5">*</span>}
      </label>
      {children}
      {hint && <p className="text-xs text-muted-foreground">{hint}</p>}
    </div>
  );
}

function ImagePreviewField({
  value,
  onChange,
  background,
  maxHeight,
  shape,
}: {
  value: string;
  onChange: (v: string) => void;
  /** Backdrop the preview renders on. Use the brand primary color for the
   *  logo so the preview matches the email header. */
  background: string;
  /** Caps the rendered preview to the email's actual max-height for that
   *  asset (logo 36, badge 48, headshot 72) so the agent sees true scale. */
  maxHeight: number;
  shape: "rectangle" | "circle";
}) {
  const [loadError, setLoadError] = useState(false);
  const trimmed = value.trim();
  return (
    <div className="space-y-2">
      <Input
        value={value}
        onChange={(e) => {
          setLoadError(false);
          onChange(e.target.value);
        }}
        placeholder="https://…"
      />
      {trimmed && (
        <div
          className="rounded-md border border-border p-3 flex items-center justify-center"
          style={{ background }}
        >
          {loadError ? (
            <p className="text-xs text-muted-foreground">
              Couldn't load image — check the URL is publicly accessible.
            </p>
          ) : (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={trimmed}
              alt="Preview"
              style={{
                maxHeight: `${maxHeight}px`,
                width: "auto",
                display: "block",
                borderRadius: shape === "circle" ? "9999px" : "0",
              }}
              onError={() => setLoadError(true)}
            />
          )}
        </div>
      )}
    </div>
  );
}

function ColorInput({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  return (
    <div className="flex items-center gap-2">
      <input
        type="color"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="h-10 w-12 rounded border cursor-pointer"
      />
      <Input value={value} onChange={(e) => onChange(e.target.value)} className="font-mono text-xs" />
    </div>
  );
}
