import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { canCreateProfile } from "@/lib/profiles/server";
import { ProfileEditor } from "@/components/profile/ProfileEditor";

export const dynamic = "force-dynamic";

export default async function NewProfilePage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;

  const capacity = await canCreateProfile(user.id);
  if (!capacity.allowed) {
    redirect("/apps/profile?slot_overrun=1");
  }

  return <ProfileEditor />;
}
