import { createClient } from "@/lib/supabase/server";
import { getListingStudioUsage } from "@/lib/listing-studio/usage";

export const dynamic = "force-dynamic";

/**
 * GET /api/apps/listing-studio/usage
 *
 * Returns the ListingStudioUsageStatus shape so ListingStudioHeader
 * can render its enrolled-clients chip. Demolished alongside the v1
 * surface in 5bc1d3e; restored here for the Wave 6 header.
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
