import { createClient } from "@/lib/supabase/server";
import { NextRequest } from "next/server";

export const dynamic = "force-dynamic";

// Encrypted credential columns (api_key, oauth_access_token, webhook_secret)
// are deliberately NOT here — those are secret. We expose
// `webhook_secret_set` as a boolean alias instead.
//
// `provider_metadata` IS included — campaign-mode manage panels
// (MailchimpManagePanel, ActiveCampaignManagePanel) read list/audience
// ids from it to decide whether to show the test-send section. Stripping
// it caused the post-refresh "no test button" bug.
const PUBLIC_FIELDS = `id, provider, email_address, display_name, is_active, is_default, paused, paused_reason, paused_at, resend_domain, resend_dkim_status, resend_webhook_secret_encrypted, provider_metadata, last_send_at, last_error, created_at, updated_at`;

type RawRow = {
  resend_webhook_secret_encrypted: string | null;
  [k: string]: unknown;
};

function shapeRow(row: RawRow) {
  const { resend_webhook_secret_encrypted, ...rest } = row;
  return { ...rest, webhook_secret_set: !!resend_webhook_secret_encrypted };
}

export async function GET() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return Response.json({ error: "Unauthorized" }, { status: 401 });

  const { data, error } = await supabase
    .from("hl_email_connections")
    .select(PUBLIC_FIELDS)
    .eq("user_id", user.id)
    .order("is_default", { ascending: false })
    .order("created_at", { ascending: false });

  if (error) return Response.json({ error: error.message }, { status: 500 });
  return Response.json({
    connections: (data ?? []).map((r) => shapeRow(r as RawRow)),
  });
}

// POST handler is implemented in PR7 alongside OAuth flows.
export async function POST(_req: NextRequest) {
  return Response.json(
    { error: "Direct creation not supported. Use OAuth or Resend verification endpoints (PR7)." },
    { status: 501 }
  );
}
