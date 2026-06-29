/**
 * Quick verification that Phase 1 profile schema landed correctly.
 *
 * Usage: npx tsx scripts/verify-profile-schema.ts
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

const supabase = createClient(supabaseUrl, serviceKey);

async function main() {
  console.log("── platform_profiles table ──");
  const { count, error: countErr } = await supabase
    .from("platform_profiles")
    .select("*", { count: "exact", head: true });
  if (countErr) {
    console.error("FAIL:", countErr.message);
    process.exit(1);
  }
  console.log(`OK — row count: ${count ?? 0}`);

  console.log("\n── profiles.active_profile_id / profile_slot_count / slot_grace_period_ends_at ──");
  const { data: profileSample, error: profileErr } = await supabase
    .from("profiles")
    .select("id, active_profile_id, profile_slot_count, slot_grace_period_ends_at")
    .limit(1);
  if (profileErr) {
    console.error("FAIL:", profileErr.message);
    process.exit(1);
  }
  console.log("OK — sample row:", profileSample?.[0] ?? "(no rows)");

  console.log("\n── profile_id columns on app tables ──");
  const tables = [
    "bofu_cms_connections",
    "bofu_schedules",
    "bofu_topics",
    "bofu_blogs",
    "bofu_usage",
    "bofu_pack_purchases",
    "radar_config",
    "radar_competitors",
    "radar_usage",
    "hl_campaigns",
    "hl_crm_connections",
    "hl_email_connections",
    "hl_runs",
    "hl_suppressions",
    "threads",
    "saved_prompts",
    "prompt_studio_usage",
    "prompt_pack_purchases",
  ];

  let failures = 0;
  for (const t of tables) {
    const { error } = await supabase.from(t).select("profile_id").limit(1);
    if (error) {
      console.error(`  ✗ ${t}: ${error.message}`);
      failures++;
    } else {
      console.log(`  ✓ ${t}`);
    }
  }

  if (failures > 0) {
    console.error(`\n${failures} tables missing profile_id`);
    process.exit(1);
  }
  console.log("\n✓ Phase 1 schema verified.");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
