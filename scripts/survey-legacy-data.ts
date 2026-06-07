/**
 * Survey existing legacy data to scope the Phase 4 backfill.
 *
 * Usage: npx tsx scripts/survey-legacy-data.ts
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

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

async function main() {
  const tables = [
    "profiles",
    "user_profiles",
    "platform_sender_profiles",
    "platform_branding_profiles",
    "platform_profiles",
    "radar_config",
    "bofu_cms_connections",
    "bofu_schedules",
    "bofu_topics",
    "bofu_blogs",
    "hl_runs",
  ];

  console.log("── Row counts ──");
  for (const t of tables) {
    const { count, error } = await supabase
      .from(t)
      .select("*", { count: "exact", head: true });
    if (error) {
      console.log(`  ${t}: ERROR ${error.message}`);
    } else {
      console.log(`  ${t}: ${count}`);
    }
  }

  console.log("\n── Users with user_profiles (Blog Engine onboarded) ──");
  const { data: upUsers } = await supabase
    .from("user_profiles")
    .select("user_id, full_name, business_name, metro_area, onboarding_completed");
  console.log(JSON.stringify(upUsers, null, 2));

  console.log("\n── Users with platform_sender_profiles (Hyperlocal onboarded) ──");
  const { data: spUsers } = await supabase
    .from("platform_sender_profiles")
    .select("user_id, full_name, brokerage, is_default");
  console.log(JSON.stringify(spUsers, null, 2));

  console.log("\n── Users with platform_branding_profiles ──");
  const { data: bpUsers } = await supabase
    .from("platform_branding_profiles")
    .select("user_id, name, is_default");
  console.log(JSON.stringify(bpUsers, null, 2));

  console.log("\n── radar_config rows ──");
  const { data: rcUsers } = await supabase
    .from("radar_config")
    .select("user_id, brand_variations, monitored_engines, tier");
  console.log(JSON.stringify(rcUsers, null, 2));
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
