import { createClient, createServiceRoleClient } from "@/lib/supabase/server";
import { isAdminUser } from "@/lib/admin";
import { FEATURE_FLAG_DEFAULTS } from "@/lib/admin-config.server";

export const dynamic = "force-dynamic";

const DEFAULT_SETTING_DESCRIPTIONS: Record<string, string> = {
  PROMPT_STUDIO: "Enable Prompt Studio app",
  BLOG_ENGINE: "Enable Blog Engine app",
  RADAR: "Enable Radar app",
  HYPERLOCAL: "Enable Hyperlocal market-report email campaigns app",
  TOURS: "Enable Tours listing project workspace app",
};

export async function GET() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user || !isAdminUser(user)) {
    return Response.json({ error: "Forbidden" }, { status: 403 });
  }

  const serviceClient = createServiceRoleClient();
  const { data, error } = await serviceClient
    .from("admin_settings")
    .select("*")
    .order("key");

  if (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }

  const settingsByKey = new Map((data ?? []).map((setting) => [setting.key, setting]));

  for (const [key, value] of Object.entries(FEATURE_FLAG_DEFAULTS)) {
    if (!settingsByKey.has(key)) {
      settingsByKey.set(key, {
        key,
        value: String(value),
        description: DEFAULT_SETTING_DESCRIPTIONS[key] ?? null,
        updated_at: null,
        updated_by: null,
      });
    }
  }

  return Response.json(
    Array.from(settingsByKey.values()).sort((a, b) => a.key.localeCompare(b.key))
  );
}

export async function PATCH(req: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user || !isAdminUser(user)) {
    return Response.json({ error: "Forbidden" }, { status: 403 });
  }

  const { key, value } = await req.json();

  if (!key || typeof value !== "string") {
    return Response.json({ error: "key and value are required" }, { status: 400 });
  }

  const serviceClient = createServiceRoleClient();
  const { data, error } = await serviceClient
    .from("admin_settings")
    .upsert(
      {
        key,
        value,
        updated_at: new Date().toISOString(),
        updated_by: user.id,
      },
      { onConflict: "key" }
    )
    .select()
    .single();

  if (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }

  return Response.json(data);
}
