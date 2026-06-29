import { redirect } from "next/navigation";
import { getCachedUser } from "@/lib/auth/get-cached-user";
import { getFeatureFlag } from "@/lib/admin-config.server";
import { RadarLayoutClient } from "./layout-client";

export default async function RadarLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const user = await getCachedUser();

  if (!user) {
    redirect((process.env.NEXT_PUBLIC_AIM_BASE_URL ?? "https://aimarketingacademy.com") + "/apps");
  }

  const isEnabled = await getFeatureFlag("RADAR");
  if (!isEnabled) {
    redirect("/apps");
  }

  // Check if user has Pro tier access
  const subscriptionTier = user.app_metadata?.subscription_tier;
  if (subscriptionTier !== "pro") {
    redirect("/apps/prompt-studio?upgrade=radar");
  }

  return <RadarLayoutClient>{children}</RadarLayoutClient>;
}
