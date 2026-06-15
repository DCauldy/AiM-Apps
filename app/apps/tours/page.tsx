import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { WelcomeScreen } from "@/components/tours/WelcomeScreen";
import { requireActiveProfileOrRedirect } from "@/lib/profiles/require-active";

export default async function ToursPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  await requireActiveProfileOrRedirect(user.id, "/apps/tours");
  return <WelcomeScreen />;
}
