import { CreateTourProjectForm } from "@/components/tours/CreateTourProjectForm";
import { TourProjectsList } from "@/components/tours/TourProjectsList";
import { PageFrame, PageHeader } from "@/components/app-shell/PagePrimitives";
import { createClient } from "@/lib/supabase/server";
import { getProfileApiKeyStatusMap } from "@/lib/user-api-keys/server";
import { getSlotState } from "@/lib/profiles/server";

export const dynamic = "force-dynamic";

export default async function ToursPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;

  // Keys are profile-scoped — read against the active profile so the
  // dashboard reflects "what THIS persona can do today."
  const slot = await getSlotState(user.id).catch(() => null);
  const apiKeyStatus = slot?.active_profile_id
    ? await getProfileApiKeyStatusMap(slot.active_profile_id, ["elevenlabs", "heygen"])
    : {};
  const canUseElevenLabs = apiKeyStatus.elevenlabs === true;
  const canUseHeyGen = apiKeyStatus.heygen === true;

  return (
    <PageFrame>
      <PageHeader
        title="Tours"
        description="Create one-property listing projects and keep active tour work organized."
        actions={
          <CreateTourProjectForm
            canUseElevenLabs={canUseElevenLabs}
            canUseHeyGen={canUseHeyGen}
          />
        }
      />
      <div>
        <TourProjectsList />
      </div>
    </PageFrame>
  );
}
