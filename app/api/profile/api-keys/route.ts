import type { NextRequest } from "next/server";
import { encrypt } from "@/lib/blog-engine/encryption";
import { createClient, createServiceRoleClient } from "@/lib/supabase/server";
import { isUserApiKeyServiceKey } from "@/lib/user-api-keys/registry";
import { listUserApiKeySummaries } from "@/lib/user-api-keys/server";

export const dynamic = "force-dynamic";

export async function GET() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) return Response.json({ error: "Unauthorized" }, { status: 401 });

  try {
    const apiKeys = await listUserApiKeySummaries(user.id);
    return Response.json({ apiKeys });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Failed to load API keys";
    return Response.json({ error: message }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) return Response.json({ error: "Unauthorized" }, { status: 401 });

  const body = (await req.json()) as Record<string, unknown>;
  const serviceKey = typeof body.service_key === "string" ? body.service_key : "";
  const apiKey = typeof body.api_key === "string" ? body.api_key.trim() : "";

  if (!isUserApiKeyServiceKey(serviceKey)) {
    return Response.json({ error: "Unsupported integration" }, { status: 400 });
  }

  if (!apiKey) {
    return Response.json({ error: "API key is required" }, { status: 400 });
  }

  try {
    const service = createServiceRoleClient();
    const now = new Date().toISOString();
    const { data, error } = await service
      .from("user_api_keys")
      .upsert(
        {
          user_id: user.id,
          service_key: serviceKey,
          api_key_encrypted: encrypt(apiKey),
          updated_at: now,
        },
        { onConflict: "user_id,service_key" }
      )
      .select("service_key, updated_at")
      .single();

    if (error) throw error;

    return Response.json({
      apiKey: {
        service_key: data.service_key,
        has_key: true,
        updated_at: data.updated_at,
      },
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Failed to save API key";
    return Response.json({ error: message }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) return Response.json({ error: "Unauthorized" }, { status: 401 });

  const serviceKey = req.nextUrl.searchParams.get("service_key") ?? "";

  if (!isUserApiKeyServiceKey(serviceKey)) {
    return Response.json({ error: "Unsupported integration" }, { status: 400 });
  }

  try {
    const service = createServiceRoleClient();
    const { error } = await service
      .from("user_api_keys")
      .delete()
      .eq("user_id", user.id)
      .eq("service_key", serviceKey);

    if (error) throw error;

    return Response.json({ ok: true });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Failed to remove API key";
    return Response.json({ error: message }, { status: 500 });
  }
}
