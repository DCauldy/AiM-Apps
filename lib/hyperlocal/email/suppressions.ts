import { createServiceRoleClient } from "@/lib/supabase/server";
import type { SuppressionReason } from "@/types/hyperlocal";

export async function isSuppressed(
  userId: string,
  email: string
): Promise<boolean> {
  const supabase = createServiceRoleClient();
  const { data } = await supabase
    .from("hl_suppressions")
    .select("email")
    .eq("user_id", userId)
    .eq("email", email.toLowerCase())
    .maybeSingle();
  return data != null;
}

export async function addSuppression(opts: {
  userId: string;
  email: string;
  reason: SuppressionReason;
  sourceRunId?: string;
}): Promise<void> {
  const supabase = createServiceRoleClient();
  await supabase.from("hl_suppressions").upsert(
    {
      user_id: opts.userId,
      email: opts.email.toLowerCase(),
      reason: opts.reason,
      source_run_id: opts.sourceRunId ?? null,
    },
    { onConflict: "user_id,email" }
  );
}

export async function removeSuppression(
  userId: string,
  email: string
): Promise<void> {
  const supabase = createServiceRoleClient();
  await supabase
    .from("hl_suppressions")
    .delete()
    .eq("user_id", userId)
    .eq("email", email.toLowerCase());
}
