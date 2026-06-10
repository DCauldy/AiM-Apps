import { createClient } from "@/lib/supabase/server";
import { getListingStudioUsage } from "@/lib/listing-studio/usage";

export const dynamic = "force-dynamic";

/**
 * GET /api/apps/listing-studio/usage
 *
 * Returns the current user's Listing Studio usage status (active
 * listings promoted vs. pack limit + CMA soft cap). Used by
 * ListingStudioHeader to render the in-app usage chip + drive the
 * upgrade-modal trigger when limits are hit.
 */
export async function GET() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return Response.json({ error: "Unauthorized" }, { status: 401 });

  const usage = await getListingStudioUsage(user.id);
  return Response.json({ usage });
}
