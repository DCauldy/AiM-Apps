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

  const searchParams = req.nextUrl.searchParams;
  const page = Math.max(1, parseInt(searchParams.get("page") ?? "1", 10));
  const pageSize = Math.min(100, Math.max(1, parseInt(searchParams.get("pageSize") ?? "25", 10)));
  const accountType = searchParams.get("accountType");

  const serviceClient = createServiceRoleClient();

  // Build query
  let query = serviceClient
    .from("profiles")
    .select("id, email, full_name, account_type, subscription_tier, created_at", {
      count: "exact",
    });

  if (accountType) {
    query = query.eq("account_type", accountType);
  }

  query = query
    .order("created_at", { ascending: false })
    .range((page - 1) * pageSize, page * pageSize - 1);

  const { data, count, error } = await query;

  if (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }

  const total = count ?? 0;

  return Response.json({
    users: data ?? [],
    total,
    page,
    totalPages: Math.ceil(total / pageSize),
  });
}
