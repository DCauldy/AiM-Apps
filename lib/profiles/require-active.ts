import { redirect } from "next/navigation";
import { createServiceRoleClient } from "@/lib/supabase/server";

/**
 * Server-side guard for app onboarding pages.
 *
 * The unified Profile system holds company identity (name, brokerage,
 * market, brand colors, etc.). App-specific onboarding flows are
 * meant to capture only the app-mechanical config (schedule, CMS,
 * CRM, etc.) on top of that profile. If the user has no active
 * profile yet, send them to set one up first — with a return_to so
 * they land back on the app onboarding page after.
 */
export async function requireActiveProfileOrRedirect(
  userId: string,
  returnTo: string
): Promise<void> {
  const service = createServiceRoleClient();
  const { data } = await service
    .from("profiles")
    .select("active_profile_id")
    .eq("id", userId)
    .maybeSingle();
  if (data?.active_profile_id) return;

  const url = `/apps/profile/new?return_to=${encodeURIComponent(returnTo)}`;
  redirect(url);
}
