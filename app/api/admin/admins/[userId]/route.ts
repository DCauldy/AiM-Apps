import { createClient, createServiceRoleClient } from "@/lib/supabase/server";
import { isAdminUser } from "@/lib/admin";
import { NextRequest } from "next/server";

export const dynamic = "force-dynamic";

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ userId: string }> }
) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user || !isAdminUser(user)) {
    return Response.json({ error: "Forbidden" }, { status: 403 });
  }

  const { userId } = await params;

  // Can't remove self
  if (userId === user.id) {
    return Response.json({ error: "Cannot remove yourself as admin" }, { status: 400 });
  }

  // Count current admins to prevent removing the last one
  const serviceClient = createServiceRoleClient();
  const { data: allUsers } = await serviceClient.auth.admin.listUsers({
    perPage: 1000,
  });

  if (!allUsers) {
    return Response.json({ error: "Failed to list users" }, { status: 500 });
  }

  const adminCount = allUsers.users.filter(
    (u) => u.app_metadata?.is_admin === true
  ).length;

  if (adminCount <= 1) {
    return Response.json({ error: "Cannot remove the last admin" }, { status: 400 });
  }

  // Remove admin flag
  const { data: targetUser } = await serviceClient.auth.admin.getUserById(userId);
  if (!targetUser?.user) {
    return Response.json({ error: "User not found" }, { status: 404 });
  }

  // Preserve existing app_metadata, just remove is_admin
  const currentMetadata = targetUser.user.app_metadata ?? {};
  const { is_admin, ...restMetadata } = currentMetadata;

  const { error } = await serviceClient.auth.admin.updateUserById(userId, {
    app_metadata: { ...restMetadata, is_admin: false },
  });

  if (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }

  return Response.json({ success: true });
}
