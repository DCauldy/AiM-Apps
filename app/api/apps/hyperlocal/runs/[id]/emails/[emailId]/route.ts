import { createClient, createServiceRoleClient } from "@/lib/supabase/server";
import { rerenderEmail, snapshotBlocks } from "@/lib/hyperlocal/email/rerender";
import { NextRequest } from "next/server";

export const dynamic = "force-dynamic";

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string; emailId: string }> }
) {
  const { id, emailId } = await params;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return Response.json({ error: "Unauthorized" }, { status: 401 });

  const { data: run } = await supabase
    .from("hl_runs")
    .select("id")
    .eq("id", id)
    .eq("user_id", user.id)
    .maybeSingle();
  if (!run) return Response.json({ error: "Not found" }, { status: 404 });

  const { data, error } = await supabase
    .from("hl_emails")
    .select(
      "*, segment:hl_segments(geo_key, geo_label, contact_count, below_min_size, mls_metrics)"
    )
    .eq("id", emailId)
    .eq("run_id", id)
    .maybeSingle();

  if (error) return Response.json({ error: error.message }, { status: 500 });
  if (!data) return Response.json({ error: "Not found" }, { status: 404 });

  return Response.json({ email: data });
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string; emailId: string }> }
) {
  const { id, emailId } = await params;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return Response.json({ error: "Unauthorized" }, { status: 401 });

  const service = createServiceRoleClient();
  const { data: run } = await service
    .from("hl_runs")
    .select("id, phase")
    .eq("id", id)
    .eq("user_id", user.id)
    .maybeSingle();
  if (!run) return Response.json({ error: "Not found" }, { status: 404 });
  if (run.phase !== "review") {
    return Response.json(
      { error: `Cannot edit in ${run.phase} phase` },
      { status: 400 }
    );
  }

  // Load current state so we can snapshot for undo BEFORE applying changes
  const { data: current } = await service
    .from("hl_emails")
    .select(
      "subject, preheader, seller_perspective_html, buyer_perspective_html"
    )
    .eq("id", emailId)
    .eq("run_id", id)
    .single();
  if (!current) return Response.json({ error: "Email not found" }, { status: 404 });

  const body = await req.json();
  const update: Record<string, unknown> = {
    updated_at: new Date().toISOString(),
  };

  let blocksChanged = false;
  if (typeof body.subject === "string") {
    update.subject = body.subject;
    blocksChanged = true;
  }
  if (typeof body.preheader === "string") {
    update.preheader = body.preheader;
    blocksChanged = true;
  }
  if (
    body.seller_perspective_html === null ||
    typeof body.seller_perspective_html === "string"
  ) {
    update.seller_perspective_html = body.seller_perspective_html;
    blocksChanged = true;
  }
  if (
    body.buyer_perspective_html === null ||
    typeof body.buyer_perspective_html === "string"
  ) {
    update.buyer_perspective_html = body.buyer_perspective_html;
    blocksChanged = true;
  }

  // Status toggle (separate from content edits)
  if (body.status === "approved") {
    update.status = "approved";
    update.approved_at = new Date().toISOString();
  } else if (body.status === "draft") {
    update.status = "draft";
    update.approved_at = null;
  }

  // Stash the pre-change snapshot for one-step undo (only when content changes)
  if (blocksChanged) {
    update.last_edit_snapshot = snapshotBlocks(current);
  }

  // Apply the block changes first so re-render sees the new values
  const { error: updErr } = await service
    .from("hl_emails")
    .update(update)
    .eq("id", emailId)
    .eq("run_id", id);
  if (updErr) return Response.json({ error: updErr.message }, { status: 500 });

  // Re-render the full HTML if any block changed
  if (blocksChanged) {
    try {
      const { html, plain_text } = await rerenderEmail(emailId);
      await service
        .from("hl_emails")
        .update({ html, plain_text })
        .eq("id", emailId);
    } catch (e) {
      return Response.json(
        {
          error: `Saved but re-render failed: ${
            e instanceof Error ? e.message : String(e)
          }`,
        },
        { status: 500 }
      );
    }
  }

  const { data } = await service
    .from("hl_emails")
    .select("*")
    .eq("id", emailId)
    .single();

  return Response.json({ email: data });
}
