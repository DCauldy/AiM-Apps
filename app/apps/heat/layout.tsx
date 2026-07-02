import { redirect } from "next/navigation";

import { getFeatureFlag } from "@/lib/admin-config.server";
import { getCachedUser } from "@/lib/auth/get-cached-user";

import { HeatLayoutClient } from "./layout-client";

export default async function HeatLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const user = await getCachedUser();

  if (!user) {
    redirect(
      (process.env.NEXT_PUBLIC_AIM_BASE_URL ?? "https://aimarketingacademy.com") +
        "/apps",
    );
  }

  const isEnabled = await getFeatureFlag("HEAT");
  if (!isEnabled) {
    redirect("/apps");
  }

  // Pro-tier gate (matches Blog Engine): non-Pro users get the upgrade nudge.
  const subscriptionTier = user.app_metadata?.subscription_tier;
  if (subscriptionTier !== "pro") {
    redirect("/apps/prompt-studio?upgrade=heat");
  }

  return <HeatLayoutClient>{children}</HeatLayoutClient>;
}
