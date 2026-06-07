"use client";

import { useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/components/ui/toast";
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

  return (
    <form onSubmit={onSubmit} className="max-w-3xl mx-auto p-6 space-y-8">
      <div className="space-y-1">
        <h1 className="text-2xl font-bold">
          {isEdit ? `Edit ${initialProfile?.display_name}` : "New Profile"}
        </h1>
        <p className="text-sm text-muted-foreground">
          Everything you set here applies across Prompt Studio, Blog Engine, Hyperlocal, and Radar
          when this profile is active.
        </p>
      </div>

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
        <Field label="Brokerage">
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
        <Field label="Physical address (required for outbound email)" className="md:col-span-2">
          <Input
            value={form.physical_address ?? ""}
            onChange={(e) => set("physical_address", e.target.value)}
            placeholder="123 Main St, Cincinnati, OH 45202"
          />
        </Field>
        <Field label="Sign-off">
          <Input
            value={form.sign_off ?? ""}
            onChange={(e) => set("sign_off", e.target.value)}
            placeholder="Talk soon,"
          />
        </Field>
      </Section>

      <Section title="Compliance" description="License info and required disclaimers.">
        <Field label="License number">
          <Input
            value={form.license_number ?? ""}
            onChange={(e) => set("license_number", e.target.value)}
          />
        </Field>
        <Field label="Regulatory body">
          <Input
            value={form.regulatory_body ?? ""}
            onChange={(e) => set("regulatory_body", e.target.value)}
          />
        </Field>
        <Field label="License info" className="md:col-span-2">
          <Textarea
            value={form.license_info ?? ""}
            onChange={(e) => set("license_info", e.target.value)}
            rows={2}
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
          <Input value={form.heading_font ?? ""} onChange={(e) => set("heading_font", e.target.value)} />
        </Field>
        <Field label="Body font">
          <Input value={form.body_font ?? ""} onChange={(e) => set("body_font", e.target.value)} />
        </Field>
        <Field label="Logo URL">
          <Input value={form.logo_url ?? ""} onChange={(e) => set("logo_url", e.target.value)} />
        </Field>
        <Field label="Headshot URL">
          <Input value={form.headshot_url ?? ""} onChange={(e) => set("headshot_url", e.target.value)} />
        </Field>
        <Field label="Brokerage badge URL">
          <Input
            value={form.brokerage_badge_url ?? ""}
            onChange={(e) => set("brokerage_badge_url", e.target.value)}
          />
        </Field>
      </Section>

      <div className="flex justify-end gap-3 sticky bottom-0 bg-background border-t pt-4">
        <Button type="button" variant="outline" onClick={() => router.back()} disabled={submitting}>
          Cancel
        </Button>
        <Button type="submit" disabled={submitting}>
          {submitting ? "Saving…" : isEdit ? "Save changes" : "Create profile"}
        </Button>
      </div>
    </form>
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
  children,
}: {
  label: string;
  required?: boolean;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <div className={`space-y-1.5 ${className ?? ""}`}>
      <label className="text-sm font-medium leading-none">
        {label}
        {required && <span className="text-destructive ml-0.5">*</span>}
      </label>
      {children}
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
