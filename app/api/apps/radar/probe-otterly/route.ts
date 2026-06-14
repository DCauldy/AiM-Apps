import { NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { isAdminUser } from "@/lib/admin";
import {
  createOtterlyClient,
  OtterlyApiError,
} from "@/lib/radar-otterly/client";

export const dynamic = "force-dynamic";

// ============================================================
// POST /api/apps/radar/probe-otterly
//
// Probe endpoint for the Radar v2 rebuild. Admin-only — passes an
// arbitrary Otterly API path (e.g. `/v1/brands/<id>/mentions`) and
// returns whatever Otterly returns. The sandbox page at
// /apps/radar/probe-otterly is the only consumer; once we map the
// response shapes to real dashboard widgets the probe goes away.
//
// Body: { path: string, method?: "GET" | "POST", body?: unknown }
// ============================================================

export async function POST(req: NextRequest) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return Response.json({ error: "Unauthorized" }, { status: 401 });
  if (!isAdminUser(user)) {
    return Response.json({ error: "Admin only" }, { status: 403 });
  }

  let payload: { path?: string; method?: string; body?: unknown };
  try {
    payload = await req.json();
  } catch {
    return Response.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const path = payload.path?.trim();
  if (!path) {
    return Response.json(
      { error: "`path` is required (e.g. /v1/brands/<id>)" },
      { status: 400 },
    );
  }

  const method = (payload.method ?? "GET").toUpperCase();
  if (!["GET", "POST", "PUT", "DELETE", "PATCH"].includes(method)) {
    return Response.json({ error: `Invalid method: ${method}` }, { status: 400 });
  }

  try {
    const client = createOtterlyClient();
    const data = await client.raw(path, {
      method,
      ...(payload.body !== undefined
        ? { body: JSON.stringify(payload.body) }
        : {}),
    });
    return Response.json({ ok: true, data });
  } catch (e) {
    if (e instanceof OtterlyApiError) {
      return Response.json(
        {
          ok: false,
          error: e.message,
          status: e.status,
          body: e.body,
        },
        { status: e.status === 500 ? 500 : 502 },
      );
    }
    return Response.json(
      { ok: false, error: e instanceof Error ? e.message : "Unknown error" },
      { status: 500 },
    );
  }
}
