"use client";

import { useState } from "react";
import { CheckCircle2 } from "lucide-react";

import { cn } from "@/lib/utils";

const TIME_WINDOWS = ["Morning", "Afternoon", "Evening"] as const;

function prettyDate(iso: string): string {
  if (!iso) return "";
  const d = new Date(iso + "T00:00:00");
  return d.toLocaleDateString(undefined, { weekday: "short", month: "short", day: "numeric" });
}

export function ShowingRequestForm({
  token,
  alreadyRequested,
  defaultName = "",
  defaultPhone = "",
}: {
  token: string;
  alreadyRequested: boolean;
  defaultName?: string;
  defaultPhone?: string;
}) {
  const [name, setName] = useState(defaultName);
  const [phone, setPhone] = useState(defaultPhone);
  const [date, setDate] = useState("");
  const [windows, setWindows] = useState<string[]>([]);
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(alreadyRequested);
  const [error, setError] = useState<string | null>(null);

  // Today, local, as YYYY-MM-DD for the date input's min.
  const today = new Date();
  const minDate = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, "0")}-${String(today.getDate()).padStart(2, "0")}`;

  function toggleWindow(w: string) {
    setWindows((prev) => (prev.includes(w) ? prev.filter((x) => x !== w) : [...prev, w]));
  }

  async function submit() {
    if (!name.trim()) {
      setError("Please add your name.");
      return;
    }
    const prefParts: string[] = [];
    if (date) prefParts.push(prettyDate(date));
    if (windows.length) prefParts.push(windows.join(", "));
    const pref = prefParts.length ? `Preferred: ${prefParts.join(" · ")}` : "";
    const composedNote = [pref, note.trim()].filter(Boolean).join(" — ");

    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/public/heat-showing", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token, name, phone, note: composedNote }),
      });
      if (!res.ok) throw new Error((await res.json())?.error ?? "Try again.");
      setDone(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong.");
    } finally {
      setBusy(false);
    }
  }

  if (done) {
    return (
      <div className="rounded-xl border border-[#FF3B30]/30 bg-[#FF3B30]/5 p-5 text-center">
        <CheckCircle2 className="mx-auto h-8 w-8 text-[#FF6A3D]" />
        <p className="mt-2 font-semibold text-white">You&apos;re all set!</p>
        <p className="mt-1 text-sm text-white/70">
          Your agent has been notified and will reach out to confirm your showing.
        </p>
      </div>
    );
  }

  const inputCls =
    "mt-1 w-full rounded-lg border border-white/15 bg-black/20 px-3 py-2 text-sm text-white placeholder:text-white/40 focus:outline-none focus:ring-2 focus:ring-[#FF3B30]/50";

  return (
    <div className="rounded-xl border border-white/10 bg-white/5 p-5">
      <p className="text-base font-semibold text-white">Request a showing</p>
      <p className="mt-0.5 text-sm text-white/60">Pick a day and time that works and your agent will set it up.</p>

      <div className="mt-4 grid grid-cols-2 gap-3">
        <div>
          <label className="block text-xs font-medium text-white/70">Your name</label>
          <input value={name} onChange={(e) => setName(e.target.value)} className={inputCls} placeholder="Jane Buyer" />
        </div>
        <div>
          <label className="block text-xs font-medium text-white/70">Phone</label>
          <input value={phone} onChange={(e) => setPhone(e.target.value)} className={inputCls} placeholder="(615) 555-0123" />
        </div>
      </div>

      <label className="mt-3 block text-xs font-medium text-white/70">Preferred date</label>
      <input type="date" min={minDate} value={date} onChange={(e) => setDate(e.target.value)} className={cn(inputCls, "[color-scheme:dark]")} />

      <label className="mt-3 block text-xs font-medium text-white/70">Time of day</label>
      <div className="mt-1 flex gap-2">
        {TIME_WINDOWS.map((w) => (
          <button
            key={w}
            type="button"
            onClick={() => toggleWindow(w)}
            className={cn(
              "flex-1 rounded-lg border px-3 py-2 text-sm font-medium transition-colors",
              windows.includes(w)
                ? "border-transparent bg-gradient-to-br from-[#FF3B30] to-[#C2410C] text-white"
                : "border-white/15 text-white/70 hover:text-white",
            )}
          >
            {w}
          </button>
        ))}
      </div>

      <label className="mt-3 block text-xs font-medium text-white/70">Anything else? (optional)</label>
      <textarea value={note} onChange={(e) => setNote(e.target.value)} rows={2} className={inputCls} placeholder="e.g. weekends are easiest" />

      {error && <p className="mt-2 text-sm text-red-400">{error}</p>}

      <button
        type="button"
        onClick={submit}
        disabled={busy}
        className="mt-4 w-full rounded-lg bg-gradient-to-br from-[#FF3B30] to-[#C2410C] px-4 py-2.5 text-sm font-semibold text-white transition-opacity hover:opacity-95 disabled:opacity-60"
      >
        {busy ? "Sending…" : "Request a showing"}
      </button>
    </div>
  );
}
