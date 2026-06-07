import { createClient } from "@/lib/supabase/server";
import { listUserProfiles, getSlotState } from "@/lib/profiles/server";
import { ProfileListClient } from "./profile-list-client";

export const dynamic = "force-dynamic";

export default async function ProfilesPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;

  const [profiles, slot] = await Promise.all([listUserProfiles(user.id), getSlotState(user.id)]);

  return (
    <ProfileListClient
      initialProfiles={profiles}
      slotCount={slot.profile_slot_count}
      activeProfileId={slot.active_profile_id}
      slotGraceUntil={slot.slot_grace_period_ends_at}
    />
  );
}
