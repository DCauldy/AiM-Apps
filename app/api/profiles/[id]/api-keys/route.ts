import type { NextRequest } from "next/server";
import { encrypt } from "@/lib/blog-engine/encryption";
import { createClient, createServiceRoleClient } from "@/lib/supabase/server";
import { isUserApiKeyServiceKey } from "@/lib/user-api-keys/registry";
import { listProfileApiKeySummaries } from "@/lib/user-api-keys/server";

export const dynamic = "force-dynamic";

/**
 * Per-profile API key CRUD.
 *
 * Keys are profile-scoped (since 20260615000002) so a multi-profile
 * user can hold a different ElevenLabs/HeyGen account per persona.
 * Ownership check is "the profile belongs to the authenticated user."
 */

async function assertProfileOwner(
  userId: string,
  profileId: string,
): Promise<true | Response> {
  const service = createServiceRoleClient();
  const { data } = await service
    .from("platform_profiles")
    .select("id")
    .eq("id", profileId)
    .eq("user_id", userId)
    .maybeSingle();
  if (!data) {
    return Response.json({ error: "Profile not found" }, { status: 404 });
  }
  return true;
}

export async function GET(
  _req: NextRequest,
  context: { params: Promise<{ id: string }> },
) {
  const { id: profileId } = await context.params;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return Response.json({ error: "Unauthorized" }, { status: 401 });

  const ownership = await assertProfileOwner(user.id, profileId);
  if (ownership !== true) return ownership;

  try {
    const apiKeys = await listProfileApiKeySummaries(profileId);
    return Response.json({ apiKeys });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Failed to load API keys";
    return Response.json({ error: message }, { status: 500 });
  }
}

export async function POST(
  req: NextRequest,
  context: { params: Promise<{ id: string }> },
) {
  const { id: profileId } = await context.params;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return Response.json({ error: "Unauthorized" }, { status: 401 });

  const ownership = await assertProfileOwner(user.id, profileId);
  if (ownership !== true) return ownership;

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
          profile_id: profileId,
          service_key: serviceKey,
          api_key_encrypted: encrypt(apiKey),
          updated_at: now,
        },
        { onConflict: "profile_id,service_key" },
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

export async function DELETE(
  req: NextRequest,
  context: { params: Promise<{ id: string }> },
) {
  const { id: profileId } = await context.params;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return Response.json({ error: "Unauthorized" }, { status: 401 });

  const ownership = await assertProfileOwner(user.id, profileId);
  if (ownership !== true) return ownership;

  const serviceKey = req.nextUrl.searchParams.get("service_key") ?? "";
  if (!isUserApiKeyServiceKey(serviceKey)) {
    return Response.json({ error: "Unsupported integration" }, { status: 400 });
  }

  try {
    const service = createServiceRoleClient();
    const { error } = await service
      .from("user_api_keys")
      .delete()
      .eq("profile_id", profileId)
      .eq("service_key", serviceKey);

    if (error) throw error;
    return Response.json({ ok: true });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Failed to remove API key";
    return Response.json({ error: message }, { status: 500 });
  }
}
