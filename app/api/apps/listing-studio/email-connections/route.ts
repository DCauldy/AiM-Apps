import { NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getActiveProfile } from "@/lib/profiles/server";

export const dynamic = "force-dynamic";

// Encrypted-credential columns (resend_api_key_encrypted, provider_*_encrypted)
// are deliberately omitted — the client never needs to see secrets.
// provider_metadata IS included because per-provider UIs read list/audience
// IDs from it to decide whether to show test-send affordances.
const PUBLIC_FIELDS = `
  id, profile_id, provider, email_address, display_name,
  is_active, is_default,
  resend_domain, resend_dkim_status, resend_webhook_id,
  provider_metadata,
  last_send_at, last_error,
  created_at, updated_at
`;

export async function GET() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return Response.json({ error: "Unauthorized" }, { status: 401 });

  const profile = await getActiveProfile(user.id);
  let query = supabase
    .from("cma_email_connections")
    .select(PUBLIC_FIELDS)
    .eq("user_id", user.id)
    .order("is_default", { ascending: false })
    .order("created_at", { ascending: false });
  if (profile) query = query.eq("profile_id", profile.id);

  const { data, error } = await query;
  if (error) return Response.json({ error: error.message }, { status: 500 });
  return Response.json({ connections: data ?? [] });
}

// Connection creation flows through provider-specific routes:
//   POST /api/apps/listing-studio/email-connections/resend
//        → registers the agent's Resend domain + verifies DKIM
//   POST /api/apps/listing-studio/email-connections/sendgrid
//        → validates the API key + creates the row
// Those land alongside Wave 4 (delivery). For now: 501 like Hyperlocal.
export async function POST(_req: NextRequest) {
  return Response.json(
    {
      error:
        "Direct creation not supported. Use the provider-specific connect routes (Wave 4).",
    },
    { status: 501 },
  );
}
