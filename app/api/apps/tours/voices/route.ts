import { requireToursAccess, toursAccessErrorResponse } from "@/lib/tours/access.server";
import {
  ElevenLabsVoicesError,
  listElevenLabsDigitalTwinVoices,
} from "@/lib/tours/rendering/elevenlabs-voices";
import { getUserApiKey } from "@/lib/user-api-keys/service";

export const dynamic = "force-dynamic";

export async function GET() {
  const access = await requireToursAccess();
  if (!access.ok) {
    return toursAccessErrorResponse(access);
  }

  const apiKey = await getUserApiKey(access.user.id, "elevenlabs");
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
