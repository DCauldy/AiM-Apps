import { runs } from "@trigger.dev/sdk/v3";
import { createClient } from "@/lib/supabase/server";
import type { hlSphereRefreshTask } from "@/triggers/hyperlocal-sphere";
import { NextRequest } from "next/server";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
// Stays open for the lifetime of the refresh run.
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
 * GET /api/apps/hyperlocal/sphere/stream?runId=…
 *
 * Server-Sent Events bridge over the hl-sphere-refresh task. Forwards genuine
 * progress (step + percent + message) so the front door can stream the map
 * "lighting up", then sends the final snapshot.
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
      // Heartbeat so proxies/serverless don't drop the connection as idle.
      const heartbeat = setInterval(() => {
        if (closed) return;
        try {
          controller.enqueue(encoder.encode(": keepalive\n\n"));
        } catch {
          /* stream gone */
        }
      }, 15_000);

      const close = () => {
        if (closed) return;
        closed = true;
        clearInterval(heartbeat);
        try {
          controller.close();
        } catch {
          /* already closed */
        }
      };

      req.signal.addEventListener("abort", close);

      send({ type: "progress", progress: 4, step: "connecting" });

      try {
        for await (const run of runs.subscribeToRun<typeof hlSphereRefreshTask>(
          runId,
        )) {
          const meta = (run.metadata ?? {}) as {
            userId?: string;
            step?: string;
            message?: string;
            progress?: number;
            contactsFetched?: number;
            zipsFound?: number;
          };

          // Ownership guard — only the run's owner may read its stream.
          if (meta.userId && meta.userId !== user.id) {
            send({ type: "error", message: "Not allowed." });
            break;
          }

          if (typeof meta.progress === "number") {
            send({
              type: "progress",
              progress: meta.progress,
              step: meta.step,
              message: meta.message,
              contactsFetched: meta.contactsFetched,
              zipsFound: meta.zipsFound,
            });
          }

          if (run.status === "COMPLETED") {
            const out = run.output;
            if (out?.ok && out.snapshot) {
              send({ type: "done", snapshot: out.snapshot });
            } else if (out?.ok && out.noConnection) {
              send({ type: "done", snapshot: null, connected: false });
            } else {
              send({
                type: "error",
                message: out?.error ?? "We couldn't refresh your sphere.",
              });
            }
            break;
          }

          if (TERMINAL_FAIL.has(run.status)) {
            send({
              type: "error",
              message: "Something went sideways mapping your sphere. Try again.",
            });
            break;
          }
        }
      } catch {
        send({ type: "error", message: "Lost the connection to the mapper." });
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
