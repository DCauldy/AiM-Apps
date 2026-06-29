import "server-only";

import { redirect } from "next/navigation";

import { createClient } from "@/lib/supabase/server";

type OnboardingRedirectOptions = {
  profileTable: string;
  completedColumn?: string;
  dashboardHref: string;
  loginHref?: string;
};

export async function redirectIfOnboardingComplete({
  profileTable,
  completedColumn = "onboarding_completed",
  dashboardHref,
  loginHref = "/login",
}: OnboardingRedirectOptions) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect(loginHref);
  }

  const { data: profile } = await supabase
    .from(profileTable)
    .select(completedColumn)
    .eq("user_id", user.id)
    .maybeSingle();

  const onboardingState = profile as Record<string, unknown> | null;

  if (onboardingState?.[completedColumn] === true) {
    redirect(dashboardHref);
  }
}
