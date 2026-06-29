import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { requireActiveProfileOrRedirect } from "@/lib/profiles/require-active";
import { OnboardingClient } from "./onboarding-client";

export const dynamic = "force-dynamic";

export default async function BlogEngineOnboardingPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  await requireActiveProfileOrRedirect(user.id, "/apps/blog-engine/onboarding");

  return <OnboardingClient />;
}
