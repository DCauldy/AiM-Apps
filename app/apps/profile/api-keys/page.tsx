import { createClient } from "@/lib/supabase/server";
import { USER_APIKEY_REGISTRY } from "@/lib/user-api-keys/registry";
import { listUserApiKeySummaries } from "@/lib/user-api-keys/server";
import { ProfileApiKeysClient } from "./profile-api-keys-client";

export const dynamic = "force-dynamic";

export default async function ProfileApiKeysPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;

  const apiKeys = await listUserApiKeySummaries(user.id);

  return (
    <ProfileApiKeysClient
      registry={USER_APIKEY_REGISTRY}
      initialApiKeys={apiKeys}
    />
  );
}
