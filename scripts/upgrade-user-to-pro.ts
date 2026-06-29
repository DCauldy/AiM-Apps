/**
 * Upgrade a user to the "pro" subscription tier.
 *
 * Updates both:
 *   1. profiles.subscription_tier
 *   2. auth.users.app_metadata.subscription_tier  ← what the layout gates read
 *
 * Usage:
 *   npx tsx scripts/upgrade-user-to-pro.ts <email>
 *
 * Reads SUPABASE creds from .env.local (no dotenv dependency).
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
  } catch {
    // .env.local missing — fall back to whatever's in the environment
  }
}

loadEnvLocal();

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !serviceKey) {
  console.error("Missing SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY in env");
  process.exit(1);
}

const email = process.argv[2];
if (!email) {
  console.error("Usage: npx tsx scripts/upgrade-user-to-pro.ts <email>");
  process.exit(1);
}

const supabase = createClient(supabaseUrl, serviceKey);

async function main() {
  console.log(`Looking up ${email}…`);

  const { data: profile, error: profileLookupErr } = await supabase
    .from("profiles")
    .select("id, email, account_type, subscription_tier")
    .eq("email", email)
    .maybeSingle();

  if (profileLookupErr) {
    console.error("Profile lookup failed:", profileLookupErr.message);
    process.exit(1);
  }
  if (!profile) {
    console.error(`No profile found for ${email}`);
    process.exit(1);
  }

  console.log("Before:", profile);

  const { error: profileUpdateErr } = await supabase
    .from("profiles")
    .update({ subscription_tier: "pro" })
    .eq("id", profile.id);

  if (profileUpdateErr) {
    console.error("Profile update failed:", profileUpdateErr.message);
    process.exit(1);
  }

  const { data: authUser, error: authLookupErr } = await supabase.auth.admin.getUserById(profile.id);
  if (authLookupErr || !authUser?.user) {
    console.error("Auth user lookup failed:", authLookupErr?.message);
    process.exit(1);
  }

  const existingAppMetadata = authUser.user.app_metadata ?? {};
  const { error: authUpdateErr } = await supabase.auth.admin.updateUserById(profile.id, {
    app_metadata: {
      ...existingAppMetadata,
      subscription_tier: "pro",
    },
  });

  if (authUpdateErr) {
    console.error("Auth metadata update failed:", authUpdateErr.message);
    process.exit(1);
  }

  console.log(`✓ ${email} upgraded to pro. Sign out and back in to refresh the session.`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
