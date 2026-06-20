import "server-only";

import { createClient } from "@/lib/supabase/server";
import type { HeyGenAvatarProjectPosition } from "@/lib/tours/avatar-settings/avatar-project-settings";

export type TourRenderProjectSettings = {
  elevenLabsVoiceId: string | null;
  heyGenAvatarId: string | null;
  heyGenAvatarPlacement: HeyGenAvatarProjectPosition | null;
};

export async function getTourRenderProjectSettings(input: {
  projectId: string;
  userId: string;
}): Promise<TourRenderProjectSettings> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("tours_projects")
    .select("elevenlabs_voice_id, heygen_avatar_id, heygen_avatar_placement")
    .eq("id", input.projectId)
    .eq("user_id", input.userId)
    .maybeSingle<{
      elevenlabs_voice_id: string | null;
      heygen_avatar_id: string | null;
      heygen_avatar_placement: HeyGenAvatarProjectPosition | null;
    }>();

  return {
    elevenLabsVoiceId: data?.elevenlabs_voice_id ?? null,
    heyGenAvatarId: data?.heygen_avatar_id ?? null,
    heyGenAvatarPlacement: data?.heygen_avatar_placement ?? null,
  };
}
