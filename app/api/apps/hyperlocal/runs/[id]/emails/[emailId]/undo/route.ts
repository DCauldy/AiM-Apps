import { createClient, createServiceRoleClient } from "@/lib/supabase/server";
import { rerenderEmail } from "@/lib/hyperlocal/email/rerender";
import type { DraftBlocks } from "@/lib/hyperlocal/email/rerender";
import { NextRequest } from "next/server";

export const dynamic = "force-dynamic";

/**
 * POST /api/apps/hyperlocal/runs/:id/emails/:emailId/undo
 * Reverts the last edit (either AI-driven or manual) by restoring
 * last_edit_snapshot back into the block fields, then re-rendering HTML.
 * One-step undo only — there's no redo stack.
 */
export async function POST(
  _req: NextRequest,
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

  const { data: email } = await service
    .from("hl_emails")
    .select("id, last_edit_snapshot, refinements_used")
    .eq("id", emailId)
    .eq("run_id", id)
    .single();
  if (!email) return Response.json({ error: "Email not found" }, { status: 404 });
  if (!email.last_edit_snapshot) {
    return Response.json({ error: "Nothing to undo" }, { status: 400 });
  }

  const snapshot = email.last_edit_snapshot as DraftBlocks;

  await service
    .from("hl_emails")
    .update({
      subject: snapshot.subject,
      preheader: snapshot.preheader,
      seller_perspective_html: snapshot.seller_perspective_html,
      buyer_perspective_html: snapshot.buyer_perspective_html,
      last_edit_snapshot: null,                  // single-step — no chain
      refinements_used: Math.max(0, email.refinements_used - 1),
      updated_at: new Date().toISOString(),
    })
    .eq("id", emailId);

  try {
    const { html, plain_text } = await rerenderEmail(emailId);
    await service
      .from("hl_emails")
      .update({ html, plain_text })
      .eq("id", emailId);
  } catch (e) {
    return Response.json(
      {
        error: `Undid blocks but re-render failed: ${
          e instanceof Error ? e.message : String(e)
        }`,
      },
      { status: 500 }
    );
  }

  // Log the undo as a system message in the chat so the user sees it
  await service.from("hl_email_chats").insert({
    email_id: emailId,
    role: "system",
    content: "Reverted to previous version.",
  });

  return Response.json({ success: true });
}
