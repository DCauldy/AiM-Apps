"use client";

import { useState } from "react";
import { Loader2, Send } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";

// ============================================================
// Otterly probe sandbox — admin-only surface for exploring the
// Otterly.ai public API shape before we commit to a rebuild.
//
// Pick a method + path + optional body, fire it through the
// /api/apps/radar/probe-otterly route, and inspect the raw response.
// Once we know which endpoints + fields drive the rebuilt Radar
// dashboard, this page + its API route both get deleted.
// ============================================================

type Method = "GET" | "POST" | "PUT" | "DELETE" | "PATCH";

// Real Otterly endpoints (verified at https://docs.otterly.ai/llms.txt).
// `{...}` placeholders need the id from the previous call's response —
// e.g. list workspaces first, plug a workspaceId into the brand-reports
// flow, plug a reportId into the prompts/citations flows, etc.
const COMMON_PATHS: Array<{
  label: string;
  path: string;
  method: Method;
  category: string;
}> = [
  // Reference / account
  { category: "Account", label: "Account + usage", path: "/v1/accounts", method: "GET" },
  { category: "Engines", label: "Engines + countries", path: "/v1/engines", method: "GET" },
  // Workspaces — the top-level container for tracking
  { category: "Workspaces", label: "List workspaces", path: "/v1/workspaces", method: "GET" },
  { category: "Workspaces", label: "Workspace tags", path: "/v1/workspaces/{id}/tags", method: "GET" },
  // Brand reports — the meat (Share of Voice, sentiment, citations all
  // live inside report-scoped statistics endpoints).
  { category: "Brand Reports", label: "List reports", path: "/v1/brand-reports", method: "GET" },
  { category: "Brand Reports", label: "Get report", path: "/v1/brand-reports/{id}", method: "GET" },
  { category: "Brand Reports", label: "Statistics", path: "/v1/brand-reports/{id}/statistics", method: "GET" },
  { category: "Brand Reports", label: "List prompts", path: "/v1/brand-reports/{id}/prompts", method: "GET" },
  { category: "Brand Reports", label: "Get prompt", path: "/v1/brand-reports/{id}/prompts/{promptId}", method: "GET" },
  { category: "Brand Reports", label: "Prompt responses", path: "/v1/brand-reports/{id}/prompts/{promptId}/responses", method: "GET" },
  { category: "Brand Reports", label: "Citations", path: "/v1/brand-reports/{id}/citations", method: "GET" },
  { category: "Brand Reports", label: "Citation stats", path: "/v1/brand-reports/{id}/citations/statistics", method: "GET" },
  { category: "Brand Reports", label: "Recommendations", path: "/v1/brand-reports/{id}/recommendations", method: "GET" },
  // Audits — content + crawlability checks
  { category: "Audits", label: "List content checks", path: "/v1/audits/content-checks", method: "GET" },
  { category: "Audits", label: "Get content check", path: "/v1/audits/content-checks/{id}", method: "GET" },
  { category: "Audits", label: "List crawlability", path: "/v1/audits/crawlability-checks", method: "GET" },
  { category: "Audits", label: "Get crawlability", path: "/v1/audits/crawlability-checks/{id}", method: "GET" },
];

export default function OtterlyProbePage() {
  const [path, setPath] = useState("/v1/accounts");
  const [method, setMethod] = useState<Method>("GET");
  const [body, setBody] = useState("");
  const [loading, setLoading] = useState(false);
  const [response, setResponse] = useState<{
    ok: boolean;
    status: number;
    data?: unknown;
    error?: string;
  } | null>(null);

  const handleProbe = async () => {
    setLoading(true);
    setResponse(null);
    try {
      let parsedBody: unknown = undefined;
      if (body.trim() && method !== "GET" && method !== "DELETE") {
        try {
          parsedBody = JSON.parse(body);
        } catch (e) {
          setResponse({
            ok: false,
            status: 0,
            error: `Body is not valid JSON: ${e instanceof Error ? e.message : ""}`,
          });
          return;
        }
      }

      const res = await fetch("/api/apps/radar/probe-otterly", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ path, method, body: parsedBody }),
      });
      const data = await res.json();
      setResponse({
        ok: res.ok,
        status: res.status,
        data: data.data,
        error: data.error,
      });
    } catch (e) {
      setResponse({
        ok: false,
        status: 0,
        error: e instanceof Error ? e.message : "Request failed",
      });
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="h-full overflow-auto">
      <div className="container max-w-5xl mx-auto px-4 py-6 space-y-6">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">
            Otterly probe sandbox
          </h1>
          <p className="mt-1 text-sm text-muted-foreground max-w-2xl">
            Admin-only. Fires arbitrary calls against your Otterly.ai
            account so we can map the response shapes before rebuilding
            the Radar dashboard on top of their API. Both this page and
            the underlying API route get deleted once the rebuild plan
            is locked.
          </p>
        </div>

        {/* Quick-fill chips, grouped by category. Click one to load
            its path/method into the form. Where the path has {id} /
            {promptId} placeholders, run the list endpoint first to get
            real ids you can plug in. */}
        <div className="space-y-3">
          {Array.from(new Set(COMMON_PATHS.map((p) => p.category))).map(
            (cat) => (
              <div key={cat} className="space-y-1.5">
                <div className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold">
                  {cat}
                </div>
                <div className="flex flex-wrap gap-2">
                  {COMMON_PATHS.filter((p) => p.category === cat).map((p) => (
                    <button
                      key={p.label}
                      type="button"
                      onClick={() => {
                        setPath(p.path);
                        setMethod(p.method);
                      }}
                      className="inline-flex items-center gap-1.5 rounded-md border border-border bg-card px-3 py-1.5 text-xs hover:bg-accent"
                    >
                      <span className="font-mono text-[10px] text-muted-foreground">
                        {p.method}
                      </span>
                      <span className="font-medium">{p.label}</span>
                    </button>
                  ))}
                </div>
              </div>
            ),
          )}
        </div>

        {/* Request form */}
        <div className="rounded-lg border border-border bg-card p-5 space-y-4">
          <div className="grid grid-cols-[120px_1fr] gap-3">
            <div>
              <label className="text-[10px] uppercase tracking-wider text-muted-foreground font-medium block mb-1.5">
                Method
              </label>
              <select
                value={method}
                onChange={(e) => setMethod(e.target.value as Method)}
                className="block w-full rounded-md border border-border bg-background px-3 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-ring"
              >
                {(["GET", "POST", "PUT", "DELETE", "PATCH"] as Method[]).map(
                  (m) => (
                    <option key={m} value={m}>
                      {m}
                    </option>
                  ),
                )}
              </select>
            </div>
            <div>
              <label className="text-[10px] uppercase tracking-wider text-muted-foreground font-medium block mb-1.5">
                Path
              </label>
              <Input
                value={path}
                onChange={(e) => setPath(e.target.value)}
                placeholder="/v1/brands"
                className="font-mono text-sm"
              />
            </div>
          </div>

          {method !== "GET" && method !== "DELETE" && (
            <div>
              <label className="text-[10px] uppercase tracking-wider text-muted-foreground font-medium block mb-1.5">
                Body (JSON)
              </label>
              <Textarea
                value={body}
                onChange={(e) => setBody(e.target.value)}
                placeholder='{"key": "value"}'
                className="font-mono text-xs min-h-[100px]"
              />
            </div>
          )}

          <div className="flex justify-end">
            <Button onClick={handleProbe} disabled={loading || !path.trim()}>
              {loading ? (
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              ) : (
                <Send className="h-4 w-4 mr-2" />
              )}
              {loading ? "Calling Otterly…" : "Send"}
            </Button>
          </div>
        </div>

        {/* Response panel */}
        {response && (
          <div
            className={cn(
              "rounded-lg border bg-card overflow-hidden",
              response.ok
                ? "border-emerald-500/30"
                : "border-rose-500/40",
            )}
          >
            <div
              className={cn(
                "px-5 py-2.5 text-xs font-medium flex items-center gap-3",
                response.ok
                  ? "bg-emerald-500/10 text-emerald-300"
                  : "bg-rose-500/10 text-rose-300",
              )}
            >
              <span className="font-mono">{response.status || "—"}</span>
              <span>{response.ok ? "OK" : "Error"}</span>
              {response.error && (
                <span className="text-rose-300/80 truncate">
                  {response.error}
                </span>
              )}
            </div>
            <pre className="px-5 py-4 overflow-auto text-xs leading-relaxed font-mono max-h-[500px]">
              {JSON.stringify(response.data ?? response.error, null, 2)}
            </pre>
          </div>
        )}
      </div>
    </div>
  );
}
