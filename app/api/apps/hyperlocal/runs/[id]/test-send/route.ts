import { createClient, createServiceRoleClient } from "@/lib/supabase/server";
import { dispatchEmail } from "@/lib/hyperlocal/email/dispatch";
import {
  generateUnsubscribeToken,
  buildUnsubscribeUrl,
} from "@/lib/hyperlocal/email/unsubscribe";
import { NextRequest } from "next/server";
import type {
  HlEmailConnection,
  PlatformSenderProfile,
} from "@/types/hyperlocal";

export const dynamic = "force-dynamic";

const MAX_TEST_ADDRESSES = 3;
const SUBJECT_PREFIX = "[TEST] ";
const VALID_EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/**
 * POST /api/apps/hyperlocal/runs/:id/test-send
 * Body: { test_emails?: string[], email_id?: string }
 *
 * Sends drafts as test copies to the given addresses (or to the user's auth
 * email if none provided).
 *   - If `email_id` is provided → only that one draft (per-draft test, default UX)
 *   - Otherwise → every draft for this run (bulk test, advanced)
 *
 * Bypasses Inngest, doesn't touch hl_recipients, prefixes each subject with
 * [TEST]. Use to verify deliverability + formatting before doing the real blast.
 */
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: runId } = await params;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return Response.json({ error: "Unauthorized" }, { status: 401 });

  const body = await req.json().catch(() => ({}));
  const provided = Array.isArray(body.test_emails)
    ? (body.test_emails as unknown[])
        .map((e) => String(e).trim().toLowerCase())
        .filter((e) => VALID_EMAIL.test(e))
    : [];
  const onlyEmailId =
    typeof body.email_id === "string" && body.email_id.trim().length > 0
      ? body.email_id.trim()
      : null;

  const testEmails =
    provided.length > 0
      ? provided.slice(0, MAX_TEST_ADDRESSES)
      : user.email
        ? [user.email.toLowerCase()]
        : [];

  if (testEmails.length === 0) {
    return Response.json(
      { error: "No valid test email addresses provided" },
      { status: 400 }
    );
  }

  const service = createServiceRoleClient();

  // Load run with its profile + email connection (need service role to read
  // encrypted OAuth tokens / Resend keys). Sender identity now lives on
  // platform_profiles, referenced by run.profile_id.
  const { data: run } = await service
    .from("hl_runs")
    .select("id, user_id, phase, profile_id, email_connection_id")
    .eq("id", runId)
    .eq("user_id", user.id)
    .maybeSingle();
  if (!run) return Response.json({ error: "Run not found" }, { status: 404 });
  if (!run.email_connection_id) {
    return Response.json(
      { error: "No email connection configured for this run" },
      { status: 400 }
    );
  }
  if (!run.profile_id) {
    return Response.json(
      { error: "No Profile configured for this run" },
      { status: 400 }
    );
  }

  // Build the emails query. When `email_id` is provided we scope to that
  // single draft; otherwise we pull every draft for the run.
  let emailsQuery = service
    .from("hl_emails")
    .select("id, subject, html, plain_text, segment_id")
    .eq("run_id", runId)
    .in("status", ["draft", "approved", "sending", "sent"])
    .order("created_at", { ascending: true });
  if (onlyEmailId) {
    emailsQuery = emailsQuery.eq("id", onlyEmailId);
  }

  const [{ data: connection }, { data: profile }, { data: emails }] =
    await Promise.all([
      service
        .from("hl_email_connections")
        .select("*")
        .eq("id", run.email_connection_id)
        .single(),
      service
        .from("platform_profiles")
        .select("id, display_name, full_name, title, brokerage, phone, reply_to_email, license_number, physical_address, sign_off")
        .eq("id", run.profile_id)
        .single(),
      emailsQuery,
    ]);

  // Shape the row into the Sender-like object the downstream renderer expects.
  const sender = profile
    ? {
        id: profile.id,
        full_name: profile.full_name ?? profile.display_name,
        title: profile.title,
        brokerage: profile.brokerage,
        phone: profile.phone,
        reply_to_email: profile.reply_to_email,
        license_number: profile.license_number,
        physical_address: profile.physical_address,
        sign_off: profile.sign_off,
      }
    : null;

  if (!connection) {
    return Response.json(
      { error: "Email connection not found" },
      { status: 404 }
    );
  }
  if (!sender) {
    return Response.json(
      { error: "Sender profile not found" },
      { status: 404 }
    );
  }
  if (!emails || emails.length === 0) {
    return Response.json(
      {
        error: onlyEmailId
          ? "Draft not found for this run"
          : "No drafts to test-send. Run hasn't generated yet.",
      },
      { status: 400 }
    );
  }

  // Fire each test send sequentially. Throughput isn't critical here —
  // typically 10 drafts × 1 test recipient = 10 sends, ~5–10 sec total.
  const results: Array<{
    email_id: string;
    subject: string;
    to: string;
    ok: boolean;
    error?: string;
  }> = [];

  for (const email of emails) {
    for (const to of testEmails) {
      // Fresh per-recipient unsubscribe token so the link in the test email
      // actually works (suppresses that address from future real sends if
      // clicked — useful warning if the user is sending to a list they
      // don't want messed with)
      const unsubscribeToken = await generateUnsubscribeToken(user.id, to);
      const unsubscribeUrl = buildUnsubscribeUrl(unsubscribeToken);

      const finalHtml = (email.html ?? "")
        .replace(/\{\{UNSUBSCRIBE_URL:\{\{UNSUBSCRIBE_TOKEN\}\}\}\}/g, unsubscribeUrl)
        .replace(/\{\{UNSUBSCRIBE_URL\}\}/g, unsubscribeUrl);
      const finalText = (email.plain_text ?? "")
        .replace(/\{\{UNSUBSCRIBE_URL:\{\{UNSUBSCRIBE_TOKEN\}\}\}\}/g, unsubscribeUrl)
        .replace(/\{\{UNSUBSCRIBE_URL\}\}/g, unsubscribeUrl);

      try {
        const result = await dispatchEmail(
          connection as HlEmailConnection,
          {
            from: {
              email: (connection as HlEmailConnection).email_address,
              name: (sender as PlatformSenderProfile).full_name,
            },
            reply_to:
              (sender as PlatformSenderProfile).reply_to_email ?? undefined,
            to: { email: to },
            subject: SUBJECT_PREFIX + (email.subject ?? "(no subject)"),
            html: finalHtml,
            text: finalText,
            headers: {
              "List-Unsubscribe": `<${unsubscribeUrl}>`,
              "List-Unsubscribe-Post": "List-Unsubscribe=One-Click",
              "X-Hyperlocal-Test": "1",
            },
            tags: {
              run_id: runId,
              email_id: email.id,
              mode: "test",
            },
          }
        );
        results.push({
          email_id: email.id,
          subject: email.subject ?? "",
          to,
          ok: result.success,
          error: result.error,
        });
      } catch (e) {
        results.push({
          email_id: email.id,
          subject: email.subject ?? "",
          to,
          ok: false,
          error: e instanceof Error ? e.message : String(e),
        });
      }
    }
  }

  const successCount = results.filter((r) => r.ok).length;
  const failCount = results.length - successCount;

  return Response.json({
    sent: successCount,
    failed: failCount,
    total: results.length,
    test_emails: testEmails,
    results,
  });
}
