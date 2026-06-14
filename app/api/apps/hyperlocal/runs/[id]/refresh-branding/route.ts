import { createClient, createServiceRoleClient } from "@/lib/supabase/server";
import { rerenderEmail } from "@/lib/hyperlocal/email/rerender";
import { NextRequest } from "next/server";

export const dynamic = "force-dynamic";

// ============================================================
// POST /api/apps/hyperlocal/runs/:id/refresh-branding
//
// Re-renders every draft on the run with the CURRENT profile data —
// fresh logo, colors, fonts, sign-off, etc. Drafts are stored as
// static HTML at generation time, so any profile change made after a
// run was generated needs an explicit refresh to take effect.
//
// Preserves all editable fields (subject, preheader, seller/buyer
// perspective HTML, AI edit history). Only the rendered `html` +
// `plain_text` columns are updated.
//
// Errors on individual emails are collected and returned without
// aborting the batch — partial refresh is better than no refresh.
// ============================================================

export async function POST(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id: runId } = await params;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return Response.json({ error: "Unauthorized" }, { status: 401 });

  const service = createServiceRoleClient();
  const { data: run } = await service
    .from("hl_runs")
    .select("id, user_id")
    .eq("id", runId)
    .eq("user_id", user.id)
    .maybeSingle();
  if (!run) return Response.json({ error: "Run not found" }, { status: 404 });

  const { data: emails } = await service
    .from("hl_emails")
    .select("id")
    .eq("run_id", runId);
  if (!emails || emails.length === 0) {
    return Response.json({ refreshed: 0, errors: [] });
  }

  let refreshed = 0;
  const errors: Array<{ email_id: string; error: string }> = [];

  for (const e of emails) {
    try {
      const { html, plain_text } = await rerenderEmail(e.id);
      const { error: updErr } = await service
        .from("hl_emails")
        .update({ html, plain_text })
        .eq("id", e.id);
      if (updErr) {
        errors.push({ email_id: e.id, error: updErr.message });
      } else {
        refreshed += 1;
      }
    } catch (err) {
      errors.push({
        email_id: e.id,
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }

  return Response.json({ refreshed, total: emails.length, errors });
}
