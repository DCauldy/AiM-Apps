import { createServiceRoleClient } from "@/lib/supabase/server";
import type { UserApiKeyServiceKey } from "@/lib/user-api-keys/registry";

export type UserApiKeySummary = {
  service_key: string;
  has_key: boolean;
  updated_at: string;
};

export type UserApiKeyStatus = {
  service_key: UserApiKeyServiceKey;
  has_key: boolean;
  updated_at: string | null;
};

export type UserApiKeyStatusMap = Partial<Record<UserApiKeyServiceKey, boolean>>;

/**
 * List the API key summaries for a single profile.
 *
 * Keys are profile-scoped (since 20260615000002). Each platform_profile
 * holds its own ElevenLabs/HeyGen credentials so a multi-profile user
 * can run different accounts per persona.
 */
export async function listProfileApiKeySummaries(
  profileId: string
): Promise<UserApiKeySummary[]> {
  const service = createServiceRoleClient();
  const { data, error } = await service
    .from("user_api_keys")
    .select("service_key, updated_at")
    .eq("profile_id", profileId)
    .order("service_key", { ascending: true });

  if (error) throw error;

  return (data ?? []).map((row) => ({
    service_key: row.service_key,
    has_key: true,
    updated_at: row.updated_at,
  }));
}

export async function getProfileApiKeyStatus(
  profileId: string,
  serviceKey: UserApiKeyServiceKey
): Promise<UserApiKeyStatus> {
  const service = createServiceRoleClient();
  const { data, error } = await service
    .from("user_api_keys")
    .select("service_key, updated_at")
    .eq("profile_id", profileId)
    .eq("service_key", serviceKey)
    .maybeSingle();

  if (error) throw error;

  return {
    service_key: serviceKey,
    has_key: Boolean(data),
    updated_at: data?.updated_at ?? null,
  };
}

export async function getProfileApiKeyStatusMap(
  profileId: string,
  serviceKeys: readonly UserApiKeyServiceKey[]
): Promise<UserApiKeyStatusMap> {
  if (serviceKeys.length === 0) return {};

  const service = createServiceRoleClient();
  const { data, error } = await service
    .from("user_api_keys")
    .select("service_key")
    .eq("profile_id", profileId)
    .in("service_key", [...serviceKeys]);

  if (error) throw error;

  const configured = new Set((data ?? []).map((row) => row.service_key));

  return Object.fromEntries(
    serviceKeys.map((serviceKey) => [serviceKey, configured.has(serviceKey)])
  ) as UserApiKeyStatusMap;
}
