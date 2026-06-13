import { requireToursAccess, toursAccessErrorResponse } from "@/lib/tours/access.server";
import { preflightFakeTourRenderRun } from "@/lib/tours/rendering/tour-render-runs";

export const dynamic = "force-dynamic";

export async function POST(
  _request: Request,
  { params }: { params: Promise<{ projectId: string }> }
) {
  const { projectId } = await params;
  const access = await requireToursAccess({ projectId });
  if (!access.ok) {
    return toursAccessErrorResponse(access);
  }

  const preflight = await preflightFakeTourRenderRun({
    projectId,
    userId: access.user.id,
  });

  return Response.json({ preflight }, { status: preflight.ok ? 200 : 422 });
}
