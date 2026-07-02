import { runs } from "@trigger.dev/sdk/v3";
import { NextRequest } from "next/server";

import { createClient } from "@/lib/supabase/server";
import type { heatEnrichTask } from "@/triggers/heat-enrich";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
// Stays open for the lifetime of the enrich run.
export const maxDuration = 300;

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
 * GET /api/apps/heat/stream?runId=…
 *
 * Server-Sent Events bridge over the heat-enrich task. Forwards genuine
 * progress (step + percent) so the launcher can stream "what's being built",
 * then signals done so the client can open the board.
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

      send({ type: "progress", progress: 4, step: "Connecting…" });

      try {
        for await (const run of runs.subscribeToRun<typeof heatEnrichTask>(runId)) {
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
            if (out?.ok) {
              send({ type: "done", count: out.count });
            } else {
              send({ type: "error", message: "We couldn't build your hot sheet." });
            }
            break;
          }

          if (TERMINAL_FAIL.has(run.status)) {
            send({
              type: "error",
              message: "Something went sideways building your hot sheet. Try again.",
            });
            break;
          }
        }
      } catch {
        send({ type: "error", message: "Lost the connection while building." });
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
