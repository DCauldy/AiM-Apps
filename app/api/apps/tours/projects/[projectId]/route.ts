import { z } from "zod";
import { requireToursAccess, toursAccessErrorResponse } from "@/lib/tours/access.server";
import { TOUR_PROJECT_TYPES, type TourProjectType } from "@/lib/tours/project-types";
import {
  getMissingProviderKeysForTourType,
  getTourTypeAvailabilityMessage,
} from "@/lib/tours/tour-type-availability";
import { getTourProjectWorkspaceViewModel } from "@/lib/tours/workspace";
import { getUserApiKeyStatusMap } from "@/lib/user-api-keys/server";

export const dynamic = "force-dynamic";

const OptionalElevenLabsVoiceIdSchema = z
  .preprocess((value) => (value === null ? "" : value), z.string().trim().max(120, "Voice ID is too long").optional())
  .transform((value) => (value ? value : null));

const UpdateTourProjectSchema = z.object({
  name: z.string().trim().min(1, "Project name is required").max(120, "Project name is too long"),
  propertyAddress: z.string().trim().min(1, "Property address is required").max(240, "Property address is too long"),
  listingUrl: z
    .string()
    .trim()
    .max(500, "Listing URL is too long")
    .optional()
    .transform((value) => (value ? value : null))
    .pipe(z.string().url("Listing URL must be a valid URL").nullable()),
  tourType: z.enum(TOUR_PROJECT_TYPES).optional(),
  elevenLabsVoiceId: OptionalElevenLabsVoiceIdSchema,
});

async function getTourTypeAvailabilityError(
  userId: string,
  tourType: TourProjectType
): Promise<string | null> {
  if (tourType === "tour_video") return null;

  const apiKeyStatus = await getUserApiKeyStatusMap(userId, ["elevenlabs", "heygen"]);

  if (getMissingProviderKeysForTourType(tourType, apiKeyStatus).length > 0) {
    return getTourTypeAvailabilityMessage(tourType, "choosing");
  }

  return null;
}

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ projectId: string }> }
) {
  const { projectId } = await params;
  const workspace = await getTourProjectWorkspaceViewModel(projectId);

  if (!workspace) {
    return Response.json(
      { error: "Tour project was not found or cannot be loaded." },
      { status: 404 }
    );
  }

  return Response.json({ workspace });
}

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ projectId: string }> }
) {
  const { projectId } = await params;
  const access = await requireToursAccess({ projectId, requireOpenProject: true });
  if (!access.ok) {
    return toursAccessErrorResponse(access);
  }

  const body = await request.json().catch(() => null);
  const parsed = UpdateTourProjectSchema.safeParse(body);
  if (!parsed.success) {
    return Response.json(
      { error: parsed.error.issues[0]?.message ?? "Enter valid tour project details." },
      { status: 400 }
    );
  }

  if (parsed.data.tourType) {
    const tourTypeAvailabilityError = await getTourTypeAvailabilityError(
      access.user.id,
      parsed.data.tourType
    );
    if (tourTypeAvailabilityError) {
      return Response.json({ error: tourTypeAvailabilityError }, { status: 422 });
    }
  }

  const { data, error } = await access.supabase
    .from("tours_projects")
    .update({
      name: parsed.data.name,
      property_address: parsed.data.propertyAddress,
      listing_url: parsed.data.listingUrl,
      ...(parsed.data.tourType ? { tour_type: parsed.data.tourType } : {}),
      ...(body && typeof body === "object" && "elevenLabsVoiceId" in body
        ? { elevenlabs_voice_id: parsed.data.elevenLabsVoiceId }
        : {}),
      updated_at: new Date().toISOString(),
    })
    .eq("id", projectId)
    .eq("user_id", access.user.id)
    .eq("status", "open")
    .select("id, name, property_address, listing_url, tour_type, elevenlabs_voice_id, status, updated_at")
    .maybeSingle();

  if (error) {
    return Response.json({ error: "Could not update the tour project." }, { status: 500 });
  }

  if (!data) {
    return Response.json(
      { error: "Tour project was not found or cannot be updated." },
      { status: 404 }
    );
  }

  return Response.json({ project: data });
}
