import { createClient } from "@/lib/supabase/server";
import { buildGoogleAuthorizeUrl } from "@/lib/hyperlocal/email/oauth/google";
import { signOauthState } from "@/lib/hyperlocal/email/oauth/state";
import { NextRequest } from "next/server";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return Response.json({ error: "Unauthorized" }, { status: 401 });

  const returnTo =
    new URL(req.url).searchParams.get("returnTo") ??
    "/apps/hyperlocal/settings?tab=email";

  const state = await signOauthState({
    userId: user.id,
    provider: "google",
    returnTo,
  });

  return Response.redirect(buildGoogleAuthorizeUrl(state), 302);
}
