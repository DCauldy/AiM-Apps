import { CreateTourProjectForm } from "@/components/tours/CreateTourProjectForm";
import { TourProjectsList } from "@/components/tours/TourProjectsList";
import { PageFrame, PageHeader } from "@/components/app-shell/PagePrimitives";
import { createClient } from "@/lib/supabase/server";
import { getUserApiKeyStatusMap } from "@/lib/user-api-keys/server";

export const dynamic = "force-dynamic";

export default async function ToursDashboardPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;

  const apiKeyStatus = await getUserApiKeyStatusMap(user.id, ["elevenlabs", "heygen"]);
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
