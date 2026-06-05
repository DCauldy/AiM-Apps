"use client";

import { useState } from "react";
import { Plus, Star, Trash2, Edit3 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { useHlToast } from "@/components/hyperlocal/use-hl-toast";
import { useHlDialog } from "@/components/hyperlocal/ui/HlDialog";
import type { PlatformSenderProfile } from "@/types/hyperlocal";

interface FormState {
  full_name: string;
  title: string;
  brokerage: string;
  phone: string;
  reply_to_email: string;
  license_number: string;
  physical_address: string;
  sign_off: string;
  is_default: boolean;
}

const EMPTY_FORM: FormState = {
  full_name: "",
  title: "",
  brokerage: "",
  phone: "",
  reply_to_email: "",
  license_number: "",
  physical_address: "",
  sign_off: "Talk soon,",
  is_default: false,
};

export function SenderTab({
  initialProfiles,
}: {
  initialProfiles: PlatformSenderProfile[];
}) {
  const toast = useHlToast();
  const { confirm, dialog } = useHlDialog();
  const [profiles, setProfiles] = useState(initialProfiles);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [creating, setCreating] = useState(initialProfiles.length === 0);
  const [form, setForm] = useState<FormState>({
    ...EMPTY_FORM,
    is_default: initialProfiles.length === 0,
  });
  const [saving, setSaving] = useState(false);

  const startEdit = (p: PlatformSenderProfile) => {
    setEditingId(p.id);
    setCreating(false);
    setForm({
      full_name: p.full_name,
      title: p.title ?? "",
      brokerage: p.brokerage ?? "",
      phone: p.phone ?? "",
      reply_to_email: p.reply_to_email ?? "",
      license_number: p.license_number ?? "",
      physical_address: p.physical_address,
      sign_off: p.sign_off,
      is_default: p.is_default,
    });
  };

  const cancelEdit = () => {
    setEditingId(null);
    setCreating(false);
    setForm(EMPTY_FORM);
  };

  const save = async () => {
    if (!form.full_name.trim() || !form.physical_address.trim()) {
      toast.error("Full name and physical address are required (CAN-SPAM)");
      return;
    }
    setSaving(true);
    try {
      const url = editingId
        ? `/api/apps/hyperlocal/sender-profiles/${editingId}`
        : "/api/apps/hyperlocal/sender-profiles";
      const method = editingId ? "PATCH" : "POST";
      const res = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "Save failed");

      // Refresh list
      const listRes = await fetch("/api/apps/hyperlocal/sender-profiles");
      const listJson = await listRes.json();
      setProfiles(listJson.profiles ?? []);
      toast.success(editingId ? "Profile updated" : "Profile created");
      cancelEdit();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Save failed");
    } finally {
      setSaving(false);
    }
  };

  const remove = async (id: string) => {
    const ok = await confirm({
      title: "Delete this sender profile?",
      message:
        "Campaigns that reference it will need a new sender before they can run.",
      confirmLabel: "Delete",
      destructive: true,
    });
    if (!ok) return;
    const res = await fetch(`/api/apps/hyperlocal/sender-profiles/${id}`, {
      method: "DELETE",
    });
    if (!res.ok) {
      toast.error("Delete failed");
      return;
    }
    setProfiles((prev) => prev.filter((p) => p.id !== id));
    toast.success("Profile deleted");
  };

  return (
    <div className="space-y-6">
      {dialog}
      <div>
        <p className="text-sm text-muted-foreground">
          CAN-SPAM requires every commercial email to include a physical address
          and identify the sender. Set up at least one profile to enable sending.
        </p>
      </div>

      {/* Existing profiles */}
      {!creating && !editingId && (
        <div className="space-y-2">
          {profiles.length === 0 ? (
            <div className="rounded-lg border border-dashed border-border p-8 text-center">
              <p className="text-sm text-muted-foreground mb-3">
                No sender profiles yet.
              </p>
              <Button onClick={() => setCreating(true)}>
                <Plus className="h-4 w-4 mr-2" /> Add sender profile
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
                      <p className="font-medium text-sm">{p.full_name}</p>
                      {p.is_default && (
                        <span className="inline-flex items-center gap-1 text-[10px] uppercase font-medium text-emerald-500 bg-emerald-500/10 px-1.5 py-0.5 rounded">
                          <Star className="h-3 w-3" /> Default
                        </span>
                      )}
                    </div>
                    {p.title && (
                      <p className="text-xs text-muted-foreground mt-0.5">
                        {p.title}
                        {p.brokerage ? ` · ${p.brokerage}` : ""}
                      </p>
                    )}
                    <p className="text-xs text-muted-foreground mt-1.5 whitespace-pre-line">
                      {p.physical_address}
                    </p>
                  </div>
                  <div className="flex items-center gap-1 shrink-0">
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => startEdit(p)}
                      title="Edit"
                    >
                      <Edit3 className="h-4 w-4" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => remove(p.id)}
                      title="Delete"
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

      {/* Edit/create form */}
      {(creating || editingId) && (
        <div className="rounded-lg border border-border bg-card p-5 space-y-4">
          <h3 className="text-sm font-semibold">
            {editingId ? "Edit sender profile" : "New sender profile"}
          </h3>

          <Field label="Full name" required>
            <Input
              value={form.full_name}
              onChange={(e) =>
                setForm((f) => ({ ...f, full_name: e.target.value }))
              }
              placeholder="Jane Smith"
            />
          </Field>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <Field label="Title">
              <Input
                value={form.title}
                onChange={(e) =>
                  setForm((f) => ({ ...f, title: e.target.value }))
                }
                placeholder="Realtor, ABR"
              />
            </Field>
            <Field label="Brokerage">
              <Input
                value={form.brokerage}
                onChange={(e) =>
                  setForm((f) => ({ ...f, brokerage: e.target.value }))
                }
                placeholder="Caldwell Realty Group"
              />
            </Field>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <Field label="Phone">
              <Input
                value={form.phone}
                onChange={(e) =>
                  setForm((f) => ({ ...f, phone: e.target.value }))
                }
                placeholder="(555) 555-5555"
              />
            </Field>
            <Field label="Reply-to email">
              <Input
                type="email"
                value={form.reply_to_email}
                onChange={(e) =>
                  setForm((f) => ({ ...f, reply_to_email: e.target.value }))
                }
                placeholder="jane@brokerage.com"
              />
            </Field>
          </div>

          <Field label="License number">
            <Input
              value={form.license_number}
              onChange={(e) =>
                setForm((f) => ({ ...f, license_number: e.target.value }))
              }
              placeholder="123456"
            />
          </Field>

          <Field
            label="Physical address"
            required
            hint="Required by CAN-SPAM. Appears in every email footer."
          >
            <Textarea
              value={form.physical_address}
              onChange={(e) =>
                setForm((f) => ({ ...f, physical_address: e.target.value }))
              }
              placeholder="123 Main St&#10;Brentwood, TN 37027"
              rows={3}
            />
          </Field>

          <Field label="Sign-off">
            <Input
              value={form.sign_off}
              onChange={(e) =>
                setForm((f) => ({ ...f, sign_off: e.target.value }))
              }
              placeholder="Talk soon,"
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
            Set as default sender
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
  hint,
  children,
}: {
  label: string;
  required?: boolean;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-1.5">
      <label className="text-xs font-medium text-muted-foreground">
        {label}
        {required && <span className="text-destructive ml-0.5">*</span>}
      </label>
      {children}
      {hint && <p className="text-xs text-muted-foreground">{hint}</p>}
    </div>
  );
}
