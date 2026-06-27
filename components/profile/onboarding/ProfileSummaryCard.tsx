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
  // Optional fields populated by AI Magic mode (website analysis). Control
  // Freak mode leaves these undefined, so the card just hides them.
  title?: string | null;
  phone?: string | null;
  website_url?: string | null;
  primary_color?: string | null;
  secondary_color?: string | null;
  accent_color?: string | null;
  logo_url?: string | null;
  headshot_url?: string | null;
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
      // Only send keys that are actually set — undefined optional fields
      // (Control Freak mode) simply fall through to the schema defaults.
      const optional = Object.fromEntries(
        (
          [
            "title",
            "phone",
            "website_url",
            "primary_color",
            "secondary_color",
            "accent_color",
            "logo_url",
            "headshot_url",
          ] as const
        )
          .filter((k) => draft[k] != null)
          .map((k) => [k, draft[k]]),
      );
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
          ...optional,
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
  const brandColors = [
    draft.primary_color,
    draft.secondary_color,
    draft.accent_color,
  ].filter((c): c is string => !!c);
  const hasBrand = !!draft.logo_url || !!draft.headshot_url || brandColors.length > 0;

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
        {draft.phone ? <Row label="Phone" value={draft.phone} /> : null}
        <Row label="Bio" value={draft.bio ?? "—"} multiline />
      </dl>

      {hasBrand ? (
        <div className="pt-1 border-t border-white/10 space-y-3">
          <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
            Brand
          </p>
          <div className="flex items-center gap-4 flex-wrap">
            {draft.logo_url ? (
              <BrandImage src={draft.logo_url} label="Logo" rounded="rounded-md" />
            ) : null}
            {draft.headshot_url ? (
              <BrandImage src={draft.headshot_url} label="Headshot" rounded="rounded-full" />
            ) : null}
            {brandColors.length > 0 ? (
              <div className="flex items-center gap-1.5">
                {brandColors.map((c) => (
                  <span
                    key={c}
                    title={c}
                    className="w-6 h-6 rounded-md border border-white/20 shadow-sm"
                    style={{ background: c }}
                  />
                ))}
              </div>
            ) : null}
          </div>
        </div>
      ) : null}

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

/** Small framed preview of a brand image (logo / headshot) pulled from the
 *  user's site. Uses a plain <img> since these are arbitrary external URLs. */
function BrandImage({
  src,
  label,
  rounded,
}: {
  src: string;
  label: string;
  rounded: string;
}) {
  return (
    <div className="flex flex-col items-center gap-1">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={src}
        alt={label}
        className={`h-12 w-12 object-contain bg-white/90 border border-white/20 ${rounded}`}
      />
      <span className="text-[10px] uppercase tracking-wider text-muted-foreground">
        {label}
      </span>
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
