"use client";

import { useState } from "react";
import { Loader2, Save } from "lucide-react";

import { useToast } from "@/components/ui/toast";
import type { BofuProfile } from "@/types/blog-engine";

// Blog-Engine-only fields. Identity fields live on Profile, so this
// tab is intentionally narrow: voice + CTAs + disclaimer toggle.
export function ToneCtasTab({
  initialProfile,
}: {
  initialProfile: BofuProfile;
}) {
  const { addToast } = useToast();
  const [profile, setProfile] = useState(initialProfile);
  const [saving, setSaving] = useState(false);

  const handleSave = async () => {
    setSaving(true);
    try {
      // PUT only the app-specific fields. The route splits payload by
      // table (platform_profiles vs bofu_schedules) and these all
      // route to bofu_schedules.
      const res = await fetch("/api/apps/blog-engine/profile", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          blog_tone: profile.blog_tone,
          include_disclaimers: profile.include_disclaimers,
          cta_primary: profile.cta_primary,
          cta_link: profile.cta_link,
          cta_secondary: profile.cta_secondary,
          cta_secondary_link: profile.cta_secondary_link,
        }),
      });
      if (res.ok) {
        addToast({
          title: "Saved",
          description: "Blog tone and CTAs updated.",
        });
      } else {
        const data = await res.json().catch(() => ({}));
        addToast({
          title: "Save failed",
          description: data.error || "Could not save",
          variant: "destructive",
        });
      }
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="rounded-lg border border-border bg-card p-5 space-y-5">
        <h2 className="text-sm font-semibold text-foreground">Voice</h2>
        <Field label="Blog tone">
          <select
            value={profile.blog_tone}
            onChange={(e) =>
              setProfile({
                ...profile,
                blog_tone: e.target.value as BofuProfile["blog_tone"],
              })
            }
            className="w-full rounded-md border bg-background px-3 py-2 text-sm"
          >
            <option value="professional">Professional</option>
            <option value="conversational">Conversational</option>
            <option value="authoritative">Authoritative</option>
          </select>
        </Field>

        <Field label="Include compliance disclaimers in posts">
          <label className="flex items-center gap-2 cursor-pointer">
            <input
              type="checkbox"
              checked={!!profile.include_disclaimers}
              onChange={(e) =>
                setProfile({
                  ...profile,
                  include_disclaimers: e.target.checked,
                })
              }
              className="h-4 w-4 rounded border-border"
            />
            <span className="text-sm text-muted-foreground">
              Append your Profile&apos;s legal disclaimer to each post footer.
            </span>
          </label>
        </Field>
      </div>

      <div className="rounded-lg border border-border bg-card p-5 space-y-5">
        <div>
          <h2 className="text-sm font-semibold text-foreground">
            Calls to action
          </h2>
          <p className="text-xs text-muted-foreground mt-0.5">
            Used at the end of each blog post. Secondary is optional.
          </p>
        </div>

        <Field label="Primary CTA text">
          <input
            type="text"
            value={profile.cta_primary || ""}
            onChange={(e) =>
              setProfile({ ...profile, cta_primary: e.target.value })
            }
            placeholder="e.g., Schedule a consultation"
            className="w-full rounded-md border bg-background px-3 py-2 text-sm"
          />
        </Field>
        <Field label="Primary CTA link">
          <input
            type="text"
            value={profile.cta_link || ""}
            onChange={(e) =>
              setProfile({ ...profile, cta_link: e.target.value })
            }
            placeholder="https://calendly.com/..."
            className="w-full rounded-md border bg-background px-3 py-2 text-sm"
          />
        </Field>

        <Field label="Secondary CTA text">
          <input
            type="text"
            value={profile.cta_secondary || ""}
            onChange={(e) =>
              setProfile({ ...profile, cta_secondary: e.target.value })
            }
            placeholder="e.g., Get a home valuation"
            className="w-full rounded-md border bg-background px-3 py-2 text-sm"
          />
        </Field>
        <Field label="Secondary CTA link">
          <input
            type="text"
            value={profile.cta_secondary_link || ""}
            onChange={(e) =>
              setProfile({ ...profile, cta_secondary_link: e.target.value })
            }
            placeholder="https://..."
            className="w-full rounded-md border bg-background px-3 py-2 text-sm"
          />
        </Field>
      </div>

      <div className="flex justify-end">
        <button
          onClick={handleSave}
          disabled={saving}
          className="flex items-center gap-2 px-4 py-2 text-sm font-medium rounded-lg bg-primary text-primary-foreground hover:bg-primary/90 disabled:opacity-50 transition-colors"
        >
          {saving ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <Save className="h-4 w-4" />
          )}
          Save tone & CTAs
        </button>
      </div>
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
    <div>
      <label className="block text-xs font-medium text-muted-foreground mb-1.5">
        {label}
      </label>
      {children}
    </div>
  );
}
