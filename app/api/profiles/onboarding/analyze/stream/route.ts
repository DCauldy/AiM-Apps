import { runs } from "@trigger.dev/sdk/v3";
import { createClient } from "@/lib/supabase/server";
import type { analyzeProfileTask } from "@/triggers/profile-analyze";
import { NextRequest } from "next/server";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
// Stays open for the lifetime of the analysis run.
export const maxDuration = 180;

const TERMINAL_FAIL = new Set([
  "FAILED",
  "CANCELED",
  "CRASHED",
  "SYSTEM_FAILURE",
  "TIMED_OUT",
  "EXPIRED",
  "INTERRUPTED",
]);

/**
 * GET /api/profiles/onboarding/analyze/stream?runId=…
 *
 * Server-Sent Events bridge over a Trigger.dev run. Subscribes to the
 * analysis task and forwards genuine progress (step + percent) plus the
 * final draft, so the client renders a real loading experience.
 */
export async function GET(req: NextRequest) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return new Response("Unauthorized", { status: 401 });

  const runId = req.nextUrl.searchParams.get("runId");
  if (!runId) return new Response("Missing runId", { status: 400 });

  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    async start(controller) {
      let closed = false;
      const send = (obj: unknown) => {
        if (closed) return;
        controller.enqueue(encoder.encode(`data: ${JSON.stringify(obj)}\n\n`));
      };
      const close = () => {
        if (closed) return;
        closed = true;
        try {
          controller.close();
        } catch {
          /* already closed */
        }
      };

      // Drop the connection if the client navigates away.
      req.signal.addEventListener("abort", close);

      send({ type: "progress", progress: 4, step: "Starting…" });

      try {
        for await (const run of runs.subscribeToRun<typeof analyzeProfileTask>(runId)) {
          const meta = (run.metadata ?? {}) as {
            userId?: string;
            step?: string;
            progress?: number;
          };

          // Ownership guard — only the run's owner may read its stream.
          if (meta.userId && meta.userId !== user.id) {
            send({ type: "error", message: "Not allowed." });
            break;
          }

          if (typeof meta.progress === "number") {
            send({ type: "progress", progress: meta.progress, step: meta.step });
          }

          if (run.status === "COMPLETED") {
            const out = run.output;
            if (out && out.ok && out.draft) {
              send({
                type: "done",
                draft: out.draft,
                found: out.found ?? [],
                lowConfidence: out.lowConfidence ?? [],
              });
            } else {
              send({
                type: "error",
                message: out?.error ?? "We couldn't finish analyzing your site.",
              });
            }
            break;
          }

          if (TERMINAL_FAIL.has(run.status)) {
            send({
              type: "error",
              message: "Something went sideways analyzing your site. Try again.",
            });
            break;
          }
        }
      } catch {
        send({ type: "error", message: "Lost the connection to the analyzer." });
      }
      close();
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache, no-store, no-transform",
      Connection: "keep-alive",
      "X-Accel-Buffering": "no",
    },
  });
}
