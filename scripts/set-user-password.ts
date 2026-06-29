/**
 * Set a Supabase Auth user's password by UID.
 *
 * Usage:
 *   npx tsx scripts/set-user-password.ts <user-uid> <new-password>
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

const uid = process.argv[2];
const password = process.argv[3];
if (!uid || !password) {
  console.error("Usage: npx tsx scripts/set-user-password.ts <user-uid> <new-password>");
  process.exit(1);
}

const supabase = createClient(supabaseUrl, serviceKey);

async function main() {
  const { data: existing, error: lookupErr } = await supabase.auth.admin.getUserById(uid);
  if (lookupErr || !existing?.user) {
    console.error("Auth user lookup failed:", lookupErr?.message ?? `no user with uid ${uid}`);
    process.exit(1);
  }
  console.log(`Found ${existing.user.email} (${uid}). Updating password…`);

  const { error: updateErr } = await supabase.auth.admin.updateUserById(uid, { password });
  if (updateErr) {
    console.error("Password update failed:", updateErr.message);
    process.exit(1);
  }

  console.log(`✓ Password updated for ${existing.user.email}.`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
