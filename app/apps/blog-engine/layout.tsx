import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getFeatureFlag } from "@/lib/admin-config.server";
import { BlogEngineLayoutClient } from "./layout-client";

export default async function BlogEngineLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect((process.env.NEXT_PUBLIC_AIM_BASE_URL ?? "https://aimarketingacademy.com") + "/apps");
  }

  const isEnabled = await getFeatureFlag("BLOG_ENGINE");
  if (!isEnabled) {
    redirect("/apps");
  }

  // Check if user has Pro tier access
  const subscriptionTier = user.app_metadata?.subscription_tier;
  if (subscriptionTier !== "pro") {
    // Non-Pro users get redirected to Prompt Studio with a query param to trigger upgrade modal
    redirect("/apps/prompt-studio?upgrade=blog-engine");
  }

  return <BlogEngineLayoutClient>{children}</BlogEngineLayoutClient>;
}
