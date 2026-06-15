/**
 * Send a test of any Radar transactional email.
 *
 * Usage:
 *   npx tsx scripts/send-test-radar-ready-email.ts [variant] [to-email]
 *
 * Variants: ready (default), admin-new-request, alert-rank-drop,
 *           alert-competitor-pass, digest
 * Default recipient: derek@jasonpantana.com
 */

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

// Stub the "server-only" sentinel so we can import the email module from
// a plain Node script. The package's only purpose is to throw at bundle
// time for client components — irrelevant in a one-off CLI.
import { createRequire } from "module";
const req = createRequire(import.meta.url);
const Module = req("module") as typeof import("module");
const origResolve = (Module as unknown as { _resolveFilename: Function })._resolveFilename;
(Module as unknown as { _resolveFilename: Function })._resolveFilename = function (
  request: string,
  ...rest: unknown[]
) {
  if (request === "server-only") {
    return origResolve.call(this, "path", ...rest);
  }
  return origResolve.call(this, request, ...rest);
};

async function main() {
  const variant = process.argv[2] ?? "ready";
  const to = process.argv[3] ?? "derek@jasonpantana.com";

  const {
    sendCustomerRadarReadyEmail,
    sendAdminNewRequestEmail,
    sendRadarAlertEmail,
    sendRadarDigestEmail,
  } = await import("../lib/radar-otterly/email");

  if (variant === "admin-new-request") {
    // ADMIN_EMAIL defaults to derek@jasonpantana.com; override at runtime
    // so the test can be redirected to any inbox via the CLI arg.
    process.env.RADAR_ADMIN_EMAIL = to;
    await sendAdminNewRequestEmail({
      requestId: "req_test_01KV3TAXAGTYF7PJ9301JNTGMG",
      hostname: "caldwellrg.com",
      requesterEmail: "derek@caldwellrg.com",
      requesterName: "Derek Caldwell",
    });
    console.log(`Sent admin-new-request test email to ${to}`);
    return;
  }

  if (variant === "alert-rank-drop") {
    await sendRadarAlertEmail({
      toEmail: to,
      toName: "Derek",
      hostname: "caldwellrg.com",
      reason: { type: "rank_drop", fromRank: 3, toRank: 7 },
    });
    console.log(`Sent rank-drop alert test email to ${to}`);
    return;
  }

  if (variant === "alert-competitor-pass") {
    await sendRadarAlertEmail({
      toEmail: to,
      toName: "Derek",
      hostname: "caldwellrg.com",
      reason: { type: "competitor_pass", competitorBrand: "Zillow Premier" },
    });
    console.log(`Sent competitor-pass alert test email to ${to}`);
    return;
  }

  if (variant === "digest") {
    await sendRadarDigestEmail({
      toEmail: to,
      toName: "Derek",
      hostname: "caldwellrg.com",
      stats: {
        brandRank: 4,
        mentionRate: 62,
        totalMentions: 1284,
        citationRate: 38,
        topWin: "best real estate agents in northern kentucky",
        topGap: "luxury homes for sale fort thomas ky",
        topCompetitor: "Coldwell Banker West Shell",
      },
    });
    console.log(`Sent weekly digest test email to ${to}`);
    return;
  }

  await sendCustomerRadarReadyEmail({
    toEmail: to,
    toName: "Derek",
    hostname: "caldwellrg.com",
  });
  console.log(`Sent Radar-ready test email to ${to}`);
}

main().catch((err) => {
  console.error("Failed:", err);
  process.exit(1);
});
