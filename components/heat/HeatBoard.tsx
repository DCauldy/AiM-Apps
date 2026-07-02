"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";

import { HeatCard, type HeatResult } from "@/components/heat/HeatCard";
import { HeatListingModal } from "@/components/heat/HeatListingModal";
import type { MarketBaseline } from "@/lib/heat/types";

interface SearchMeta {
  zips: string[];
  min_price: number | null;
  max_price: number | null;
  audience: "buyer" | "listing";
  status: "running" | "ready" | "error";
  error: string | null;
  baseline: MarketBaseline | null;
}

const POLL_MS = 2500;

export function HeatBoard({ searchId }: { searchId: string }) {
  const [meta, setMeta] = useState<SearchMeta | null>(null);
  const [results, setResults] = useState<HeatResult[]>([]);
  const [failed, setFailed] = useState<string | null>(null);
  const [selected, setSelected] = useState<HeatResult | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const poll = useCallback(async () => {
    try {
      const res = await fetch(`/api/apps/heat/searches/${searchId}`, {
        cache: "no-store",
      });
      if (!res.ok) throw new Error("Lookup failed");
      const data = await res.json();
      setMeta(data.search);
      setResults(data.results ?? []);
      if (data.search?.status === "running") {
        timer.current = setTimeout(poll, POLL_MS);
      } else if (data.search?.status === "error") {
        setFailed(data.search.error ?? "Enrichment failed.");
      }
    } catch {
      timer.current = setTimeout(poll, POLL_MS);
    }
  }, [searchId]);

  useEffect(() => {
    poll();
    return () => {
      if (timer.current) clearTimeout(timer.current);
    };
  }, [poll]);

  const running = meta?.status === "running" || (!meta && !failed);

  return (
    <div className="mx-auto max-w-6xl px-4 py-6">
      <div className="mb-5 flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold">
            🔥 Hottest in {meta?.zips?.join(", ") ?? "…"}
          </h1>
          <p className="text-sm text-muted-foreground">
            {meta?.min_price || meta?.max_price
              ? `$${((meta?.min_price ?? 0) / 1000).toFixed(0)}k–$${((meta?.max_price ?? 0) / 1000).toFixed(0)}k · `
              : ""}
            Ranked by buyer demand
            {meta?.audience ? ` · ${meta.audience === "buyer" ? "Buyer view" : "Listing view"}` : ""}
          </p>

          {meta?.baseline && meta.baseline.n > 0 && (
            <div className="mt-2 flex flex-wrap items-center gap-2 text-[11px]">
              <span className="rounded-full bg-white/10 px-2 py-0.5 font-medium text-white/70">
                Baseline · {meta.baseline.n} sold in 90d
              </span>
              {meta.baseline.medianDom != null && (
                <span className="rounded-full border border-white/10 px-2 py-0.5 text-white/55">
                  ~{Math.round(meta.baseline.medianDom)}d typical DOM
                </span>
              )}
              {meta.baseline.medianListToSp != null && (
                <span className="rounded-full border border-white/10 px-2 py-0.5 text-white/55">
                  {Math.round(meta.baseline.medianListToSp * 100)}% list-to-sale
                </span>
              )}
              {meta.baseline.pctWithCuts != null && (
                <span className="rounded-full border border-white/10 px-2 py-0.5 text-white/55">
                  {Math.round(meta.baseline.pctWithCuts * 100)}% cut price
                </span>
              )}
            </div>
          )}
        </div>
        <Link
          href="/apps/heat"
          className="rounded-lg border border-white/15 px-3 py-1.5 text-sm text-white/80 hover:bg-white/5"
        >
          New search
        </Link>
      </div>

      {failed && (
        <div className="rounded-xl border border-red-500/30 bg-red-500/5 p-4 text-sm text-red-300">
          {failed}
        </div>
      )}

      {running && results.length === 0 && (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {Array.from({ length: 6 }).map((_, i) => (
            <div
              key={i}
              className="glass-card h-72 animate-pulse rounded-2xl ring-1 ring-white/10"
            />
          ))}
        </div>
      )}

      {results.length > 0 && (
        <>
          {running && (
            <p className="mb-3 text-xs text-white/50">
              Reading live demand — ranking updates as listings come in…
            </p>
          )}
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {results.map((r) => (
              <HeatCard key={r.zpid} r={r} onOpen={setSelected} />
            ))}
          </div>
        </>
      )}

      {selected && (
        <HeatListingModal
          result={selected}
          audience={meta?.audience ?? "buyer"}
          baseline={meta?.baseline ?? null}
          onClose={() => setSelected(null)}
        />
      )}

      {!running && !failed && results.length === 0 && (
        <div className="rounded-xl border border-white/10 p-8 text-center text-sm text-white/60">
          No listings found for that area and price range. Try widening the band.
        </div>
      )}
    </div>
  );
}
