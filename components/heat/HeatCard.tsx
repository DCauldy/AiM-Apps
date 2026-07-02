"use client";

import { Eye, Flame, Heart, Snowflake, TrendingUp } from "lucide-react";
import type { LucideIcon } from "lucide-react";

import { TEMPERATURE_META, type Temperature } from "@/lib/heat/types";
import { cn } from "@/lib/utils";

export interface HeatResult {
  rank: number;
  heatScore: number;
  temperature: string | null;
  badges: string[];
  zpid: string;
  address: string | null;
  price: number | null;
  beds: number | null;
  baths: number | null;
  livingArea: number | null;
  daysOnMarket: number | null;
  imgSrc: string | null;
  detailUrl: string | null;
  views: number | null;
  saves: number | null;
}

const BADGE_META: Record<string, { label: string; Icon: LucideIcon }> = {
  "deal-watch": { label: "Deal Watch", Icon: Eye },
  "fresh-hot": { label: "Fresh & Hot", Icon: Flame },
  cooling: { label: "Cooling", Icon: Snowflake },
  surging: { label: "Surging", Icon: TrendingUp },
};

/** Temperature ramp — hot reds → icy blues. */
const TEMP_STYLE: Record<Temperature, string> = {
  "super-hot": "bg-gradient-to-br from-[#FF3B30] to-[#C2410C] text-white",
  hot: "bg-[#EA580C] text-white",
  cool: "bg-[#D97706] text-white",
  cold: "bg-[#2563EB] text-white",
  "ice-cold": "bg-[#0EA5E9] text-white",
};

function money(n: number | null): string {
  if (!n) return "—";
  return n >= 1000 ? `$${Math.round(n / 1000)}k` : `$${n}`;
}

export function HeatCard({
  r,
  onOpen,
}: {
  r: HeatResult;
  onOpen: (r: HeatResult) => void;
}) {
  return (
    <button
      type="button"
      onClick={() => onOpen(r)}
      className="glass-card group relative flex flex-col overflow-hidden rounded-2xl text-left ring-1 ring-white/10 transition-transform hover:-translate-y-0.5 focus:outline-none focus:ring-2 focus:ring-[#FF3B30]/50"
    >
      <div className="relative aspect-[4/3] w-full overflow-hidden bg-black/30">
        {r.imgSrc ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={r.imgSrc}
            alt={r.address ?? "Listing"}
            className="h-full w-full object-cover transition-transform group-hover:scale-[1.03]"
          />
        ) : (
          <div className="flex h-full items-center justify-center text-white/30">
            No photo
          </div>
        )}

        {/* Rank + Heat Score */}
        <div className="absolute left-2 top-2 flex items-center gap-1.5">
          <span className="rounded-full bg-black/60 px-2 py-0.5 text-xs font-semibold text-white">
            #{r.rank}
          </span>
          {r.temperature && TEMPERATURE_META[r.temperature as Temperature] ? (
            <span
              className={cn(
                "flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-bold",
                TEMP_STYLE[r.temperature as Temperature],
              )}
            >
              <span>{TEMPERATURE_META[r.temperature as Temperature].emoji}</span>
              {TEMPERATURE_META[r.temperature as Temperature].label} · {r.heatScore}°
            </span>
          ) : (
            <span className="flex items-center gap-1 rounded-full bg-[#EA580C] px-2 py-0.5 text-xs font-bold text-white">
              <Flame className="h-3 w-3" />
              {r.heatScore}°
            </span>
          )}
        </div>

        {r.badges.length > 0 && (
          <div className="absolute bottom-2 left-2 flex flex-wrap gap-1">
            {r.badges.map((b) => {
              const meta = BADGE_META[b];
              if (!meta) return null;
              const { label, Icon } = meta;
              return (
                <span
                  key={b}
                  className="flex items-center gap-1 rounded-full bg-black/70 px-2 py-0.5 text-[10px] font-medium text-white"
                >
                  <Icon className="h-3 w-3" />
                  {label}
                </span>
              );
            })}
          </div>
        )}
      </div>

      <div className="flex flex-1 flex-col p-3">
        <div className="flex items-baseline justify-between gap-2">
          <span className="text-base font-semibold text-white">{money(r.price)}</span>
          <span className="text-xs text-white/60">
            {[
              r.beds && `${r.beds} bd`,
              r.baths && `${r.baths} ba`,
              r.livingArea && `${r.livingArea.toLocaleString()} sqft`,
            ]
              .filter(Boolean)
              .join(" · ")}
          </span>
        </div>
        <p className="mt-0.5 truncate text-sm text-white/80">{r.address ?? "—"}</p>

        <div className="mt-2 flex items-center gap-3 text-xs text-white/60">
          <span className="flex items-center gap-1">
            <Eye className="h-3.5 w-3.5" /> {r.views?.toLocaleString() ?? "—"}
          </span>
          <span className="flex items-center gap-1">
            <Heart className="h-3.5 w-3.5" /> {r.saves?.toLocaleString() ?? "—"}
          </span>
          {r.daysOnMarket != null && <span>· {r.daysOnMarket}d on market</span>}
        </div>
      </div>
    </button>
  );
}
