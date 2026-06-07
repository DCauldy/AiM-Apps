/**
 * Verify Phase 4 backfill — confirm the stitched profile exists,
 * is set as default + active, and all legacy app rows got profile_id.
 *
 * Usage: npx tsx scripts/verify-backfill.ts
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
  console.log("── platform_profiles (post-backfill) ──");
  const { data: profiles } = await supabase
    .from("platform_profiles")
    .select("*");
  for (const p of profiles ?? []) {
    console.log({
      id: p.id,
      user_id: p.user_id,
      display_name: p.display_name,
      brokerage: p.brokerage,
      metro_area: p.metro_area,
      is_default: p.is_default,
      primary_color: p.primary_color,
      neighborhoods_count: p.neighborhoods?.length ?? 0,
      target_clients_count: p.target_clients?.length ?? 0,
    });
  }

  console.log("\n── active_profile_id on profiles ──");
  for (const p of profiles ?? []) {
    const { data: meta } = await supabase
      .from("profiles")
      .select("id, email, active_profile_id, profile_slot_count")
      .eq("id", p.user_id)
      .single();
    console.log({
      email: meta?.email,
      active_profile_id: meta?.active_profile_id,
      slot_count: meta?.profile_slot_count,
      matches: meta?.active_profile_id === p.id ? "✓" : "✗",
    });
  }

  console.log("\n── profile_id backfill check (rows with profile_id NULL) ──");
  const tables = [
    "bofu_cms_connections",
    "bofu_schedules",
    "bofu_topics",
    "bofu_blogs",
    "bofu_usage",
    "radar_config",
    "radar_competitors",
    "hl_campaigns",
    "hl_crm_connections",
    "hl_email_connections",
    "hl_runs",
    "hl_suppressions",
  ];
  for (const t of tables) {
    const { count } = await supabase
      .from(t)
      .select("id", { count: "exact", head: true })
      .is("profile_id", null);
    console.log(`  ${t}: ${count} rows still null`);
  }

  console.log("\n── default-per-user invariant ──");
  const userCounts = new Map<string, number>();
  for (const p of profiles ?? []) {
    if (p.is_default && !p.archived_at) {
      userCounts.set(p.user_id, (userCounts.get(p.user_id) ?? 0) + 1);
    }
  }
  let violations = 0;
  for (const [uid, count] of userCounts) {
    if (count !== 1) {
      console.log(`  ✗ user ${uid} has ${count} defaults`);
      violations++;
    }
  }
  if (violations === 0) console.log("  ✓ every user with a profile has exactly one default");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
