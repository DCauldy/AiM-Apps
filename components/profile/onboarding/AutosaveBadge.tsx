import { Check, Loader2 } from "lucide-react";

import type { AutosaveStatus } from "@/lib/profiles/onboarding-draft";

/** Live "Saving… / Auto-saved" pill — same teal look as the mode-picker draft
 *  badge. Hidden until the first save fires. */
export function AutosaveBadge({ status }: { status: AutosaveStatus }) {
  if (status === "idle") return null;
  return (
    <span className="inline-flex items-center gap-1.5 rounded-full bg-[#31DBA5]/15 border border-[#31DBA5]/30 px-2.5 py-0.5 text-[11px] font-medium text-[#31DBA5]">
      {status === "saving" ? (
        <>
          <Loader2 className="h-3 w-3 animate-spin" />
          Saving…
        </>
      ) : (
        <>
          <Check className="h-3 w-3" />
          Auto-saved
        </>
      )}
    </span>
  );
}
