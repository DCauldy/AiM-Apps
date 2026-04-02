import { createServiceRoleClient } from "@/lib/supabase/server";
import { NextRequest } from "next/server";

export async function POST(req: NextRequest) {
  try {
    const { email } = await req.json();
    if (!email || typeof email !== "string") {
      return Response.json({ isAimMember: false });
    }

    const serviceClient = createServiceRoleClient();
    const { data } = await serviceClient
      .from("profiles")
      .select("memberstack_id")
      .eq("email", email.toLowerCase().trim())
      .maybeSingle();

    // User is an AiM member if they've authenticated via the WP JWT flow
    return Response.json({ isAimMember: data?.memberstack_id != null });
  } catch {
    return Response.json({ isAimMember: false });
  }
}
