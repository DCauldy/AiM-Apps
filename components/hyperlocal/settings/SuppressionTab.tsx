"use client";

import { useState } from "react";
import { Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useHlToast } from "@/components/hyperlocal/use-hl-toast";
import { useHlDialog } from "@/components/hyperlocal/ui/HlDialog";
import type { HlSuppression } from "@/types/hyperlocal";

const REASON_LABELS: Record<HlSuppression["reason"], string> = {
  unsubscribed: "Unsubscribed",
  bounced: "Hard bounce",
  complained: "Spam complaint",
  manual: "Added manually",
};

export function SuppressionTab({
  initialSuppressions,
}: {
  initialSuppressions: HlSuppression[];
}) {
  const toast = useHlToast();
  const { confirm, dialog } = useHlDialog();
  const [suppressions, setSuppressions] = useState(initialSuppressions);
  const [email, setEmail] = useState("");
  const [adding, setAdding] = useState(false);

  const add = async () => {
    const trimmed = email.trim().toLowerCase();
    if (!trimmed) return;
    setAdding(true);
    try {
      const res = await fetch("/api/apps/hyperlocal/suppressions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: trimmed }),
      });
      if (!res.ok) throw new Error("Failed");
      const listRes = await fetch("/api/apps/hyperlocal/suppressions");
      const json = await listRes.json();
      setSuppressions(json.suppressions ?? []);
      setEmail("");
      toast.success("Suppression added");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed");
    } finally {
      setAdding(false);
    }
  };

  const remove = async (target: string) => {
    const ok = await confirm({
      title: "Remove from suppression list?",
      message: `${target} will be eligible to receive future campaigns again.`,
      confirmLabel: "Remove",
    });
    if (!ok) return;
    const res = await fetch(
      `/api/apps/hyperlocal/suppressions?email=${encodeURIComponent(target)}`,
      { method: "DELETE" }
    );
    if (!res.ok) {
      toast.error("Failed to remove");
      return;
    }
    setSuppressions((prev) => prev.filter((s) => s.email !== target));
    toast.success("Removed from suppression");
  };

  return (
    <div className="space-y-6">
      {dialog}
      <p className="text-sm text-muted-foreground">
        Suppressed addresses are skipped on every send. Bounces, complaints, and
        unsubscribes land here automatically. You can also add or remove
        addresses manually.
      </p>

      <div className="rounded-lg border border-border bg-card p-4">
        <p className="text-xs font-medium text-muted-foreground mb-2">
          Add suppression manually
        </p>
        <div className="flex gap-2">
          <Input
            type="email"
            placeholder="user@example.com"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="flex-1"
          />
          <Button onClick={add} disabled={adding || !email.trim()}>
            <Plus className="h-4 w-4 mr-2" /> Add
          </Button>
        </div>
      </div>

      <div className="rounded-lg border border-border bg-card">
        <div className="px-4 py-3 border-b border-border">
          <p className="text-sm font-semibold">
            {suppressions.length} suppressed{" "}
            {suppressions.length === 1 ? "address" : "addresses"}
          </p>
        </div>
        {suppressions.length === 0 ? (
          <p className="text-sm text-muted-foreground text-center py-8">
            No suppressions yet.
          </p>
        ) : (
          <ul className="divide-y divide-border">
            {suppressions.map((s) => (
              <li
                key={s.email}
                className="flex items-center justify-between px-4 py-3"
              >
                <div className="min-w-0">
                  <p className="text-sm font-medium truncate">{s.email}</p>
                  <p className="text-xs text-muted-foreground">
                    {REASON_LABELS[s.reason]} ·{" "}
                    {new Date(s.added_at).toLocaleDateString()}
                  </p>
                </div>
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={() => remove(s.email)}
                  title="Remove from suppression"
                >
                  <Trash2 className="h-4 w-4 text-destructive" />
                </Button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
