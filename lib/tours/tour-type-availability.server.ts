import "server-only";

import { getSlotState } from "@/lib/profiles/server";
import { getProfileApiKeyStatusMap } from "@/lib/user-api-keys/server";
import type { TourProjectType } from "./project-types";
import {
  getMissingProviderKeysForTourType,
  getTourTypeAvailabilityMessage,
} from "./tour-type-availability";

export async function getTourTypeAvailabilityErrorForUser(input: {
  userId: string;
  tourType: TourProjectType;
  action: "creating" | "choosing";
}): Promise<string | null> {
  if (input.tourType === "tour_video") return null;

  const slot = await getSlotState(input.userId).catch(() => null);
  const apiKeyStatus = slot?.active_profile_id
    ? await getProfileApiKeyStatusMap(slot.active_profile_id, ["elevenlabs", "heygen"])
    : {};

  if (getMissingProviderKeysForTourType(input.tourType, apiKeyStatus).length > 0) {
    return getTourTypeAvailabilityMessage(input.tourType, input.action);
  }

  return null;
}
