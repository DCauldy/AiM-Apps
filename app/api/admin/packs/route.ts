import { createClient, createServiceRoleClient } from "@/lib/supabase/server";
import { isAdminUser } from "@/lib/admin";
import { NextRequest } from "next/server";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user || !isAdminUser(user)) {
    return Response.json({ error: "Forbidden" }, { status: 403 });
  }

  const serviceClient = createServiceRoleClient();
  let query = serviceClient
    .from("admin_pack_configs")
    .select("*")
    .order("sort_order");

  const app = req.nextUrl.searchParams.get("app");
  if (app) {
    query = query.eq("app", app);
  }

  const { data, error } = await query;

  if (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }

  return Response.json(data);
}
