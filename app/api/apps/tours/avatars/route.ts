import { requireToursAccess, toursAccessErrorResponse } from "@/lib/tours/access.server";
import {
  HeyGenAvatarsError,
  listHeyGenDigitalTwinAvatarLooks,
} from "@/lib/tours/rendering/heygen-avatars";
import { getSlotState } from "@/lib/profiles/server";
import { getProfileApiKey } from "@/lib/user-api-keys/service";

export const dynamic = "force-dynamic";

export async function GET() {
  const access = await requireToursAccess();
  if (!access.ok) {
    return toursAccessErrorResponse(access);
  }

  const slot = await getSlotState(access.user.id).catch(() => null);
  if (!slot?.active_profile_id) {
    return Response.json({ error: "Set up a profile before choosing an avatar." }, { status: 422 });
  }

  const apiKey = await getProfileApiKey(slot.active_profile_id, "heygen");
  if (!apiKey) {
    return Response.json({ error: "Add a HeyGen API key before choosing an avatar." }, { status: 422 });
  }

  try {
    const avatars = await listHeyGenDigitalTwinAvatarLooks({ apiKey });
    return Response.json({ avatars });
  } catch (error) {
    if (error instanceof HeyGenAvatarsError) {
      return Response.json({ error: error.message }, { status: 502 });
    }
    return Response.json({ error: "Could not load HeyGen avatars." }, { status: 500 });
  }
}
