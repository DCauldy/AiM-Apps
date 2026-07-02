"use client";

import { useEffect, useState } from "react";
import { Eye, Heart, GraduationCap, Phone, ExternalLink, Share2 } from "lucide-react";

import type { HeatResult } from "@/components/heat/HeatCard";
import { HeatShareModal } from "@/components/heat/HeatShareModal";
import {
  Dialog,
  DialogBody,
  DialogClose,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { TEMPERATURE_META, type MarketBaseline, type Temperature } from "@/lib/heat/types";

type Audience = "buyer" | "listing";

interface RichDetail {
  description: string | null;
  homeType: string | null;
  yearBuilt: number | null;
  lotSize: string | null;
  hoa: string | null;
  heating: string | null;
  cooling: string | null;
  parking: string | null;
  appliances: string[];
  zestimate: number | null;
  rentZestimate: number | null;
  taxAssessedValue: number | null;
  agent: { name: string | null; phone: string | null; broker: string | null };
  schools: { name: string; rating: number | null; level: string; distance: number | null }[];
  priceHistory: { date: string; price: number | null; event: string; ppsf: number | null }[];
}

function money(n: number | null | undefined): string {
  if (!n) return "—";
  return n >= 1000 ? `$${Math.round(n / 1000).toLocaleString()}k` : `$${n}`;
}

/** Rule-based talking points, framed by audience. (AI blurbs land in a later phase.) */
function insights(r: HeatResult, audience: Audience): string[] {
  const ratio = r.views ? (r.saves ?? 0) / r.views : 0;
  const pct = (ratio * 100).toFixed(1);
  const dom = r.daysOnMarket ?? 0;
  const cooling = r.badges.includes("cooling");
  const fresh = r.badges.includes("fresh-hot");
  const deal = r.badges.includes("deal-watch");
  const out: string[] = [];

  if (audience === "buyer") {
    out.push(`${r.views?.toLocaleString() ?? "—"} views and ${r.saves ?? 0} saves — a ${pct}% save rate. Buyers are actively watching this one.`);
    if (fresh) out.push("🆕 Just hit the market and already hot — expect competition. Get your buyer in quickly.");
    if (cooling) out.push(`❄️ Strong interest but ${dom} days on market with a price cut — there's likely room to negotiate.`);
    if (deal) out.push("👀 Getting outsized attention for its price — a value play worth showing.");
    if (!fresh && !cooling && dom > 0) out.push(`On market ${dom} days — ${dom < 21 ? "still fresh" : "seasoned, gauge motivation"}.`);
  } else {
    out.push(`Save rate of ${pct}% (typical is ~2–4%) — ${ratio >= 0.045 ? "strong" : ratio >= 0.03 ? "solid" : "modest"} buyer intent for this price band.`);
    if (cooling) out.push(`Attention isn't converting after ${dom} days + a price cut — likely priced above the market. Evidence for a reduction conversation.`);
    if (fresh) out.push("High early momentum — a strong comp to cite when pricing a new listing in this area.");
    if (deal) out.push("Outsized demand for the price point — proof buyers are active in this segment.");
    out.push(`Use this listing's ${r.views?.toLocaleString() ?? "—"} views as evidence of live buyer demand in your listing presentations.`);
  }
  return out;
}

export function HeatListingModal({
  result,
  audience,
  baseline,
  onClose,
}: {
  result: HeatResult;
  audience: Audience;
  baseline: MarketBaseline | null;
  onClose: () => void;
}) {
  const [detail, setDetail] = useState<RichDetail | null>(null);
  const [images, setImages] = useState<string[]>([]);
  const [active, setActive] = useState(0);
  const [loading, setLoading] = useState(true);
  const [sharing, setSharing] = useState(false);

  useEffect(() => {
    let alive = true;
    setLoading(true);
    fetch(`/api/apps/heat/listings/${result.zpid}`, { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => {
        if (!alive || !data) return;
        setDetail(data.detail ?? null);
        setImages(data.images ?? []);
      })
      .finally(() => alive && setLoading(false));
    return () => {
      alive = false;
    };
  }, [result.zpid]);

  const zillow = result.detailUrl
    ? `https://www.zillow.com${result.detailUrl}`
    : undefined;
  const ratioPct = result.views ? (((result.saves ?? 0) / result.views) * 100).toFixed(1) : "—";
  const hero = images[active] ?? result.imgSrc ?? null;

  if (sharing) {
    return (
      <HeatShareModal result={result} audience={audience} onClose={() => setSharing(false)} />
    );
  }

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-4xl">
        <DialogHeader>
          <DialogTitle>{result.address ?? "Listing detail"}</DialogTitle>
          <DialogClose onClose={onClose} />
        </DialogHeader>

        <DialogBody className="max-h-[75vh] overflow-y-auto">
          {/* Gallery */}
          <div className="overflow-hidden rounded-xl bg-black/30">
            {hero ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={hero} alt={result.address ?? "Listing"} className="max-h-[360px] w-full object-cover" />
            ) : (
              <div className="flex h-52 items-center justify-center text-white/30">No photo</div>
            )}
          </div>
          {images.length > 1 && (
            <div className="mt-2 flex gap-2 overflow-x-auto pb-1">
              {images.slice(0, 14).map((src, i) => (
                <button
                  key={src}
                  type="button"
                  onClick={() => setActive(i)}
                  className={`h-14 w-20 shrink-0 overflow-hidden rounded-md ring-2 ${i === active ? "ring-[#FF3B30]" : "ring-transparent"}`}
                >
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={src} alt="" className="h-full w-full object-cover" />
                </button>
              ))}
            </div>
          )}

          {/* Price + heat + demand */}
          <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-3">
              <span className="text-2xl font-semibold">{money(result.price)}</span>
              <span className="flex items-center gap-1.5 rounded-full bg-gradient-to-br from-[#FF3B30] to-[#C2410C] px-2.5 py-1 text-sm font-bold text-white">
                {result.temperature && TEMPERATURE_META[result.temperature as Temperature] ? (
                  <>
                    <span>{TEMPERATURE_META[result.temperature as Temperature].emoji}</span>
                    {TEMPERATURE_META[result.temperature as Temperature].label} · {result.heatScore}° · #{result.rank}
                  </>
                ) : (
                  <>{result.heatScore}° · #{result.rank}</>
                )}
              </span>
            </div>
            <div className="flex items-center gap-4 text-sm text-muted-foreground">
              <span className="flex items-center gap-1"><Eye className="h-4 w-4" /> {result.views?.toLocaleString() ?? "—"}</span>
              <span className="flex items-center gap-1"><Heart className="h-4 w-4" /> {result.saves ?? "—"} ({ratioPct}%)</span>
              {result.daysOnMarket != null && <span>{result.daysOnMarket}d on market</span>}
            </div>
          </div>
          <p className="mt-1 text-sm text-muted-foreground">
            {[result.beds && `${result.beds} bd`, result.baths && `${result.baths} ba`, result.livingArea && `${result.livingArea.toLocaleString()} sqft`].filter(Boolean).join(" · ")}
          </p>

          <button
            type="button"
            onClick={() => setSharing(true)}
            className="mt-3 inline-flex w-full items-center justify-center gap-2 rounded-lg bg-gradient-to-br from-[#FF3B30] to-[#C2410C] px-4 py-2.5 text-sm font-semibold text-white transition-opacity hover:opacity-95"
          >
            <Share2 className="h-4 w-4" /> Share with a client
          </button>

          {/* Audience-framed insight */}
          <div className="mt-4 rounded-xl border border-[#FF3B30]/30 bg-[#FF3B30]/5 p-4">
            <p className="text-xs font-semibold uppercase tracking-wide text-[#FF6A3D]">
              {audience === "buyer" ? "For your buyer" : "Listing intel"}
            </p>
            <ul className="mt-2 space-y-1.5 text-sm text-foreground/90">
              {insights(result, audience).map((line, i) => (
                <li key={i} className="flex gap-2">
                  <span className="text-[#FF6A3D]">›</span>
                  <span>{line}</span>
                </li>
              ))}
            </ul>
          </div>

          {/* vs. the sold baseline */}
          {baseline && baseline.n > 0 && (
            <div className="mt-4 rounded-xl border border-border bg-background/40 p-4">
              <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                vs. recent sales · {baseline.n} sold in 90 days
              </p>
              <div className="mt-2 grid grid-cols-2 gap-x-6 gap-y-2 text-sm sm:grid-cols-3">
                {baseline.medianDom != null && result.daysOnMarket != null && (
                  <div>
                    <p className="text-xs text-muted-foreground">Days on market</p>
                    <p className="font-medium">
                      {result.daysOnMarket}d{" "}
                      <span className={result.daysOnMarket <= baseline.medianDom ? "text-[#FF6A3D]" : "text-[#0EA5E9]"}>
                        ({result.daysOnMarket <= baseline.medianDom ? "faster" : "slower"} than ~{Math.round(baseline.medianDom)}d)
                      </span>
                    </p>
                  </div>
                )}
                {baseline.medianViewsPerDay != null && result.views != null && result.daysOnMarket != null && (
                  <div>
                    <p className="text-xs text-muted-foreground">Views / day</p>
                    <p className="font-medium">
                      {Math.round(result.views / Math.max(result.daysOnMarket, 1))}{" "}
                      <span className="text-muted-foreground">vs ~{Math.round(baseline.medianViewsPerDay)} typical</span>
                    </p>
                  </div>
                )}
                {baseline.medianListToSp != null && (
                  <div>
                    <p className="text-xs text-muted-foreground">Homes here sell at</p>
                    <p className="font-medium">{Math.round(baseline.medianListToSp * 100)}% of list</p>
                  </div>
                )}
              </div>
            </div>
          )}

          {loading && <p className="mt-4 text-sm text-muted-foreground">Loading full details…</p>}

          {detail && (
            <>
              {/* Facts grid */}
              <div className="mt-4 grid grid-cols-2 gap-x-6 gap-y-2 text-sm sm:grid-cols-3">
                {[
                  ["Type", detail.homeType],
                  ["Year built", detail.yearBuilt?.toString()],
                  ["Lot", detail.lotSize],
                  ["HOA", detail.hoa],
                  ["Heating", detail.heating],
                  ["Cooling", detail.cooling],
                  ["Parking", detail.parking],
                  ["Zestimate", detail.zestimate ? money(detail.zestimate) : null],
                  ["Tax assessed", detail.taxAssessedValue ? money(detail.taxAssessedValue) : null],
                ]
                  .filter(([, v]) => v)
                  .map(([label, v]) => (
                    <div key={label as string}>
                      <p className="text-xs text-muted-foreground">{label}</p>
                      <p className="font-medium">{v}</p>
                    </div>
                  ))}
              </div>

              {detail.description && (
                <p className="mt-4 whitespace-pre-line text-sm text-foreground/85">
                  {detail.description}
                </p>
              )}

              {/* Price history */}
              {detail.priceHistory.length > 0 && (
                <div className="mt-4">
                  <p className="text-sm font-semibold">Price history</p>
                  <div className="mt-1.5 space-y-1 text-sm">
                    {detail.priceHistory.slice(0, 6).map((e, i) => (
                      <div key={i} className="flex justify-between text-muted-foreground">
                        <span>{e.date} · {e.event}</span>
                        <span className="font-medium text-foreground">{money(e.price)}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Schools */}
              {detail.schools.length > 0 && (
                <div className="mt-4">
                  <p className="flex items-center gap-1.5 text-sm font-semibold">
                    <GraduationCap className="h-4 w-4" /> Schools
                  </p>
                  <div className="mt-1.5 space-y-1 text-sm">
                    {detail.schools.map((s) => (
                      <div key={s.name} className="flex justify-between text-muted-foreground">
                        <span>{s.name} <span className="text-xs">({s.level})</span></span>
                        <span className="font-medium text-foreground">
                          {s.rating != null ? `${s.rating}/10` : "—"}{s.distance != null ? ` · ${s.distance}mi` : ""}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Agent + Zillow */}
              <div className="mt-4 flex flex-wrap items-center justify-between gap-3 border-t border-border pt-4 text-sm">
                {detail.agent.name ? (
                  <div className="flex items-center gap-2 text-muted-foreground">
                    <Phone className="h-4 w-4" />
                    <span className="text-foreground">{detail.agent.name}</span>
                    {detail.agent.phone && <span>· {detail.agent.phone}</span>}
                    {detail.agent.broker && <span>· {detail.agent.broker}</span>}
                  </div>
                ) : (
                  <span />
                )}
                {zillow && (
                  <a
                    href={zillow}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1 text-[#FF6A3D] hover:underline"
                  >
                    View on Zillow <ExternalLink className="h-3.5 w-3.5" />
                  </a>
                )}
              </div>
            </>
          )}
        </DialogBody>
      </DialogContent>
    </Dialog>
  );
}
