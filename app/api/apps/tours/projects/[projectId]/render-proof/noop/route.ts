import { tasks } from "@trigger.dev/sdk/v3";
import { z } from "zod";

import { requireToursAccess, toursAccessErrorResponse } from "@/lib/tours/access.server";
import type { toursRenderNoopProofTask } from "@/triggers/tours-render-noop-proof";

export const dynamic = "force-dynamic";

const NoopRenderProofSchema = z.object({
  renderRunId: z.string().trim().min(1).optional(),
  options: z
    .object({
      renderMode: z.enum(["ken_burns_ffmpeg", "provider_image_to_video"]).optional(),
      reuseExistingAssets: z.boolean().optional(),
    })
    .optional(),
});

export async function POST(
  request: Request,
  { params }: { params: Promise<{ projectId: string }> }
) {
  const { projectId } = await params;
  const access = await requireToursAccess({ projectId, requireOpenProject: true });
  if (!access.ok) {
    return toursAccessErrorResponse(access);
  }

  const body = await request.json().catch(() => ({}));
  const parsed = NoopRenderProofSchema.safeParse(body);
  if (!parsed.success) {
    return Response.json(
      { error: parsed.error.issues[0]?.message ?? "Enter valid proof trigger details." },
      { status: 400 }
    );
  }

  const payload = {
    projectId,
    userId: access.user.id,
    renderRunId: parsed.data.renderRunId ?? crypto.randomUUID(),
    options: {
      proofOnly: true,
      ...parsed.data.options,
    },
  } satisfies Parameters<typeof toursRenderNoopProofTask.trigger>[0];

  const handle = await tasks.trigger<typeof toursRenderNoopProofTask>(
    "tours-render-noop-proof",
    payload,
    {
      tags: [`user:${access.user.id}`, `tour-project:${projectId}`, "tours-render-noop-proof"],
      metadata: {
        product: "tours",
        proofOnly: true,
        projectId,
        renderRunId: payload.renderRunId,
      },
    }
  );

  return Response.json({
    taskId: "tours-render-noop-proof",
    triggerRunId: handle.id,
    payload,
  });
}
