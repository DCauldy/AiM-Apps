import "server-only";

import { createClient } from "@/lib/supabase/server";

export type TourRenderProjectSettings = {
  elevenLabsVoiceId: string | null;
};

export async function getTourRenderProjectSettings(input: {
  projectId: string;
  userId: string;
}): Promise<TourRenderProjectSettings> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("tours_projects")
    .select("elevenlabs_voice_id")
    .eq("id", input.projectId)
    .eq("user_id", input.userId)
    .maybeSingle<{ elevenlabs_voice_id: string | null }>();

  return {
    elevenLabsVoiceId: data?.elevenlabs_voice_id ?? null,
  };
}
