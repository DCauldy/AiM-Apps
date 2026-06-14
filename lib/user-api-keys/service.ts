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

export async function getUserApiKey(
  userId: string,
  serviceKey: UserApiKeyServiceKey
): Promise<string | null> {
  const service = createServiceRoleClient();
  const { data, error } = await service
    .from("user_api_keys")
    .select("api_key_encrypted")
    .eq("user_id", userId)
    .eq("service_key", serviceKey)
    .maybeSingle();

  if (error) throw error;
  if (!data?.api_key_encrypted) return null;

  return decrypt(data.api_key_encrypted);
}

export async function withUserApiKey<T>(
  userId: string,
  serviceKey: UserApiKeyServiceKey,
  factory: (apiKey: string) => T | Promise<T>
): Promise<T> {
  const apiKey = await getUserApiKey(userId, serviceKey);

  if (!apiKey) {
    throw new UserApiKeyMissingError(serviceKey);
  }

  return factory(apiKey);
}
