import type { Metadata } from "next";

import { ShowingRequestForm } from "@/components/heat/ShowingRequestForm";
import { TEMPERATURE_META, type Temperature } from "@/lib/heat/types";
import { createServiceRoleClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

function money(n: unknown): string {
  const v = typeof n === "number" ? n : 0;
  if (!v) return "—";
  return v >= 1000 ? `$${Math.round(v / 1000).toLocaleString()}k` : `$${v}`;
}

/** Branded link unfurl (iMessage / email / social) — listing photo + price. */
export async function generateMetadata({
  params,
}: {
  params: Promise<{ token: string }>;
}): Promise<Metadata> {
  const { token } = await params;
  const service = createServiceRoleClient();
  const { data: share } = await service
    .from("heat_shares")
    .select("listing")
    .eq("token", token)
    .maybeSingle();

  const l = (share?.listing ?? {}) as Record<string, unknown>;
  const address = (l.address as string) || "A listing for you";
  const title = l.price ? `${address} — ${money(l.price)}` : address;
  const stats = [
    l.views != null ? `${Number(l.views).toLocaleString()} views` : null,
    l.saves != null ? `${l.saves} saves` : null,
  ]
    .filter(Boolean)
    .join(" · ");
  const description = stats
    ? `Getting attention — ${stats}. Tap to request a showing.`
    : "Tap to request a showing.";
  // og:image is provided by the sibling opengraph-image.tsx (branded overlay).
  return {
    title,
    description,
    openGraph: { title, description, siteName: "Heat by AiM", type: "website" },
    twitter: { card: "summary_large_image", title, description },
  };
}

export default async function ShowingPage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;
  const service = createServiceRoleClient();
  const { data: share } = await service
    .from("heat_shares")
    .select("token, listing, status, contact_name, contact_phone")
    .eq("token", token)
    .maybeSingle();

  if (!share) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-neutral-950 text-white/70">
        <p>This listing link is no longer available.</p>
      </div>
    );
  }

  const l = (share.listing ?? {}) as Record<string, unknown>;
  const temp = l.temperature as Temperature | undefined;
  const tempMeta = temp ? TEMPERATURE_META[temp] : null;
  const img = (l.imgSrc as string) || null;
  const specs = [
    l.beds && `${l.beds} bd`,
    l.baths && `${l.baths} ba`,
    l.livingArea && `${(l.livingArea as number).toLocaleString()} sqft`,
  ]
    .filter(Boolean)
    .join(" · ");

  return (
    <div className="min-h-screen bg-neutral-950 px-4 py-8 text-white">
      <div className="mx-auto max-w-lg">
        <div className="overflow-hidden rounded-2xl border border-white/10 bg-white/5">
          <div className="relative aspect-[4/3] w-full bg-black/40">
            {img ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={img} alt={(l.address as string) ?? "Listing"} className="h-full w-full object-cover" />
            ) : (
              <div className="flex h-full items-center justify-center text-white/30">No photo</div>
            )}
            {tempMeta && (
              <span className="absolute left-3 top-3 rounded-full bg-gradient-to-br from-[#FF3B30] to-[#C2410C] px-3 py-1 text-sm font-bold">
                {tempMeta.emoji} {tempMeta.label}
              </span>
            )}
          </div>

          <div className="p-5">
            <div className="flex items-baseline justify-between gap-2">
              <span className="text-2xl font-semibold">{money(l.price)}</span>
              <span className="text-sm text-white/60">{specs}</span>
            </div>
            <p className="mt-1 text-white/85">{(l.address as string) ?? ""}</p>

            {(l.views != null || l.saves != null) && (
              <p className="mt-3 text-sm text-white/60">
                🔥 This home is getting attention — {Number(l.views ?? 0).toLocaleString()} views
                {l.saves != null ? ` and ${l.saves} saves` : ""} on the market right now.
              </p>
            )}
          </div>
        </div>

        <div className="mt-4">
          <ShowingRequestForm
            token={token}
            alreadyRequested={share.status === "showing_requested"}
            defaultName={(share.contact_name as string) ?? ""}
            defaultPhone={(share.contact_phone as string) ?? ""}
          />
        </div>

        <p className="mt-4 text-center text-xs text-white/30">Powered by Heat · AiM</p>
      </div>
    </div>
  );
}
