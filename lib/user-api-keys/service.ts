import "server-only";

import { decrypt } from "@/lib/blog-engine/encryption";
import { createServiceRoleClient } from "@/lib/supabase/server";
import type { UserApiKeyServiceKey } from "@/lib/user-api-keys/registry";

export class UserApiKeyMissingError extends Error {
  serviceKey: UserApiKeyServiceKey;

  constructor(serviceKey: UserApiKeyServiceKey) {
    super(`${serviceKey} API key is not configured`);
    this.name = "UserApiKeyMissingError";
    this.serviceKey = serviceKey;
  }
}

/**
 * Fetch a stored API key for a specific profile.
 *
 * Keys are profile-scoped (since 20260615000002): a user with multiple
 * platform_profiles can hold a different ElevenLabs/HeyGen account per
 * profile. Tours render code reads `project.profile_id` and passes it
 * through.
 */
export async function getProfileApiKey(
  profileId: string,
  serviceKey: UserApiKeyServiceKey
): Promise<string | null> {
  const service = createServiceRoleClient();
  const { data, error } = await service
    .from("user_api_keys")
    .select("api_key_encrypted")
    .eq("profile_id", profileId)
    .eq("service_key", serviceKey)
    .maybeSingle();

  if (error) throw error;
  if (!data?.api_key_encrypted) return null;

  return decrypt(data.api_key_encrypted);
}

export async function withProfileApiKey<T>(
  profileId: string,
  serviceKey: UserApiKeyServiceKey,
  factory: (apiKey: string) => T | Promise<T>
): Promise<T> {
  const apiKey = await getProfileApiKey(profileId, serviceKey);

  if (!apiKey) {
    throw new UserApiKeyMissingError(serviceKey);
  }

  return factory(apiKey);
}
