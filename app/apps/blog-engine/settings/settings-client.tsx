"use client";

import { useState } from "react";
import {
  Save,
  Loader2,
  RotateCcw,
  Globe,
  Trash2,
  Plus,
  CheckCircle2,
  XCircle,
  AlertCircle,
  Eye,
  EyeOff,
  Webhook,
  Zap,
  ExternalLink,
} from "lucide-react";
import { useRouter } from "next/navigation";
import { cn } from "@/lib/utils";
import { BlogUpgradeModal } from "@/components/blog-engine/BlogUpgradeModal";
import { useToast } from "@/components/ui/toast";
import { BLOG_PACKS } from "@/lib/blog-packs";
import { getUserTierLabel } from "@/lib/blog-packs";
import type {
  BofuProfile,
  BofuSchedule,
  BofuCmsConnection,
  CmsPlatform,
  ProfessionalType,
  DayOfWeek,
} from "@/types/blog-engine";
import { PROFESSIONAL_TYPE_LABELS } from "@/types/blog-engine";

interface SettingsClientProps {
  profile: BofuProfile;
  schedule: BofuSchedule | null;
  cmsConnections: BofuCmsConnection[];
  frequencyTier: string;
  hasSubscription: boolean;
}

const DAYS_OF_WEEK: { key: DayOfWeek; label: string }[] = [
  { key: "monday", label: "Mon" },
  { key: "tuesday", label: "Tue" },
  { key: "wednesday", label: "Wed" },
  { key: "thursday", label: "Thu" },
  { key: "friday", label: "Fri" },
  { key: "saturday", label: "Sat" },
  { key: "sunday", label: "Sun" },
];

export function SettingsClient({
  profile: initialProfile,
  schedule: initialSchedule,
  cmsConnections,
  frequencyTier,
  hasSubscription,
}: SettingsClientProps) {
  const router = useRouter();
  const [profile, setProfile] = useState(initialProfile);
  const [schedule, setSchedule] = useState(
    initialSchedule || {
      frequency: 3,
      active_days: ["monday", "wednesday", "friday"] as DayOfWeek[],
      preferred_time: "08:00",
      timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
      is_active: true,
    }
  );
  const [connections, setConnections] = useState(cmsConnections);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  // CMS connection state
  const [testingId, setTestingId] = useState<string | null>(null);
  const [testResults, setTestResults] = useState<
    Record<string, { success: boolean; siteName?: string; error?: string }>
  >({});
  const [removingId, setRemovingId] = useState<string | null>(null);
  const [showAddForm, setShowAddForm] = useState(false);
  const [addPlatform, setAddPlatform] = useState<CmsPlatform | null>(null);
  const [addingConnection, setAddingConnection] = useState(false);
  const [addError, setAddError] = useState<string | null>(null);
  const [newWpConnection, setNewWpConnection] = useState({
    wp_site_url: "",
    wp_username: "",
    wp_app_password: "",
    wp_default_status: "draft" as "draft" | "publish",
    wp_seo_plugin: "none" as "yoast" | "rankmath" | "none",
  });
  const [newWebhookConnection, setNewWebhookConnection] = useState({
    webhook_url: "",
    webhook_secret: "",
  });

  // Upgrade modal
  const [showUpgradeModal, setShowUpgradeModal] = useState(false);
  const [managingSubscription, setManagingSubscription] = useState(false);
  const { addToast } = useToast();

  const handleTestConnection = async (connectionId: string) => {
    setTestingId(connectionId);
    setTestResults((prev) => ({ ...prev, [connectionId]: undefined! }));
    try {
      const res = await fetch("/api/apps/blog-engine/cms-connections/test", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ connectionId }),
      });
      const data = await res.json();
      setTestResults((prev) => ({
        ...prev,
        [connectionId]: {
          success: data.success,
          siteName: data.siteName,
          error: data.error,
        },
      }));
      // Clear last_error on success
      if (data.success) {
        setConnections((prev) =>
          prev.map((c) =>
            c.id === connectionId ? { ...c, last_error: undefined } : c
          )
        );
      }
    } catch {
      setTestResults((prev) => ({
        ...prev,
        [connectionId]: { success: false, error: "Network error" },
      }));
    } finally {
      setTestingId(null);
    }
  };

  const handleRemoveConnection = async (connectionId: string) => {
    if (!confirm("Remove this CMS connection?")) return;
    setRemovingId(connectionId);
    try {
      const res = await fetch("/api/apps/blog-engine/cms-connections", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ connectionId }),
      });
      if (res.ok) {
        setConnections((prev) => prev.filter((c) => c.id !== connectionId));
        setTestResults((prev) => {
          const next = { ...prev };
          delete next[connectionId];
          return next;
        });
      }
    } catch {
      console.error("Failed to remove connection");
    } finally {
      setRemovingId(null);
    }
  };

  const handleAddConnection = async () => {
    if (!addPlatform) return;

    let payload: Record<string, unknown>;
    if (addPlatform === "wordpress") {
      if (!newWpConnection.wp_site_url || !newWpConnection.wp_username || !newWpConnection.wp_app_password) return;
      payload = { platform: "wordpress", ...newWpConnection };
    } else {
      if (!newWebhookConnection.webhook_url) return;
      payload = { platform: "webhook", ...newWebhookConnection };
    }

    setAddingConnection(true);
    setAddError(null);
    try {
      const res = await fetch("/api/apps/blog-engine/cms-connections", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const data = await res.json();
      if (res.ok && data.connection) {
        setConnections((prev) => [...prev, data.connection]);
        setNewWpConnection({
          wp_site_url: "",
          wp_username: "",
          wp_app_password: "",
          wp_default_status: "draft",
          wp_seo_plugin: "none",
        });
        setNewWebhookConnection({ webhook_url: "", webhook_secret: "" });
        setShowAddForm(false);
        setAddPlatform(null);
      } else {
        setAddError(data.error || "Failed to add connection");
      }
    } catch {
      setAddError("Network error — could not reach server");
    } finally {
      setAddingConnection(false);
    }
  };

  const handleManageSubscription = async () => {
    setManagingSubscription(true);
    try {
      const res = await fetch("/api/apps/blog-engine/manage-subscription", {
        method: "POST",
      });
      const data = await res.json();
      if (res.ok && data.url) {
        window.location.href = data.url;
      } else {
        addToast({
          title: "Error",
          description: data.error || "Failed to open subscription portal",
          variant: "destructive",
        });
      }
    } catch {
      addToast({
        title: "Error",
        description: "Network error — could not reach server",
        variant: "destructive",
      });
    } finally {
      setManagingSubscription(false);
    }
  };

  const handleSave = async () => {
    setSaving(true);
    setSaved(false);

    try {
      // Save profile
      const profileRes = await fetch("/api/apps/blog-engine/profile", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          professional_type: profile.professional_type,
          full_name: profile.full_name,
          business_name: profile.business_name,
          bio: profile.bio,
          state: profile.state,
          metro_area: profile.metro_area,
          counties: profile.counties,
          neighborhoods: profile.neighborhoods,
          target_clients: profile.target_clients,
          property_types: profile.property_types,
          specializations: profile.specializations,
          website_url: profile.website_url,
          blog_url: profile.blog_url,
          seo_keywords: profile.seo_keywords,
          brand_colors: profile.brand_colors,
          cta_primary: profile.cta_primary,
          cta_link: profile.cta_link,
          cta_secondary: profile.cta_secondary,
          cta_secondary_link: profile.cta_secondary_link,
          license_info: profile.license_info,
          regulatory_body: profile.regulatory_body,
          compliance_notes: profile.compliance_notes,
          blog_tone: profile.blog_tone,
          include_disclaimers: profile.include_disclaimers,
        }),
      });

      // Save schedule
      const scheduleRes = await fetch("/api/apps/blog-engine/schedule", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(schedule),
      });

      if (profileRes.ok && scheduleRes.ok) {
        setSaved(true);
        setTimeout(() => setSaved(false), 3000);
      }
    } catch {
      console.error("Failed to save settings");
    } finally {
      setSaving(false);
    }
  };

  const handleReset = () => {
    if (
      confirm(
        "This will clear your profile and restart the onboarding process. Are you sure?"
      )
    ) {
      router.push("/apps/blog-engine/onboarding");
    }
  };

  return (
    <div className="h-full overflow-y-auto">
      <div className="max-w-3xl mx-auto px-6 py-8 space-y-8">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="font-sans text-xl font-bold text-foreground">Settings</h1>
            <p className="text-sm text-muted-foreground mt-1">
              Manage your Blog Engine profile and preferences
            </p>
          </div>
          <button
            onClick={handleSave}
            disabled={saving}
            className="flex items-center gap-2 px-4 py-2 text-sm font-medium rounded-lg bg-primary text-primary-foreground hover:bg-primary/90 disabled:opacity-50 transition-colors"
          >
            {saving ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : saved ? (
              <Save className="h-4 w-4 text-[#31DBA5]" />
            ) : (
              <Save className="h-4 w-4" />
            )}
            {saved ? "Saved" : "Save Changes"}
          </button>
        </div>

        {/* Professional Info */}
        <Section title="Professional Info">
          <Field label="Professional Type">
            <select
              value={profile.professional_type}
              onChange={(e) =>
                setProfile({
                  ...profile,
                  professional_type: e.target.value as ProfessionalType,
                })
              }
              className="w-full rounded-md border bg-background px-3 py-2 text-sm"
            >
              {Object.entries(PROFESSIONAL_TYPE_LABELS).map(([key, label]) => (
                <option key={key} value={key}>
                  {label}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Full Name">
            <input
              type="text"
              value={profile.full_name}
              onChange={(e) =>
                setProfile({ ...profile, full_name: e.target.value })
              }
              className="w-full rounded-md border bg-background px-3 py-2 text-sm"
            />
          </Field>
          <Field label="Business Name">
            <input
              type="text"
              value={profile.business_name || ""}
              onChange={(e) =>
                setProfile({ ...profile, business_name: e.target.value })
              }
              className="w-full rounded-md border bg-background px-3 py-2 text-sm"
            />
          </Field>
          <Field label="Bio">
            <textarea
              value={profile.bio || ""}
              onChange={(e) =>
                setProfile({ ...profile, bio: e.target.value })
              }
              rows={3}
              className="w-full rounded-md border bg-background px-3 py-2 text-sm resize-none"
            />
          </Field>
        </Section>

        {/* Market */}
        <Section title="Market & Location">
          <div className="grid grid-cols-2 gap-4">
            <Field label="State">
              <input
                type="text"
                value={profile.state}
                onChange={(e) =>
                  setProfile({ ...profile, state: e.target.value })
                }
                className="w-full rounded-md border bg-background px-3 py-2 text-sm"
              />
            </Field>
            <Field label="Metro Area">
              <input
                type="text"
                value={profile.metro_area}
                onChange={(e) =>
                  setProfile({ ...profile, metro_area: e.target.value })
                }
                className="w-full rounded-md border bg-background px-3 py-2 text-sm"
              />
            </Field>
          </div>
          <Field label="Neighborhoods (comma-separated)">
            <input
              type="text"
              value={profile.neighborhoods.join(", ")}
              onChange={(e) =>
                setProfile({
                  ...profile,
                  neighborhoods: e.target.value
                    .split(",")
                    .map((s) => s.trim())
                    .filter(Boolean),
                })
              }
              className="w-full rounded-md border bg-background px-3 py-2 text-sm"
            />
          </Field>
        </Section>

        {/* Content */}
        <Section title="Content & SEO">
          <Field label="Website URL">
            <input
              type="url"
              value={profile.website_url || ""}
              onChange={(e) =>
                setProfile({ ...profile, website_url: e.target.value })
              }
              className="w-full rounded-md border bg-background px-3 py-2 text-sm"
            />
          </Field>
          <Field label="Blog Tone">
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
          <Field label="SEO Keywords (comma-separated)">
            <input
              type="text"
              value={profile.seo_keywords.join(", ")}
              onChange={(e) =>
                setProfile({
                  ...profile,
                  seo_keywords: e.target.value
                    .split(",")
                    .map((s) => s.trim())
                    .filter(Boolean),
                })
              }
              className="w-full rounded-md border bg-background px-3 py-2 text-sm"
            />
          </Field>
        </Section>

        {/* CTAs */}
        <Section title="Call-to-Action">
          <Field label="Primary CTA Text">
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
          <Field label="CTA Link">
            <input
              type="text"
              value={profile.cta_link || ""}
              onChange={(e) =>
                setProfile({ ...profile, cta_link: e.target.value })
              }
              placeholder="e.g., https://calendly.com/..."
              className="w-full rounded-md border bg-background px-3 py-2 text-sm"
            />
          </Field>
        </Section>

        {/* Schedule */}
        <Section title="Schedule">
          <Field label="Blogs per Week">
            {hasSubscription ? (
              /* Active subscription — show tier badge + manage button */
              <div className="space-y-3">
                <div className="flex items-center gap-3">
                  <span
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium text-white"
                    style={{
                      background:
                        "linear-gradient(135deg, #1C4C8A 0%, #31DBA5 100%)",
                    }}
                  >
                    <Zap className="h-3.5 w-3.5" />
                    {getUserTierLabel(schedule.frequency)} — {schedule.frequency}x / week
                  </span>
                </div>
                <div className="flex items-center gap-2">
                  <button
                    onClick={handleManageSubscription}
                    disabled={managingSubscription}
                    className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-md border hover:bg-accent disabled:opacity-50 transition-colors"
                  >
                    {managingSubscription ? (
                      <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    ) : (
                      <ExternalLink className="h-3.5 w-3.5" />
                    )}
                    Manage Subscription
                  </button>
                </div>
              </div>
            ) : (
              /* No subscription — show base plan + upgrade CTA */
              <div className="space-y-3">
                <div className="flex items-center gap-2 px-3 py-2 rounded-md border bg-muted/30">
                  <span className="text-sm font-medium text-foreground">
                    3x per week
                  </span>
                  <span className="text-xs text-muted-foreground">(included with Pro)</span>
                </div>
                <div className="rounded-lg border border-dashed p-4">
                  <p className="text-sm font-medium text-foreground mb-1">
                    Want more blogs?
                  </p>
                  <p className="text-xs text-muted-foreground mb-3">
                    Upgrade to generate up to 7 blogs per week.
                  </p>
                  <div className="grid grid-cols-2 gap-2 mb-3">
                    {BLOG_PACKS.map((pack) => (
                      <div
                        key={pack.id}
                        className="text-xs text-muted-foreground"
                      >
                        <span className="font-medium text-foreground">{pack.label}</span>
                        {" — "}${(pack.priceCents / 100).toFixed(0)}/mo
                      </div>
                    ))}
                  </div>
                  <button
                    type="button"
                    onClick={() => setShowUpgradeModal(true)}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-md text-white transition-opacity hover:opacity-90"
                    style={{
                      background:
                        "linear-gradient(135deg, #1C4C8A 0%, #31DBA5 100%)",
                    }}
                  >
                    <Zap className="h-3.5 w-3.5" />
                    Upgrade
                  </button>
                </div>
              </div>
            )}
          </Field>
          <Field label="Active Days">
            <div className="flex gap-2">
              {DAYS_OF_WEEK.map((day) => (
                <button
                  key={day.key}
                  onClick={() => {
                    const active = schedule.active_days.includes(day.key);
                    setSchedule({
                      ...schedule,
                      active_days: active
                        ? schedule.active_days.filter((d) => d !== day.key)
                        : [...schedule.active_days, day.key],
                    });
                  }}
                  className={cn(
                    "px-3 py-1.5 text-xs font-medium rounded-md border transition-colors",
                    schedule.active_days.includes(day.key)
                      ? "bg-primary text-primary-foreground border-primary"
                      : "text-muted-foreground hover:text-foreground hover:bg-accent"
                  )}
                >
                  {day.label}
                </button>
              ))}
            </div>
          </Field>
          <Field label="Preferred Time">
            <input
              type="time"
              value={schedule.preferred_time}
              onChange={(e) =>
                setSchedule({ ...schedule, preferred_time: e.target.value })
              }
              className="w-full rounded-md border bg-background px-3 py-2 text-sm"
            />
          </Field>
        </Section>

        {/* CMS Connections */}
        <Section title="Publishing Destinations">
          {connections.length === 0 && !showAddForm ? (
            <div className="rounded-md border border-dashed p-6 text-center">
              <Globe className="h-8 w-8 text-muted-foreground/50 mx-auto mb-2" />
              <p className="text-sm text-muted-foreground mb-3">
                No publishing destinations configured.
              </p>
              <button
                onClick={() => setShowAddForm(true)}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-md bg-primary text-primary-foreground hover:bg-primary/90 transition-colors"
              >
                <Plus className="h-3.5 w-3.5" />
                Add Connection
              </button>
            </div>
          ) : (
            <div className="space-y-3">
              {connections.map((conn) => (
                <CmsConnectionCard
                  key={conn.id}
                  connection={conn}
                  testResult={testResults[conn.id]}
                  testing={testingId === conn.id}
                  removing={removingId === conn.id}
                  onTest={() => handleTestConnection(conn.id)}
                  onRemove={() => handleRemoveConnection(conn.id)}
                />
              ))}
              {!showAddForm && (
                <button
                  onClick={() => setShowAddForm(true)}
                  className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors"
                >
                  <Plus className="h-3.5 w-3.5" />
                  Add another connection
                </button>
              )}
            </div>
          )}

          {showAddForm && (
            <div className="rounded-md border p-4 space-y-3 mt-3">
              <div className="flex items-center justify-between">
                <h3 className="text-sm font-medium text-foreground">
                  {addPlatform === "wordpress"
                    ? "Add WordPress Connection"
                    : addPlatform === "webhook"
                      ? "Add Webhook Connection"
                      : "Add Connection"}
                </h3>
                <button
                  onClick={() => {
                    setShowAddForm(false);
                    setAddPlatform(null);
                    setAddError(null);
                  }}
                  className="text-xs text-muted-foreground hover:text-foreground"
                >
                  Cancel
                </button>
              </div>

              {/* Platform selector */}
              {!addPlatform && (
                <div className="grid grid-cols-2 gap-3">
                  <button
                    onClick={() => setAddPlatform("wordpress")}
                    className="flex flex-col items-center gap-2 rounded-md border border-border p-4 hover:border-primary hover:bg-accent/50 transition-colors"
                  >
                    <Globe className="h-6 w-6 text-foreground" />
                    <span className="text-sm font-medium text-foreground">WordPress</span>
                    <span className="text-[10px] text-muted-foreground text-center">
                      Publish directly via REST API
                    </span>
                  </button>
                  <button
                    onClick={() => setAddPlatform("webhook")}
                    className="flex flex-col items-center gap-2 rounded-md border border-border p-4 hover:border-primary hover:bg-accent/50 transition-colors"
                  >
                    <Webhook className="h-6 w-6 text-foreground" />
                    <span className="text-sm font-medium text-foreground">Webhook</span>
                    <span className="text-[10px] text-muted-foreground text-center">
                      Zapier, Make, or custom endpoint
                    </span>
                  </button>
                </div>
              )}

              {/* WordPress fields */}
              {addPlatform === "wordpress" && (
                <>
                  <Field label="Site URL">
                    <input
                      type="url"
                      value={newWpConnection.wp_site_url}
                      onChange={(e) =>
                        setNewWpConnection({ ...newWpConnection, wp_site_url: e.target.value })
                      }
                      placeholder="https://yourblog.com"
                      className="w-full rounded-md border bg-background px-3 py-2 text-sm"
                    />
                  </Field>
                  <Field label="Username">
                    <input
                      type="text"
                      value={newWpConnection.wp_username}
                      onChange={(e) =>
                        setNewWpConnection({ ...newWpConnection, wp_username: e.target.value })
                      }
                      placeholder="WordPress username"
                      className="w-full rounded-md border bg-background px-3 py-2 text-sm"
                    />
                  </Field>
                  <Field label="Application Password">
                    <input
                      type="password"
                      value={newWpConnection.wp_app_password}
                      onChange={(e) =>
                        setNewWpConnection({ ...newWpConnection, wp_app_password: e.target.value })
                      }
                      placeholder="xxxx xxxx xxxx xxxx xxxx xxxx"
                      className="w-full rounded-md border bg-background px-3 py-2 text-sm"
                    />
                  </Field>
                  <div className="grid grid-cols-2 gap-3">
                    <Field label="Default Post Status">
                      <select
                        value={newWpConnection.wp_default_status}
                        onChange={(e) =>
                          setNewWpConnection({
                            ...newWpConnection,
                            wp_default_status: e.target.value as "draft" | "publish",
                          })
                        }
                        className="w-full rounded-md border bg-background px-3 py-2 text-sm"
                      >
                        <option value="draft">Draft</option>
                        <option value="publish">Publish</option>
                      </select>
                    </Field>
                    <Field label="SEO Plugin">
                      <select
                        value={newWpConnection.wp_seo_plugin}
                        onChange={(e) =>
                          setNewWpConnection({
                            ...newWpConnection,
                            wp_seo_plugin: e.target.value as "yoast" | "rankmath" | "none",
                          })
                        }
                        className="w-full rounded-md border bg-background px-3 py-2 text-sm"
                      >
                        <option value="none">None</option>
                        <option value="yoast">Yoast SEO</option>
                        <option value="rankmath">Rank Math</option>
                      </select>
                    </Field>
                  </div>
                </>
              )}

              {/* Webhook fields */}
              {addPlatform === "webhook" && (
                <>
                  <Field label="Webhook URL">
                    <input
                      type="url"
                      value={newWebhookConnection.webhook_url}
                      onChange={(e) =>
                        setNewWebhookConnection({ ...newWebhookConnection, webhook_url: e.target.value })
                      }
                      placeholder="https://hooks.zapier.com/... or your endpoint"
                      className="w-full rounded-md border bg-background px-3 py-2 text-sm"
                    />
                  </Field>
                  <Field label="Signing Secret (optional)">
                    <input
                      type="password"
                      value={newWebhookConnection.webhook_secret}
                      onChange={(e) =>
                        setNewWebhookConnection({ ...newWebhookConnection, webhook_secret: e.target.value })
                      }
                      placeholder="HMAC-SHA256 secret for payload verification"
                      className="w-full rounded-md border bg-background px-3 py-2 text-sm"
                    />
                  </Field>
                  <p className="text-[10px] text-muted-foreground">
                    Blog data will be POSTed as JSON with an <code className="text-[10px]">X-AiM-Signature</code> header if a secret is set.
                    Works with Zapier, Make, n8n, or any custom endpoint.
                  </p>
                </>
              )}

              {addError && (
                <div className="flex items-start gap-2 rounded-md bg-destructive/5 px-3 py-2">
                  <AlertCircle className="h-3.5 w-3.5 text-destructive mt-0.5 shrink-0" />
                  <p className="text-xs text-destructive">{addError}</p>
                </div>
              )}
              {addPlatform && (
                <button
                  onClick={handleAddConnection}
                  disabled={
                    addingConnection ||
                    (addPlatform === "wordpress" &&
                      (!newWpConnection.wp_site_url || !newWpConnection.wp_username || !newWpConnection.wp_app_password)) ||
                    (addPlatform === "webhook" && !newWebhookConnection.webhook_url)
                  }
                  className="flex items-center gap-2 px-4 py-2 text-sm font-medium rounded-md bg-primary text-primary-foreground hover:bg-primary/90 disabled:opacity-50 transition-colors"
                >
                  {addingConnection ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <Plus className="h-4 w-4" />
                  )}
                  Add Connection
                </button>
              )}
            </div>
          )}
        </Section>

        {/* Reset */}
        <div className="border-t pt-6">
          <button
            onClick={handleReset}
            className="flex items-center gap-2 px-4 py-2 text-sm text-destructive hover:bg-destructive/5 rounded-lg transition-colors"
          >
            <RotateCcw className="h-4 w-4" />
            Reset & Re-run Setup
          </button>
          <p className="text-xs text-muted-foreground mt-1 ml-10">
            This will clear your profile and restart the onboarding process.
          </p>
        </div>
      </div>

      <BlogUpgradeModal
        open={showUpgradeModal}
        onClose={() => setShowUpgradeModal(false)}
        reason="cta"
      />
    </div>
  );
}

// Helper components
function Section({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-4">
      <h2 className="font-sans text-base font-semibold text-foreground">{title}</h2>
      <div className="space-y-4">{children}</div>
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

const SEO_PLUGIN_LABELS: Record<string, string> = {
  yoast: "Yoast SEO",
  rankmath: "Rank Math",
  none: "None",
};

function CmsConnectionCard({
  connection,
  testResult,
  testing,
  removing,
  onTest,
  onRemove,
}: {
  connection: BofuCmsConnection;
  testResult?: { success: boolean; siteName?: string; error?: string };
  testing: boolean;
  removing: boolean;
  onTest: () => void;
  onRemove: () => void;
}) {
  const [showPassword, setShowPassword] = useState(false);

  return (
    <div className="rounded-md border p-4 space-y-3">
      <div className="flex items-start justify-between">
        <div className="flex items-center gap-2.5">
          <div className="flex h-8 w-8 items-center justify-center rounded-md bg-accent">
            <Globe className="h-4 w-4 text-foreground" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <p className="text-sm font-medium text-foreground capitalize">
                {connection.platform}
              </p>
              <span
                className={cn(
                  "inline-flex items-center px-1.5 py-0.5 text-[10px] font-medium rounded-full",
                  connection.is_active
                    ? "border border-[#31DBA5]/40 text-[#31DBA5]"
                    : "border border-border text-muted-foreground"
                )}
              >
                {connection.is_active ? "Active" : "Inactive"}
              </span>
            </div>
            <p className="text-xs text-muted-foreground">
              {connection.wp_site_url || connection.webhook_url || "Connected"}
            </p>
          </div>
        </div>
      </div>

      {/* Connection details */}
      {connection.platform === "wordpress" && (
        <div className="grid grid-cols-2 gap-x-6 gap-y-1 text-xs">
          {connection.wp_username && (
            <div className="flex justify-between">
              <span className="text-muted-foreground">Username</span>
              <span className="text-foreground">{connection.wp_username}</span>
            </div>
          )}
          <div className="flex justify-between">
            <span className="text-muted-foreground">Password</span>
            <button
              onClick={() => setShowPassword(!showPassword)}
              className="flex items-center gap-1 text-foreground hover:text-primary transition-colors"
            >
              {showPassword ? "••••••••" : "••••••••"}
              {showPassword ? (
                <EyeOff className="h-3 w-3" />
              ) : (
                <Eye className="h-3 w-3" />
              )}
            </button>
          </div>
          <div className="flex justify-between">
            <span className="text-muted-foreground">Default status</span>
            <span className="text-foreground capitalize">
              {connection.wp_default_status}
            </span>
          </div>
          <div className="flex justify-between">
            <span className="text-muted-foreground">SEO plugin</span>
            <span className="text-foreground">
              {SEO_PLUGIN_LABELS[connection.wp_seo_plugin] || connection.wp_seo_plugin}
            </span>
          </div>
          {connection.last_publish_at && (
            <div className="flex justify-between">
              <span className="text-muted-foreground">Last published</span>
              <span className="text-foreground">
                {new Date(connection.last_publish_at).toLocaleDateString()}
              </span>
            </div>
          )}
        </div>
      )}

      {connection.platform === "webhook" && (
        <div className="space-y-1 text-xs">
          <div className="flex justify-between">
            <span className="text-muted-foreground">Endpoint</span>
            <span className="text-foreground truncate max-w-[240px]">
              {connection.webhook_url}
            </span>
          </div>
          <div className="flex justify-between">
            <span className="text-muted-foreground">Signing secret</span>
            <span className="text-foreground">
              {connection.webhook_secret ? "Configured" : "None"}
            </span>
          </div>
          {connection.last_publish_at && (
            <div className="flex justify-between">
              <span className="text-muted-foreground">Last published</span>
              <span className="text-foreground">
                {new Date(connection.last_publish_at).toLocaleDateString()}
              </span>
            </div>
          )}
        </div>
      )}

      {/* Error display */}
      {connection.last_error && !testResult && (
        <div className="flex items-start gap-2 rounded-md bg-destructive/5 px-3 py-2">
          <AlertCircle className="h-3.5 w-3.5 text-destructive mt-0.5 shrink-0" />
          <p className="text-xs text-destructive">{connection.last_error}</p>
        </div>
      )}

      {/* Test result */}
      {testResult && (
        <div
          className={cn(
            "flex items-start gap-2 rounded-md px-3 py-2",
            testResult.success ? "bg-[#31DBA5]/5" : "bg-destructive/5"
          )}
        >
          {testResult.success ? (
            <CheckCircle2 className="h-3.5 w-3.5 text-[#31DBA5] mt-0.5 shrink-0" />
          ) : (
            <XCircle className="h-3.5 w-3.5 text-destructive mt-0.5 shrink-0" />
          )}
          <p
            className={cn(
              "text-xs",
              testResult.success ? "text-[#31DBA5]" : "text-destructive"
            )}
          >
            {testResult.success
              ? `Connected${testResult.siteName ? ` to ${testResult.siteName}` : ""}`
              : testResult.error || "Connection failed"}
          </p>
        </div>
      )}

      {/* Actions */}
      <div className="flex items-center gap-2 pt-1">
        <button
          onClick={onTest}
          disabled={testing}
          className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-md border hover:bg-accent disabled:opacity-50 transition-colors"
        >
          {testing ? (
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
          ) : (
            <Globe className="h-3.5 w-3.5" />
          )}
          Test Connection
        </button>
        <button
          onClick={onRemove}
          disabled={removing}
          className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-md text-destructive hover:bg-destructive/5 disabled:opacity-50 transition-colors"
        >
          {removing ? (
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
          ) : (
            <Trash2 className="h-3.5 w-3.5" />
          )}
          Remove
        </button>
      </div>
    </div>
  );
}
