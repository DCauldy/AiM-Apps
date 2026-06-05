import { createClient } from "@/lib/supabase/server";
import { NextRequest } from "next/server";

export const dynamic = "force-dynamic";

/**
 * GET /api/apps/hyperlocal/runs/:id
 * Returns the run with embedded segments + email counts. Used for polling.
 */
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return Response.json({ error: "Unauthorized" }, { status: 401 });

  const [{ data: run, error: runErr }, { data: segments }, { data: emails }] =
    await Promise.all([
      supabase
        .from("hl_runs")
        .select("*")
        .eq("id", id)
        .eq("user_id", user.id)
        .maybeSingle(),
      // Skipped segments stay in the DB for audit but don't surface in the
      // UI — the user already chose to opt out of them via the service-area
      // picker (or they were sub-threshold and demoted).
      supabase
        .from("hl_segments")
        .select(
          "id, geo_key, geo_label, geo_type, contact_count, seller_contact_count, buyer_contact_count, mls_upload_id, mls_metrics, status, rolled_up_into, below_min_size, created_at"
        )
        .eq("run_id", id)
        .neq("status", "skipped")
        .order("contact_count", { ascending: false }),
      supabase
        .from("hl_emails")
        .select("id, segment_id, subject, preheader, status, approved_at, sent_at, created_at")
        .eq("run_id", id),
    ]);

  if (runErr) return Response.json({ error: runErr.message }, { status: 500 });
  if (!run) return Response.json({ error: "Not found" }, { status: 404 });

  return Response.json({
    run,
    segments: segments ?? [],
    emails: emails ?? [],
  });
}
