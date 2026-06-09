import { redirect } from "next/navigation";
import { getCachedUser } from "@/lib/auth/get-cached-user";
import { getFeatureFlag } from "@/lib/admin-config.server";
import { HyperlocalLayoutClient } from "./layout-client";

export default async function HyperlocalLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const user = await getCachedUser();

  if (!user) {
    redirect((process.env.NEXT_PUBLIC_AIM_BASE_URL ?? "https://aimarketingacademy.com") + "/apps");
  }

  const isEnabled = await getFeatureFlag("HYPERLOCAL");
  if (!isEnabled) {
    redirect("/apps");
  }

  // Pro tier gate (same as Blog Engine)
  const subscriptionTier = user.app_metadata?.subscription_tier;
  if (subscriptionTier !== "pro") {
    redirect("/apps/prompt-studio?upgrade=hyperlocal");
  }

  return <HyperlocalLayoutClient>{children}</HyperlocalLayoutClient>;
}
