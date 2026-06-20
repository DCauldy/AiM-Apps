import { requireToursAccess, toursAccessErrorResponse } from "@/lib/tours/access/access.server";
import { recordListingMediaAcknowledgement } from "@/lib/tours/listing-media/listing-media-authorization";

export const dynamic = "force-dynamic";

export async function POST(
  _request: Request,
  { params }: { params: Promise<{ projectId: string }> }
) {
  const { projectId } = await params;
  const access = await requireToursAccess({ projectId, requireOpenProject: true });
  if (!access.ok) {
    return toursAccessErrorResponse(access);
  }

  const result = await recordListingMediaAcknowledgement(projectId);

  if (!result.ok) {
    return Response.json({ error: result.error }, { status: result.status });
  }

  return Response.json({ acknowledgement: result.acknowledgement });
}
