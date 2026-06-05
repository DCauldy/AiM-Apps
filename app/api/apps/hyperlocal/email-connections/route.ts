import { createClient } from "@/lib/supabase/server";
import { NextRequest } from "next/server";

export const dynamic = "force-dynamic";

const PUBLIC_FIELDS = `id, provider, email_address, display_name, is_active, is_default, resend_domain, resend_dkim_status, last_send_at, last_error, created_at, updated_at`;

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
  return Response.json({ connections: data ?? [] });
}

// POST handler is implemented in PR7 alongside OAuth flows.
export async function POST(_req: NextRequest) {
  return Response.json(
    { error: "Direct creation not supported. Use OAuth or Resend verification endpoints (PR7)." },
    { status: 501 }
  );
}
