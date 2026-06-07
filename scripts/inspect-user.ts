/**
 * Print full auth + profile state for a user by UID or email.
 *
 * Usage:
 *   npx tsx scripts/inspect-user.ts <uid-or-email>
 */

import { createClient } from "@supabase/supabase-js";
import { readFileSync } from "fs";
import { resolve } from "path";

function loadEnvLocal() {
  try {
    const text = readFileSync(resolve(process.cwd(), ".env.local"), "utf8");
    for (const rawLine of text.split("\n")) {
      const line = rawLine.trim();
      if (!line || line.startsWith("#")) continue;
      const eq = line.indexOf("=");
      if (eq < 0) continue;
      const key = line.slice(0, eq).trim();
      let value = line.slice(eq + 1).trim();
      if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
        value = value.slice(1, -1);
      }
      if (!(key in process.env)) process.env[key] = value;
    }
  } catch {}
}

loadEnvLocal();

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!supabaseUrl || !serviceKey) {
  console.error("Missing SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY");
  process.exit(1);
}

const arg = process.argv[2];
if (!arg) {
  console.error("Usage: npx tsx scripts/inspect-user.ts <uid-or-email>");
  process.exit(1);
}

const supabase = createClient(supabaseUrl, serviceKey);

async function main() {
  const isUid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(arg);

  let authUser;
  if (isUid) {
    const { data, error } = await supabase.auth.admin.getUserById(arg);
    if (error || !data?.user) {
      console.error("Auth lookup failed:", error?.message);
      process.exit(1);
    }
    authUser = data.user;
  } else {
    const { data: list, error } = await supabase.auth.admin.listUsers({ page: 1, perPage: 200 });
    if (error) {
      console.error("Auth list failed:", error.message);
      process.exit(1);
    }
    authUser = list.users.find((u) => u.email?.toLowerCase() === arg.toLowerCase());
    if (!authUser) {
      console.error(`No auth user with email ${arg}`);
      process.exit(1);
    }
  }

  console.log("── auth.users ──");
  console.log({
    id: authUser.id,
    email: authUser.email,
    email_confirmed_at: authUser.email_confirmed_at,
    confirmed_at: authUser.confirmed_at,
    last_sign_in_at: authUser.last_sign_in_at,
    banned_until: (authUser as { banned_until?: string }).banned_until,
    created_at: authUser.created_at,
    app_metadata: authUser.app_metadata,
    user_metadata: authUser.user_metadata,
    identities: authUser.identities?.map((i) => ({ provider: i.provider, id: i.id })),
  });

  const { data: profile, error: profileErr } = await supabase
    .from("profiles")
    .select("*")
    .eq("id", authUser.id)
    .maybeSingle();

  console.log("\n── profiles ──");
  if (profileErr) console.error("profile error:", profileErr.message);
  else console.log(profile ?? "(no profile row)");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
