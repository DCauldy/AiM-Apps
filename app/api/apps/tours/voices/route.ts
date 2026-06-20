import { requireToursAccess, toursAccessErrorResponse } from "@/lib/tours/access.server";
import {
  ElevenLabsVoicesError,
  listElevenLabsDigitalTwinVoices,
} from "@/lib/tours/rendering/voiceover/elevenlabs-voices";
import { getProfileApiKey } from "@/lib/user-api-keys/service";
import { getSlotState } from "@/lib/profiles/server";

export const dynamic = "force-dynamic";

export async function GET() {
  const access = await requireToursAccess();
  if (!access.ok) {
    return toursAccessErrorResponse(access);
  }

  // Voice picker runs before a project exists, so the ElevenLabs key
  // is read from the user's currently active profile.
  const slot = await getSlotState(access.user.id).catch(() => null);
  if (!slot?.active_profile_id) {
    return Response.json(
      { error: "Set up a platform profile before choosing a voice." },
      { status: 422 },
    );
  }
  const apiKey = await getProfileApiKey(slot.active_profile_id, "elevenlabs");
  if (!apiKey) {
    return Response.json({ error: "Add an ElevenLabs API key before choosing a voice." }, { status: 422 });
  }

  try {
    const voices = await listElevenLabsDigitalTwinVoices({ apiKey });
    return Response.json({ voices });
  } catch (error) {
    if (error instanceof ElevenLabsVoicesError) {
      return Response.json({ error: error.message }, { status: 502 });
    }
    return Response.json({ error: "Could not load ElevenLabs voices." }, { status: 500 });
  }
}
