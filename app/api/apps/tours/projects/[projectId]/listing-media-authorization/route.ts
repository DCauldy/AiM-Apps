import { recordListingMediaAcknowledgement } from "@/lib/tours/listing-media-authorization";

export const dynamic = "force-dynamic";

export async function POST(
  _request: Request,
  { params }: { params: Promise<{ projectId: string }> }
) {
  const { projectId } = await params;
  const result = await recordListingMediaAcknowledgement(projectId);

  if (!result.ok) {
    return Response.json({ error: result.error }, { status: result.status });
  }

  return Response.json({ acknowledgement: result.acknowledgement });
}
