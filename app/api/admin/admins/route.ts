import { createClient, createServiceRoleClient } from "@/lib/supabase/server";
import { isAdminUser } from "@/lib/admin";

export const dynamic = "force-dynamic";

export async function GET() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user || !isAdminUser(user)) {
    return Response.json({ error: "Forbidden" }, { status: 403 });
  }

  const serviceClient = createServiceRoleClient();
  const { data, error } = await serviceClient.auth.admin.listUsers({
    perPage: 1000,
  });

  if (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }

  const admins = data.users
    .filter((u) => u.app_metadata?.is_admin === true)
    .map((u) => ({
      id: u.id,
      email: u.email,
      name: u.user_metadata?.full_name ?? null,
    }));

  return Response.json(admins);
}

export async function POST(req: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user || !isAdminUser(user)) {
    return Response.json({ error: "Forbidden" }, { status: 403 });
  }

  const { email } = await req.json();

  if (!email || typeof email !== "string") {
    return Response.json({ error: "email is required" }, { status: 400 });
  }

  const serviceClient = createServiceRoleClient();

  // Look up user by email in profiles table
  const { data: profile } = await serviceClient
    .from("profiles")
    .select("id")
    .eq("email", email.toLowerCase())
    .single();

  if (!profile) {
    return Response.json({ error: "User not found" }, { status: 404 });
  }

  // Set admin flag
  const { error } = await serviceClient.auth.admin.updateUserById(profile.id, {
    app_metadata: { is_admin: true },
  });

  if (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }

  return Response.json({ success: true, userId: profile.id });
}
