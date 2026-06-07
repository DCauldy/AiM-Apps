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
  for (const t of ["user_profiles", "platform_sender_profiles", "platform_branding_profiles"]) {
    const { error } = await supabase.from(t).select("id").limit(1);
    if (error?.code === "42P01" || error?.message?.toLowerCase().includes("could not find the table") || error?.message?.includes("does not exist")) {
      console.log(`  ✓ ${t} — dropped`);
    } else if (error) {
      console.log(`  ? ${t} — unexpected: ${error.message}`);
    } else {
      console.log(`  ✗ ${t} — STILL PRESENT`);
    }
  }

  console.log("\n── App tables still functional ──");
  const live = ["platform_profiles", "bofu_schedules", "bofu_blogs", "hl_runs", "radar_config"];
  for (const t of live) {
    const { count, error } = await supabase.from(t).select("*", { count: "exact", head: true });
    if (error) console.log(`  ✗ ${t} — ${error.message}`);
    else console.log(`  ✓ ${t} — ${count} rows`);
  }
}

main().catch(console.error);
