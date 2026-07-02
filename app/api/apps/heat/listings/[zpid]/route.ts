import { NextRequest } from "next/server";

import { fetchListingImages, fetchListingRich } from "@/lib/heat/market-data";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/**
 * GET /api/apps/heat/listings/[zpid]
 *
 * Rich Zillow detail + hi-res gallery for the listing modal. Auth-gated
 * (Pro users only reach the Heat app anyway). Detail and images are two
 * provider calls; kept simple since the modal opens on demand.
 */
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ zpid: string }> },
) {
  const { zpid } = await params;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return Response.json({ error: "Unauthorized" }, { status: 401 });

  const [detail, images] = await Promise.all([
    fetchListingRich(zpid),
    fetchListingImages(zpid),
  ]);

  if (!detail) {
    return Response.json({ error: "Listing not found" }, { status: 404 });
  }

  return Response.json({ detail, images });
}
