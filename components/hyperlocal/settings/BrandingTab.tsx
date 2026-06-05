"use client";

import { useState } from "react";
import { Plus, Star, Trash2, Edit3 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { useHlToast } from "@/components/hyperlocal/use-hl-toast";
import { useHlDialog } from "@/components/hyperlocal/ui/HlDialog";
import type {
  PlatformBrandingProfile,
  CornerStyle,
  ButtonShape,
  Density,
  HeaderTreatment,
} from "@/types/hyperlocal";

interface FormState {
  name: string;
  primary_color: string;
  secondary_color: string;
  accent_color: string;
  heading_font: string;
  body_font: string;
  corner_style: CornerStyle;
  button_shape: ButtonShape;
  density: Density;
  header_treatment: HeaderTreatment;
  logo_url: string;
  headshot_url: string;
  legal_disclaimer: string;
  is_default: boolean;
}

const EMPTY: FormState = {
  name: "Default",
  primary_color: "#1B7FB5",
  secondary_color: "#17A697",
  accent_color: "#31DBA5",
  heading_font: "Inter",
  body_font: "Inter",
  corner_style: "soft",
  button_shape: "rounded",
  density: "standard",
  header_treatment: "solid",
  logo_url: "",
  headshot_url: "",
  legal_disclaimer: "",
  is_default: false,
};

export function BrandingTab({
  initialProfiles,
}: {
  initialProfiles: PlatformBrandingProfile[];
}) {
  const toast = useHlToast();
  const { confirm, dialog } = useHlDialog();
  const [profiles, setProfiles] = useState(initialProfiles);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [creating, setCreating] = useState(initialProfiles.length === 0);
  const [form, setForm] = useState<FormState>({
    ...EMPTY,
    is_default: initialProfiles.length === 0,
  });
  const [saving, setSaving] = useState(false);

  const startEdit = (p: PlatformBrandingProfile) => {
    setEditingId(p.id);
    setCreating(false);
    setForm({
      name: p.name,
      primary_color: p.primary_color,
      secondary_color: p.secondary_color,
      accent_color: p.accent_color,
      heading_font: p.heading_font,
      body_font: p.body_font,
      corner_style: p.corner_style,
      button_shape: p.button_shape,
      density: p.density,
      header_treatment: p.header_treatment,
      logo_url: p.logo_url ?? "",
      headshot_url: p.headshot_url ?? "",
      legal_disclaimer: p.legal_disclaimer ?? "",
      is_default: p.is_default,
    });
  };

  const cancelEdit = () => {
    setEditingId(null);
    setCreating(false);
    setForm(EMPTY);
  };

  const save = async () => {
    if (!form.name.trim()) {
      toast.error("Name is required");
      return;
    }
    setSaving(true);
    try {
      const url = editingId
        ? `/api/apps/hyperlocal/branding-profiles/${editingId}`
        : "/api/apps/hyperlocal/branding-profiles";
      const res = await fetch(url, {
        method: editingId ? "PATCH" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "Save failed");
      const listRes = await fetch("/api/apps/hyperlocal/branding-profiles");
      const listJson = await listRes.json();
      setProfiles(listJson.profiles ?? []);
      toast.success(editingId ? "Brand updated" : "Brand created");
      cancelEdit();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Save failed");
    } finally {
      setSaving(false);
    }
  };

  const remove = async (id: string) => {
    const ok = await confirm({
      title: "Delete this branding profile?",
      message:
        "Campaigns using it will fall back to your other defaults at next run.",
      confirmLabel: "Delete",
      destructive: true,
    });
    if (!ok) return;
    const res = await fetch(`/api/apps/hyperlocal/branding-profiles/${id}`, {
      method: "DELETE",
    });
    if (!res.ok) {
      toast.error("Delete failed");
      return;
    }
    setProfiles((prev) => prev.filter((p) => p.id !== id));
    toast.success("Brand deleted");
  };

  return (
    <div className="space-y-6">
      {dialog}
      <p className="text-sm text-muted-foreground">
        Branding controls colors, fonts, and visual style for your email
        templates. The default profile is used unless you choose otherwise per
        campaign.
      </p>

      {!creating && !editingId && (
        <div className="space-y-2">
          {profiles.length === 0 ? (
            <div className="rounded-lg border border-dashed border-border p-8 text-center">
              <p className="text-sm text-muted-foreground mb-3">
                No branding profiles yet.
              </p>
              <Button onClick={() => setCreating(true)}>
                <Plus className="h-4 w-4 mr-2" /> Create brand
              </Button>
            </div>
          ) : (
            <>
              {profiles.map((p) => (
                <div
                  key={p.id}
                  className="rounded-lg border border-border bg-card p-4 flex items-start justify-between gap-4"
                >
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <p className="font-medium text-sm">{p.name}</p>
                      {p.is_default && (
                        <span className="inline-flex items-center gap-1 text-[10px] uppercase font-medium text-emerald-500 bg-emerald-500/10 px-1.5 py-0.5 rounded">
                          <Star className="h-3 w-3" /> Default
                        </span>
                      )}
                    </div>
                    <div className="flex items-center gap-1.5 mt-2">
                      <Swatch color={p.primary_color} />
                      <Swatch color={p.secondary_color} />
                      <Swatch color={p.accent_color} />
                      <span className="text-xs text-muted-foreground ml-2">
                        {p.heading_font} / {p.body_font}
                      </span>
                    </div>
                  </div>
                  <div className="flex items-center gap-1 shrink-0">
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => startEdit(p)}
                    >
                      <Edit3 className="h-4 w-4" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => remove(p.id)}
                    >
                      <Trash2 className="h-4 w-4 text-destructive" />
                    </Button>
                  </div>
                </div>
              ))}
              <Button variant="outline" onClick={() => setCreating(true)}>
                <Plus className="h-4 w-4 mr-2" /> Add another
              </Button>
            </>
          )}
        </div>
      )}

      {(creating || editingId) && (
        <div className="rounded-lg border border-border bg-card p-5 space-y-4">
          <h3 className="text-sm font-semibold">
            {editingId ? "Edit branding" : "New branding profile"}
          </h3>

          <Field label="Name" required>
            <Input
              value={form.name}
              onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
            />
          </Field>

          <div className="grid grid-cols-3 gap-3">
            <Field label="Primary">
              <input
                type="color"
                value={form.primary_color}
                onChange={(e) =>
                  setForm((f) => ({ ...f, primary_color: e.target.value }))
                }
                className="w-full h-10 rounded border border-border bg-transparent cursor-pointer"
              />
            </Field>
            <Field label="Secondary">
              <input
                type="color"
                value={form.secondary_color}
                onChange={(e) =>
                  setForm((f) => ({ ...f, secondary_color: e.target.value }))
                }
                className="w-full h-10 rounded border border-border bg-transparent cursor-pointer"
              />
            </Field>
            <Field label="Accent">
              <input
                type="color"
                value={form.accent_color}
                onChange={(e) =>
                  setForm((f) => ({ ...f, accent_color: e.target.value }))
                }
                className="w-full h-10 rounded border border-border bg-transparent cursor-pointer"
              />
            </Field>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <Field label="Heading font">
              <Input
                value={form.heading_font}
                onChange={(e) =>
                  setForm((f) => ({ ...f, heading_font: e.target.value }))
                }
              />
            </Field>
            <Field label="Body font">
              <Input
                value={form.body_font}
                onChange={(e) =>
                  setForm((f) => ({ ...f, body_font: e.target.value }))
                }
              />
            </Field>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <Select
              label="Corners"
              value={form.corner_style}
              onChange={(v) =>
                setForm((f) => ({ ...f, corner_style: v as CornerStyle }))
              }
              options={["sharp", "soft", "rounded", "pill"]}
            />
            <Select
              label="Buttons"
              value={form.button_shape}
              onChange={(v) =>
                setForm((f) => ({ ...f, button_shape: v as ButtonShape }))
              }
              options={["pill", "rounded", "square"]}
            />
            <Select
              label="Density"
              value={form.density}
              onChange={(v) =>
                setForm((f) => ({ ...f, density: v as Density }))
              }
              options={["compact", "standard", "airy"]}
            />
            <Select
              label="Header"
              value={form.header_treatment}
              onChange={(v) =>
                setForm((f) => ({
                  ...f,
                  header_treatment: v as HeaderTreatment,
                }))
              }
              options={["solid", "gradient", "image"]}
            />
          </div>

          <Field label="Logo URL">
            <Input
              value={form.logo_url}
              onChange={(e) =>
                setForm((f) => ({ ...f, logo_url: e.target.value }))
              }
              placeholder="https://..."
            />
          </Field>

          <Field label="Headshot URL">
            <Input
              value={form.headshot_url}
              onChange={(e) =>
                setForm((f) => ({ ...f, headshot_url: e.target.value }))
              }
              placeholder="https://..."
            />
          </Field>

          <Field label="Legal disclaimer">
            <Textarea
              value={form.legal_disclaimer}
              onChange={(e) =>
                setForm((f) => ({ ...f, legal_disclaimer: e.target.value }))
              }
              rows={2}
              placeholder="Equal housing opportunity. Information deemed reliable but not guaranteed..."
            />
          </Field>

          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={form.is_default}
              onChange={(e) =>
                setForm((f) => ({ ...f, is_default: e.target.checked }))
              }
            />
            Set as default brand
          </label>

          <div className="flex justify-end gap-2 pt-2">
            <Button variant="outline" onClick={cancelEdit} disabled={saving}>
              Cancel
            </Button>
            <Button onClick={save} disabled={saving}>
              {saving ? "Saving..." : editingId ? "Save changes" : "Create"}
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}

function Field({
  label,
  required,
  children,
}: {
  label: string;
  required?: boolean;
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-1.5">
      <label className="text-xs font-medium text-muted-foreground">
        {label}
        {required && <span className="text-destructive ml-0.5">*</span>}
      </label>
      {children}
    </div>
  );
}

function Select({
  label,
  value,
  onChange,
  options,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  options: string[];
}) {
  return (
    <div className="space-y-1.5">
      <label className="text-xs font-medium text-muted-foreground">{label}</label>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="w-full h-10 rounded-md border border-border bg-background px-3 text-sm"
      >
        {options.map((o) => (
          <option key={o} value={o}>
            {o[0].toUpperCase() + o.slice(1)}
          </option>
        ))}
      </select>
    </div>
  );
}

function Swatch({ color }: { color: string }) {
  return (
    <span
      className="inline-block w-5 h-5 rounded border border-border"
      style={{ backgroundColor: color }}
      title={color}
    />
  );
}
