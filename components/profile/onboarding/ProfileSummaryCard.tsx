"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { CheckCircle2, Loader2, Pencil } from "lucide-react";

import { Button } from "@/components/ui/button";
import { useToast } from "@/components/ui/toast";

export interface ProfileDraft {
  full_name: string;
  professional_type: string;
  brokerage: string;
  state: string;
  metro_area: string;
  bio: string | null;
}

const ROLE_LABELS: Record<string, string> = {
  solo_agent: "Solo Agent",
  team_leader: "Team Leader",
  team_agent: "Team Agent",
  broker_owner: "Broker / Owner",
  loan_officer: "Loan Officer",
  title_executive: "Title Executive",
};

interface ProfileSummaryCardProps {
  draft: ProfileDraft;
  /** Tells the parent chat to keep going (user wants to tweak something). */
  onEdit: () => void;
}

/**
 * Final confirmation card rendered inline in the chat once the assistant
 * has captured all six fields. "Create my profile" posts to /api/profiles
 * (which auto-marks the first profile as default + active), dismisses the
 * welcome modal, and routes the user back to /apps.
 */
export function ProfileSummaryCard({ draft, onEdit }: ProfileSummaryCardProps) {
  const router = useRouter();
  const { addToast } = useToast();
  const [creating, setCreating] = useState(false);
  const [createdAt, setCreatedAt] = useState<number | null>(null);

  const handleCreate = async () => {
    setCreating(true);
    try {
      // display_name is required by the schema. A "FullName — Brokerage"
      // format mirrors the schema example ("Smith Team — RE/MAX") and
      // reads cleanly in the active-profile chip. Users can rename in
      // the full editor later.
      const display_name = `${draft.full_name} — ${draft.brokerage}`;
      const res = await fetch("/api/profiles", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          display_name,
          full_name: draft.full_name,
          professional_type: draft.professional_type,
          brokerage: draft.brokerage,
          state: draft.state,
          metro_area: draft.metro_area,
          bio: draft.bio,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || "Failed to create profile");
      }
      // Belt + suspenders: the welcome modal won't fire anyway once
      // active_profile_id is set, but stamping the dismiss timestamp
      // keeps the trigger consistent across all paths.
      await fetch("/api/welcome/dismiss", { method: "POST" });
      setCreatedAt(Date.now());
      router.push("/apps");
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "Something went wrong";
      addToast({
        title: "Couldn't create profile",
        description: message,
        variant: "destructive",
      });
      setCreating(false);
    }
  };

  const role = ROLE_LABELS[draft.professional_type] ?? draft.professional_type;

  return (
    <div className="glass-card rounded-xl p-5 space-y-4 max-w-md">
      <div className="flex items-center gap-2">
        <CheckCircle2 className="h-4 w-4 text-[#31DBA5]" />
        <p className="text-xs font-semibold uppercase tracking-wider text-[#31DBA5]">
          Here's what I captured
        </p>
      </div>

      <dl className="space-y-2.5">
        <Row label="Name" value={draft.full_name} />
        <Row label="Role" value={role} />
        <Row label="Brokerage" value={draft.brokerage} />
        <Row label="State" value={draft.state} />
        <Row label="Metro" value={draft.metro_area} />
        <Row label="Bio" value={draft.bio ?? "—"} multiline />
      </dl>

      <div className="flex gap-2 pt-1">
        <Button
          onClick={handleCreate}
          disabled={creating || createdAt !== null}
          className="flex-1 text-white border-0 h-10 rounded-lg font-semibold hover:opacity-95 transition-opacity"
          style={{
            background: "linear-gradient(135deg, #1C4C8A 0%, #31DBA5 100%)",
          }}
        >
          {creating ? (
            <>
              <Loader2 className="h-4 w-4 animate-spin mr-2" />
              Creating…
            </>
          ) : createdAt ? (
            "Profile created"
          ) : (
            "Create my profile"
          )}
        </Button>
        <Button
          variant="outline"
          size="icon"
          onClick={onEdit}
          disabled={creating}
          className="h-10 w-10 rounded-lg border-white/15 hover:bg-white/5"
          aria-label="Change something"
        >
          <Pencil className="h-4 w-4" />
        </Button>
      </div>
    </div>
  );
}

function Row({
  label,
  value,
  multiline,
}: {
  label: string;
  value: string;
  multiline?: boolean;
}) {
  return (
    <div className="flex gap-3">
      <dt className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground w-20 shrink-0 pt-0.5">
        {label}
      </dt>
      <dd
        className={`text-sm text-foreground flex-1 min-w-0 ${
          multiline ? "" : "truncate"
        }`}
      >
        {value}
      </dd>
    </div>
  );
}
