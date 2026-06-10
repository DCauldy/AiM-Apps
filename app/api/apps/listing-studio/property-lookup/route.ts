import { createClient } from "@/lib/supabase/server";
import { getFeatureFlag } from "@/lib/admin-config.server";
import {
  lookupProperty,
  RapidApiAuthError,
  RapidApiRateLimitError,
  RapidApiFetchError,
} from "@/lib/listing-studio/rapidapi";
import { NextRequest } from "next/server";
import type { PropertyLookupResponse } from "@/types/listing-studio";

export const dynamic = "force-dynamic";

// ============================================================
// POST /api/apps/listing-studio/property-lookup
// Body: { address: string }
//
// Proxies RapidAPI's property endpoint so the address-input form on
// /listings/new can prefill the property facts. Translates the wrapper's
// typed errors into user-readable strings so the UI can show what went
// wrong and let the user fall back to manual entry.
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
  const address = (body?.address ?? "").trim();
  if (!address) {
    return Response.json({ error: "address is required" }, { status: 400 });
  }

  try {
    const facts = await lookupProperty(address);
    const response: PropertyLookupResponse = { facts };
    return Response.json(response);
  } catch (err) {
    if (err instanceof RapidApiAuthError) {
      return Response.json(
        {
          facts: null,
          error: "Property data source is not configured. You can still enter facts manually.",
        } satisfies PropertyLookupResponse,
        { status: 200 },
      );
    }
    if (err instanceof RapidApiRateLimitError) {
      return Response.json(
        {
          facts: null,
          error: "Property data source rate-limited. Enter facts manually for now.",
        } satisfies PropertyLookupResponse,
        { status: 200 },
      );
    }
    if (err instanceof RapidApiFetchError) {
      return Response.json(
        {
          facts: null,
          error: "Couldn't reach the property data source. Enter facts manually for now.",
        } satisfies PropertyLookupResponse,
        { status: 200 },
      );
    }
    const message = err instanceof Error ? err.message : "Lookup failed";
    return Response.json({ error: message }, { status: 500 });
  }
}
