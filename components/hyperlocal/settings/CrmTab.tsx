"use client";

import { useState } from "react";
import { Plus, Trash2, Edit3, AlertCircle, CheckCircle2, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useHlToast } from "@/components/hyperlocal/use-hl-toast";
import { useHlDialog } from "@/components/hyperlocal/ui/HlDialog";
import { CRM_PLATFORM_LABELS } from "@/types/hyperlocal";
import type { HlCrmConnection, CrmPlatform } from "@/types/hyperlocal";
import { CrmConnectionForm } from "./CrmConnectionForm";

export function CrmTab({
  initialConnections,
}: {
  initialConnections: HlCrmConnection[];
}) {
  const toast = useHlToast();
  const { confirm, dialog } = useHlDialog();
  const [connections, setConnections] = useState(initialConnections);
  const [creating, setCreating] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [testingId, setTestingId] = useState<string | null>(null);

  const refresh = async () => {
    const res = await fetch("/api/apps/hyperlocal/crm-connections");
    const json = await res.json();
    setConnections(json.connections ?? []);
  };

  const remove = async (id: string) => {
    const ok = await confirm({
      title: "Disconnect this CRM?",
      message:
        "Past run history is unaffected, but future runs won't have access to these contacts.",
      confirmLabel: "Disconnect",
      destructive: true,
    });
    if (!ok) return;
    const res = await fetch(`/api/apps/hyperlocal/crm-connections/${id}`, {
      method: "DELETE",
    });
    if (!res.ok) {
      toast.error("Delete failed");
      return;
    }
    setConnections((prev) => prev.filter((c) => c.id !== id));
    toast.success("Disconnected");
  };

  const testConnection = async (id: string) => {
    setTestingId(id);
    try {
      const res = await fetch(
        `/api/apps/hyperlocal/crm-connections/${id}/test`,
        { method: "POST" }
      );
      const json = await res.json();
      if (json.ok) {
        toast.success(
          json.contact_count_estimate
            ? `Connected — ~${json.contact_count_estimate} contacts visible`
            : "Connected"
        );
      } else {
        toast.error("Connection failed", json.error);
      }
      await refresh();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Test failed");
    } finally {
      setTestingId(null);
    }
  };

  if (creating || editingId) {
    const editing = editingId
      ? connections.find((c) => c.id === editingId)
      : undefined;
    return (
      <CrmConnectionForm
        existing={editing}
        onCancel={() => {
          setCreating(false);
          setEditingId(null);
        }}
        onSaved={async () => {
          await refresh();
          setCreating(false);
          setEditingId(null);
          toast.success(editingId ? "Updated" : "Connected");
        }}
      />
    );
  }

  return (
    <div className="space-y-4">
      {dialog}
      <div className="flex items-start justify-between gap-4">
        <p className="text-sm text-muted-foreground">
          Connect a CRM so Hyperlocal can pull your contacts at campaign time.
          Supported in this release: Follow Up Boss, Lofty, and CSV upload.
          Other platforms ship in PR10.
        </p>
        <Button onClick={() => setCreating(true)} className="shrink-0">
          <Plus className="h-4 w-4 mr-2" /> Connect CRM
        </Button>
      </div>

      {connections.length === 0 ? (
        <div className="rounded-lg border border-dashed border-border p-8 text-center">
          <p className="text-sm text-muted-foreground mb-3">
            No CRM connections yet.
          </p>
          <Button onClick={() => setCreating(true)}>
            <Plus className="h-4 w-4 mr-2" /> Connect your first CRM
          </Button>
        </div>
      ) : (
        <ul className="space-y-2">
          {connections.map((c) => (
            <li
              key={c.id}
              className="rounded-lg border border-border bg-card p-4 flex items-start justify-between gap-4"
            >
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <p className="font-medium text-sm truncate">
                    {c.label || CRM_PLATFORM_LABELS[c.platform as CrmPlatform]}
                  </p>
                  {c.last_error ? (
                    <span className="inline-flex items-center gap-1 text-[10px] uppercase font-medium text-destructive bg-destructive/10 px-1.5 py-0.5 rounded">
                      <AlertCircle className="h-3 w-3" /> Error
                    </span>
                  ) : c.last_synced_at ? (
                    <span className="inline-flex items-center gap-1 text-[10px] uppercase font-medium text-emerald-500 bg-emerald-500/10 px-1.5 py-0.5 rounded">
                      <CheckCircle2 className="h-3 w-3" /> Connected
                    </span>
                  ) : null}
                </div>
                <p className="text-xs text-muted-foreground mt-0.5">
                  {CRM_PLATFORM_LABELS[c.platform as CrmPlatform]}
                  {c.last_synced_at &&
                    ` · last tested ${new Date(c.last_synced_at).toLocaleString()}`}
                </p>
                {c.last_error && (
                  <p className="text-xs text-destructive mt-1">{c.last_error}</p>
                )}
              </div>
              <div className="flex items-center gap-1 shrink-0">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => testConnection(c.id)}
                  disabled={testingId === c.id}
                >
                  {testingId === c.id ? (
                    <>
                      <Loader2 className="h-3 w-3 mr-1.5 animate-spin" /> Testing
                    </>
                  ) : (
                    "Test"
                  )}
                </Button>
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={() => setEditingId(c.id)}
                >
                  <Edit3 className="h-4 w-4" />
                </Button>
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={() => remove(c.id)}
                >
                  <Trash2 className="h-4 w-4 text-destructive" />
                </Button>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
