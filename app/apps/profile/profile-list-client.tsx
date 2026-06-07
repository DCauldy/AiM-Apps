"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Plus, Star, Archive, ArchiveRestore, Trash2, Check, Lock } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import { useToast } from "@/components/ui/toast";
import type { PlatformProfile } from "@/types/platform-profile";

interface Props {
  initialProfiles: PlatformProfile[];
  slotCount: number;
  activeProfileId: string | null;
  slotGraceUntil: string | null;
}

export function ProfileListClient({
  initialProfiles,
  slotCount,
  activeProfileId,
  slotGraceUntil,
}: Props) {
  const router = useRouter();
  const { addToast } = useToast();
  const [profiles, setProfiles] = useState(initialProfiles);
  const [busy, setBusy] = useState<string | null>(null);
  const [archiveTarget, setArchiveTarget] = useState<PlatformProfile | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<PlatformProfile | null>(null);

  const active = profiles.filter((p) => !p.archived_at);
  const archived = profiles.filter((p) => p.archived_at);
  const atSlotLimit = active.length >= slotCount;
  const inGrace = slotGraceUntil ? new Date(slotGraceUntil) > new Date() : false;
  const overSlot = active.length > slotCount;

  async function activate(id: string) {
    setBusy(id);
    try {
      const res = await fetch(`/api/profiles/${id}/activate`, { method: "POST" });
      if (!res.ok) throw new Error((await res.json()).error ?? "Failed to switch");
      addToast({ title: "Active profile switched", description: "All apps now operate under this profile." });
      router.refresh();
    } catch (err) {
      addToast({
        title: "Could not switch",
        description: err instanceof Error ? err.message : "Unknown error",
        variant: "destructive",
      });
    } finally {
      setBusy(null);
    }
  }

  async function setDefault(id: string) {
    setBusy(id);
    try {
      const res = await fetch(`/api/profiles/${id}/default`, { method: "POST" });
      if (!res.ok) throw new Error((await res.json()).error ?? "Failed");
      setProfiles((prev) => prev.map((p) => ({ ...p, is_default: p.id === id })));
      addToast({ title: "Default updated" });
    } catch (err) {
      addToast({
        title: "Could not set default",
        description: err instanceof Error ? err.message : "Unknown error",
        variant: "destructive",
      });
    } finally {
      setBusy(null);
    }
  }

  async function archive(id: string) {
    setBusy(id);
    try {
      const res = await fetch(`/api/profiles/${id}/archive`, { method: "POST" });
      if (!res.ok) throw new Error((await res.json()).error ?? "Failed");
      addToast({ title: "Profile archived" });
      router.refresh();
    } catch (err) {
      addToast({
        title: "Could not archive",
        description: err instanceof Error ? err.message : "Unknown error",
        variant: "destructive",
      });
    } finally {
      setBusy(null);
    }
  }

  async function restore(id: string) {
    setBusy(id);
    try {
      const res = await fetch(`/api/profiles/${id}/restore`, { method: "POST" });
      if (!res.ok) throw new Error((await res.json()).error ?? "Failed");
      addToast({ title: "Profile restored" });
      router.refresh();
    } catch (err) {
      addToast({
        title: "Could not restore",
        description: err instanceof Error ? err.message : "Unknown error",
        variant: "destructive",
      });
    } finally {
      setBusy(null);
    }
  }

  async function hardDelete(id: string) {
    setBusy(id);
    try {
      const res = await fetch(`/api/profiles/${id}?confirm=true`, { method: "DELETE" });
      if (!res.ok) throw new Error((await res.json()).error ?? "Failed");
      addToast({ title: "Profile deleted" });
      router.refresh();
    } catch (err) {
      addToast({
        title: "Could not delete",
        description: err instanceof Error ? err.message : "Unknown error",
        variant: "destructive",
      });
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="max-w-4xl mx-auto p-6 space-y-6">
      <header className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold">Profiles</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Each profile is a complete company identity — name, brokerage, market, brand. Apps
            conform to your active profile.
          </p>
        </div>
        <Link href="/apps/profile/new">
          <Button disabled={atSlotLimit} className="gap-2">
            {atSlotLimit ? <Lock className="h-4 w-4" /> : <Plus className="h-4 w-4" />}
            New Profile
          </Button>
        </Link>
      </header>

      {overSlot && inGrace && slotGraceUntil && (
        <div className="rounded-lg border border-amber-500/40 bg-amber-500/10 p-4 text-sm">
          <strong>Action needed:</strong> You have {active.length} active profiles but only{" "}
          {slotCount} slots. Archive {active.length - slotCount} profile
          {active.length - slotCount === 1 ? "" : "s"} before{" "}
          {new Date(slotGraceUntil).toLocaleDateString()} or upgrade your subscription to continue
          using the apps.
        </div>
      )}

      {overSlot && !inGrace && (
        <div className="rounded-lg border border-destructive/40 bg-destructive/10 p-4 text-sm">
          <strong>Apps are locked.</strong> You exceed your slot count. Archive a profile or
          upgrade to unblock.
        </div>
      )}

      <div className="text-xs text-muted-foreground">
        {active.length} of {slotCount} slot{slotCount === 1 ? "" : "s"} used
      </div>

      {active.length === 0 && (
        <div className="text-center py-12 border border-dashed rounded-lg">
          <p className="text-sm text-muted-foreground mb-4">You haven&apos;t created any profiles yet.</p>
          <Link href="/apps/profile/new">
            <Button>Create your first profile</Button>
          </Link>
        </div>
      )}

      <div className="space-y-3">
        {active.map((p) => (
          <ProfileCard
            key={p.id}
            profile={p}
            isActive={p.id === activeProfileId}
            busy={busy === p.id}
            onActivate={() => activate(p.id)}
            onSetDefault={() => setDefault(p.id)}
            onArchive={() => setArchiveTarget(p)}
            onHardDelete={() => setDeleteTarget(p)}
          />
        ))}
      </div>

      {archived.length > 0 && (
        <section className="space-y-3 pt-6 border-t">
          <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">
            Archived
          </h2>
          {archived.map((p) => (
            <ProfileCard
              key={p.id}
              profile={p}
              isActive={false}
              busy={busy === p.id}
              archived
              canRestore={!atSlotLimit}
              onRestore={() => restore(p.id)}
              onHardDelete={() => setDeleteTarget(p)}
            />
          ))}
        </section>
      )}

      <ConfirmDialog
        open={Boolean(archiveTarget)}
        onOpenChange={(o) => !o && setArchiveTarget(null)}
        title={archiveTarget ? `Archive “${archiveTarget.display_name}”?` : "Archive profile?"}
        description={
          <>
            Apps cannot run under this profile until you restore it. All data
            stays preserved — you can restore the profile any time as long as
            you have a free slot.
          </>
        }
        confirmLabel="Archive"
        variant="destructive"
        busy={busy === archiveTarget?.id}
        onConfirm={async () => {
          if (archiveTarget) await archive(archiveTarget.id);
        }}
      />

      <ConfirmDialog
        open={Boolean(deleteTarget)}
        onOpenChange={(o) => !o && setDeleteTarget(null)}
        title={deleteTarget ? `Delete “${deleteTarget.display_name}”?` : "Delete profile?"}
        description={
          <>
            This permanently deletes the profile and <strong>cascades to all
            app data</strong> tied to it (blogs, topics, campaigns, runs,
            prompts, threads). This cannot be undone.
          </>
        }
        confirmLabel="Delete forever"
        variant="destructive"
        busy={busy === deleteTarget?.id}
        onConfirm={async () => {
          if (deleteTarget) await hardDelete(deleteTarget.id);
        }}
      />
    </div>
  );
}

interface CardProps {
  profile: PlatformProfile;
  isActive: boolean;
  busy: boolean;
  archived?: boolean;
  canRestore?: boolean;
  onActivate?: () => void;
  onSetDefault?: () => void;
  onArchive?: () => void;
  onRestore?: () => void;
  onHardDelete: () => void;
}

function ProfileCard({
  profile,
  isActive,
  busy,
  archived,
  canRestore,
  onActivate,
  onSetDefault,
  onArchive,
  onRestore,
  onHardDelete,
}: CardProps) {
  return (
    <div
      className={`rounded-lg border p-4 transition-colors ${
        isActive ? "border-foreground/40 bg-accent/50" : "border-border"
      } ${archived ? "opacity-60" : ""}`}
    >
      <div className="flex items-start gap-4">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <h3 className="font-semibold truncate">{profile.display_name}</h3>
            {isActive && (
              <span className="inline-flex items-center gap-1 text-xs font-medium text-foreground bg-foreground/10 px-2 py-0.5 rounded-full">
                <Check className="h-3 w-3" /> Active
              </span>
            )}
            {profile.is_default && (
              <span className="inline-flex items-center gap-1 text-xs font-medium text-amber-500 bg-amber-500/10 px-2 py-0.5 rounded-full">
                <Star className="h-3 w-3" /> Default
              </span>
            )}
          </div>
          <p className="text-sm text-muted-foreground truncate">
            {profile.brokerage || "—"} · {profile.metro_area || "Market not set"}
          </p>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          {!archived && !isActive && (
            <Button size="sm" variant="outline" onClick={onActivate} disabled={busy}>
              Switch to this
            </Button>
          )}
          {!archived && !profile.is_default && (
            <Button size="sm" variant="ghost" onClick={onSetDefault} disabled={busy} title="Set as default">
              <Star className="h-4 w-4" />
            </Button>
          )}
          <Link href={`/apps/profile/${profile.id}`}>
            <Button size="sm" variant="ghost">Edit</Button>
          </Link>
          {!archived ? (
            <Button size="sm" variant="ghost" onClick={onArchive} disabled={busy} title="Archive">
              <Archive className="h-4 w-4" />
            </Button>
          ) : (
            <Button
              size="sm"
              variant="ghost"
              onClick={onRestore}
              disabled={busy || !canRestore}
              title={canRestore ? "Restore" : "No slot available — upgrade to restore"}
            >
              <ArchiveRestore className="h-4 w-4" />
            </Button>
          )}
          <Button
            size="sm"
            variant="ghost"
            onClick={onHardDelete}
            disabled={busy}
            title="Delete permanently"
            className="text-destructive hover:bg-destructive/10"
          >
            <Trash2 className="h-4 w-4" />
          </Button>
        </div>
      </div>
    </div>
  );
}
