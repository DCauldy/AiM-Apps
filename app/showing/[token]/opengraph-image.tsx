import { ImageResponse } from "next/og";

import { TEMPERATURE_META, type Temperature } from "@/lib/heat/types";
import { createServiceRoleClient } from "@/lib/supabase/server";

// Branded link unfurl: the listing photo with the Heat temperature badge
// overlaid, plus price / address / demand. Rendered by Satori (next/og).
export const runtime = "nodejs";
export const alt = "Hot listing";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

function money(n: unknown): string {
  const v = typeof n === "number" ? n : 0;
  if (!v) return "";
  return v >= 1000 ? `$${Math.round(v / 1000).toLocaleString()}k` : `$${v}`;
}

export default async function OgImage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const service = createServiceRoleClient();
  const { data: share } = await service
    .from("heat_shares")
    .select("listing, user_id")
    .eq("token", token)
    .maybeSingle();

  const l = (share?.listing ?? {}) as Record<string, unknown>;

  // Agent identity for the card footer.
  let agentName: string | null = null;
  let brokerage: string | null = null;
  let headshot: string | null = null;
  if (share?.user_id) {
    const [sender, branding] = await Promise.all([
      service
        .from("platform_sender_profiles")
        .select("full_name, brokerage")
        .eq("user_id", share.user_id)
        .order("is_default", { ascending: false })
        .limit(1)
        .maybeSingle(),
      service
        .from("platform_branding_profiles")
        .select("headshot_url")
        .eq("user_id", share.user_id)
        .order("is_default", { ascending: false })
        .limit(1)
        .maybeSingle(),
    ]);
    agentName = (sender.data?.full_name as string) ?? null;
    brokerage = (sender.data?.brokerage as string) ?? null;
    headshot = (branding.data?.headshot_url as string) ?? null;
  }
  const address = (l.address as string) || "A listing for you";
  const price = money(l.price);
  const img = (l.imgSrc as string) || null;
  const meta = l.temperature ? TEMPERATURE_META[l.temperature as Temperature] : null;
  const stats = [
    l.views != null ? `${Number(l.views).toLocaleString()} views` : null,
    l.saves != null ? `${l.saves} saves` : null,
  ]
    .filter(Boolean)
    .join("   ·   ");

  return new ImageResponse(
    (
      <div
        style={{
          display: "flex",
          width: "100%",
          height: "100%",
          position: "relative",
          backgroundColor: "#0a0a0a",
          fontFamily: "sans-serif",
        }}
      >
        {img ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={img}
            width={1200}
            height={630}
            style={{ position: "absolute", top: 0, left: 0, width: "100%", height: "100%", objectFit: "cover" }}
          />
        ) : null}

        {/* darkening scrim for legibility */}
        <div
          style={{
            position: "absolute",
            top: 0,
            left: 0,
            width: "100%",
            height: "100%",
            display: "flex",
            backgroundImage:
              "linear-gradient(180deg, rgba(0,0,0,0.10) 40%, rgba(0,0,0,0.88) 100%)",
          }}
        />

        {/* temperature badge */}
        {meta ? (
          <div
            style={{
              position: "absolute",
              top: 44,
              left: 44,
              display: "flex",
              alignItems: "center",
              gap: 16,
              padding: "16px 30px",
              borderRadius: 999,
              backgroundImage: "linear-gradient(135deg, #FF3B30, #C2410C)",
              color: "#ffffff",
              fontSize: 44,
              fontWeight: 700,
            }}
          >
            <span style={{ fontSize: 48 }}>{meta.emoji}</span>
            <span>{meta.label}</span>
          </div>
        ) : null}

        {/* brand */}
        <div
          style={{
            position: "absolute",
            top: 52,
            right: 48,
            display: "flex",
            alignItems: "center",
            gap: 10,
            color: "#ffffff",
            fontSize: 34,
            fontWeight: 700,
          }}
        >
          <span>🔥</span>
          <span>Heat</span>
        </div>

        {/* bottom info: listing (left) + agent (right) */}
        <div
          style={{
            position: "absolute",
            left: 48,
            right: 48,
            bottom: 44,
            display: "flex",
            justifyContent: "space-between",
            alignItems: "flex-end",
            color: "#ffffff",
          }}
        >
          <div style={{ display: "flex", flexDirection: "column", maxWidth: 720 }}>
            {price ? <div style={{ fontSize: 84, fontWeight: 800, lineHeight: 1.05 }}>{price}</div> : null}
            <div style={{ fontSize: 40, fontWeight: 600, marginTop: 12, opacity: 0.96 }}>{address}</div>
            {stats ? <div style={{ fontSize: 30, marginTop: 14, opacity: 0.82 }}>{stats}</div> : null}
          </div>

          {agentName || headshot ? (
            <div style={{ display: "flex", alignItems: "center", gap: 18 }}>
              {headshot ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={headshot}
                  width={104}
                  height={104}
                  style={{
                    width: 104,
                    height: 104,
                    borderRadius: 999,
                    objectFit: "cover",
                    border: "3px solid rgba(255,255,255,0.9)",
                  }}
                />
              ) : null}
              {agentName ? (
                <div style={{ display: "flex", flexDirection: "column", maxWidth: 300 }}>
                  <span style={{ fontSize: 32, fontWeight: 700 }}>{agentName}</span>
                  {brokerage ? (
                    <span style={{ fontSize: 24, opacity: 0.8, marginTop: 4 }}>{brokerage}</span>
                  ) : null}
                </div>
              ) : null}
            </div>
          ) : null}
        </div>
      </div>
    ),
    { ...size, emoji: "twemoji" },
  );
}
