import { createClient } from "@/lib/supabase/server";
import { getFeatureFlag } from "@/lib/admin-config.server";
import {
  fetchSoldComps,
  RapidApiAuthError,
  RapidApiRateLimitError,
  RapidApiFetchError,
} from "@/lib/listing-studio/rapidapi";
import { NextRequest } from "next/server";

export const dynamic = "force-dynamic";

// ============================================================
// POST /api/apps/listing-studio/comps-lookup
// Body: { zip, radius_mi?, months_back?, property_type?, subject_sqft? }
//
// Proxy to RapidAPI's solds endpoint. The CMA tab uses this to preview
// the raw comp pool before kicking off the pipeline (so the agent can
// tune radius / months / property type without burning a CMA run).
// ============================================================

export async function POST(req: NextRequest) {
  if (!(await getFeatureFlag("LISTING_STUDIO"))) {
    return Response.json({ error: "Not found" }, { status: 404 });
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return Response.json({ error: "Unauthorized" }, { status: 401 });

  const body = await req.json().catch(() => ({}));
  const zip = typeof body?.zip === "string" ? body.zip.trim() : "";
  if (!zip) {
    return Response.json({ error: "zip is required" }, { status: 400 });
  }

  try {
    const comps = await fetchSoldComps({
      zip,
      radius_mi: typeof body.radius_mi === "number" ? body.radius_mi : 1,
      months_back: typeof body.months_back === "number" ? body.months_back : 6,
      property_type:
        typeof body.property_type === "string" ? body.property_type : undefined,
      subject_sqft:
        typeof body.subject_sqft === "number" ? body.subject_sqft : undefined,
    });
    return Response.json({ comps, count: comps.length });
  } catch (err) {
    if (err instanceof RapidApiAuthError) {
      return Response.json(
        { error: "Comps data source not configured.", comps: [], count: 0 },
        { status: 200 },
      );
    }
    if (err instanceof RapidApiRateLimitError) {
      return Response.json(
        { error: "Comps data source rate-limited. Try again shortly.", comps: [], count: 0 },
        { status: 200 },
      );
    }
    if (err instanceof RapidApiFetchError) {
      return Response.json(
        { error: "Couldn't reach the comps data source.", comps: [], count: 0 },
        { status: 200 },
      );
    }
    const message = err instanceof Error ? err.message : "Lookup failed";
    return Response.json({ error: message }, { status: 500 });
  }
}
