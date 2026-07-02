import { NextRequest } from "next/server";

import { searchHeatContacts } from "@/lib/heat/contacts";
import { createClient, createServiceRoleClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/**
 * GET /api/apps/heat/contacts
 *
 * Loads the agent's connected CRM (platform-level) and returns a bounded
 * contact list for the Share modal's typeahead (filtered client-side).
 * Returns { connected:false } when no CRM is connected → the modal falls
 * back to manual entry.
 */
export async function GET(req: NextRequest) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return Response.json({ error: "Unauthorized" }, { status: 401 });

  const query = req.nextUrl.searchParams.get("q")?.trim() ?? "";

  const service = createServiceRoleClient();
  const { data: conn } = await service
    .from("platform_crm_connections")
    .select("*")
    .eq("user_id", user.id)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (!conn) return Response.json({ connected: false, contacts: [] });

  try {
    const { contacts, phoneOnlySupported } = await searchHeatContacts(conn, query);
    return Response.json({
      connected: true,
      platform: conn.platform,
      phoneOnlySupported,
      contacts,
    });
  } catch (err) {
    console.error("heat contacts search failed:", err);
    return Response.json({ connected: true, contacts: [], error: "Couldn't load contacts." });
  }
}
