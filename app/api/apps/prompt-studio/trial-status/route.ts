import { createClient } from "@/lib/supabase/server";
import { getTrialStatus } from "@/lib/trial";
import { NextRequest } from "next/server";

export const dynamic = "force-dynamic";

export async function GET(_req: NextRequest) {
  try {
    const supabase = await createClient();
    const { data: { user }, error } = await supabase.auth.getUser();

    if (error || !user) {
      return Response.json({ error: "Unauthorized" }, { status: 401 });
    }

    const status = await getTrialStatus(user.id);
    return Response.json(status);
  } catch (err: any) {
    return Response.json({ error: err.message || "Internal server error" }, { status: 500 });
  }
}
