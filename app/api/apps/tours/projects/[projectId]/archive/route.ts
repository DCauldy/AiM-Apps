import { requireToursAccess, toursAccessErrorResponse } from "@/lib/tours/access/access.server";

export const dynamic = "force-dynamic";

export async function PATCH(
  _request: Request,
  { params }: { params: Promise<{ projectId: string }> }
) {
  const { projectId } = await params;
  const access = await requireToursAccess({ projectId, requireOpenProject: true });
  if (!access.ok) {
    return toursAccessErrorResponse(access);
  }

  const { data, error } = await access.supabase
    .from("tours_projects")
    .update({
      status: "archived",
      archived_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    })
    .eq("id", projectId)
    .eq("user_id", access.user.id)
    .eq("status", "open")
    .select("id")
    .maybeSingle();

  if (error) {
    return Response.json({ error: "Could not archive the tour project." }, { status: 500 });
  }

  if (!data) {
    return Response.json(
      { error: "Tour project was not found or cannot be archived." },
      { status: 404 }
    );
  }

  return Response.json({ projectId: data.id, status: "archived" });
}
