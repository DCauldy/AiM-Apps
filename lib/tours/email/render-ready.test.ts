import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

const sendMock = vi.hoisted(() => vi.fn());
const resendConstructorMock = vi.hoisted(() =>
  vi.fn(function MockResend() {
    return {
      emails: {
        send: sendMock,
      },
    };
  })
);
const createServiceRoleClientMock = vi.hoisted(() => vi.fn());

vi.mock("resend", () => ({
  Resend: resendConstructorMock,
}));

vi.mock("@/lib/supabase/server", () => ({
  createServiceRoleClient: createServiceRoleClientMock,
}));

import {
  enqueueTourRenderReadyEmailAfterCompletion,
  loadTourRenderReadyRecipient,
  renderTourRenderReadyEmail,
  sendTourRenderReadyEmail,
  sendTourRenderReadyEmailForCompletedRun,
  type TourRenderReadyEmailPayload,
} from "./render-ready";
import type { TourRenderRun } from "../rendering/repositories/tour-render.repository";

const payload: TourRenderReadyEmailPayload = {
  userId: "user-1",
  projectId: "project-1",
  renderRunId: "run-1",
  resultAssetId: "asset-final",
};

const completedRun: Pick<TourRenderRun, "status" | "resultAssetId"> = {
  status: "completed",
  resultAssetId: "asset-final",
};

function createRepository(run: Pick<TourRenderRun, "status" | "resultAssetId"> | null) {
  return {
    getRenderRun: vi.fn().mockResolvedValue(run),
  };
}

describe("renderTourRenderReadyEmail", () => {
  beforeEach(() => {
    process.env.NEXT_PUBLIC_APP_URL = "https://apps.example.test";
  });

  it("renders branded HTML and text with a render-screen CTA", () => {
    const message = renderTourRenderReadyEmail({
      projectId: "project-1",
      projectName: "Elm & Oak <Tour>",
      propertyAddress: "123 Main St",
    });

    expect(message.subject).toBe("Your tour video is ready");
    expect(message.ctaUrl).toBe(
      "https://apps.example.test/apps/tours/projects/project-1/rendering"
    );
    expect(message.html).toContain("AiM Tours");
    expect(message.html).toContain("Elm &amp; Oak &lt;Tour&gt;");
    expect(message.html).toContain(message.ctaUrl);
    expect(message.text).toContain("Project: Elm & Oak <Tour>");
    expect(message.text).toContain("Address: 123 Main St");
    expect(message.text).toContain(message.ctaUrl);
  });
});

describe("sendTourRenderReadyEmail", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    sendMock.mockResolvedValue({ data: { id: "email-1" }, error: null });
    process.env.PLATFORM_RESEND_API_KEY = "re_test";
    process.env.PLATFORM_RESEND_FROM = "AiM Platform <platform@example.test>";
    process.env.NEXT_PUBLIC_APP_URL = "https://apps.example.test";
  });

  it("sends with platform env vars and Resend idempotency", async () => {
    await sendTourRenderReadyEmail({
      toEmail: "user@example.test",
      userId: "user-1",
      projectId: "project-1",
      renderRunId: "run-1",
      projectName: "Elm & Oak Tour",
      propertyAddress: "123 Main St",
    });

    expect(resendConstructorMock).toHaveBeenCalledWith("re_test");
    expect(sendMock).toHaveBeenCalledWith(
      expect.objectContaining({
        from: "AiM Platform <platform@example.test>",
        to: "user@example.test",
        subject: "Your tour video is ready",
        text: expect.stringContaining(
          "https://apps.example.test/apps/tours/projects/project-1/rendering"
        ),
      }),
      {
        idempotencyKey: "tour-render-ready:run-1:user-1",
      }
    );
  });
});

describe("enqueueTourRenderReadyEmailAfterCompletion", () => {
  it("enqueues only completed renders with a matching result asset", async () => {
    const triggerEmailTask = vi.fn().mockResolvedValue({ id: "trigger-email-1" });

    const result = await enqueueTourRenderReadyEmailAfterCompletion({
      run: completedRun,
      payload,
      triggerEmailTask,
    });

    expect(result).toEqual({ enqueued: true });
    expect(triggerEmailTask).toHaveBeenCalledWith(payload, {
      idempotencyKey: "tour-render-ready-email:run-1",
      concurrencyKey: "tour-render-ready-email:user-1",
      tags: [
        "user:user-1",
        "tour-project:project-1",
        "tour-render:run-1",
        "tour-render-ready-email",
      ],
    });
  });

  it("logs and does not throw when the enqueue fails", async () => {
    const logger = { error: vi.fn() };

    const result = await enqueueTourRenderReadyEmailAfterCompletion({
      run: completedRun,
      payload,
      triggerEmailTask: vi.fn().mockRejectedValue(new Error("trigger down")),
      logger,
      logContext: { parentTriggerRunId: "parent-1" },
    });

    expect(result).toEqual({ enqueued: false, skippedReason: "enqueue_failed" });
    expect(logger.error).toHaveBeenCalledWith(
      "Tours render-ready email enqueue failed.",
      expect.objectContaining({
        parentTriggerRunId: "parent-1",
        projectId: "project-1",
        renderRunId: "run-1",
      })
    );
  });

  it.each([
    ["failed", { status: "failed", resultAssetId: null }, "render_failed"],
    ["cancelled", { status: "cancelled", resultAssetId: null }, "render_cancelled"],
    [
      "superseded",
      { status: "completed", resultAssetId: "asset-other" },
      "result_asset_mismatch",
    ],
  ] as const)("skips %s renders", async (_label, run, skippedReason) => {
    const triggerEmailTask = vi.fn();

    const result = await enqueueTourRenderReadyEmailAfterCompletion({
      run,
      payload,
      triggerEmailTask,
    });

    expect(result).toEqual({ enqueued: false, skippedReason });
    expect(triggerEmailTask).not.toHaveBeenCalled();
  });
});

describe("sendTourRenderReadyEmailForCompletedRun", () => {
  it("sends after reloading a completed run, matching project, and recipient email", async () => {
    const sendEmail = vi.fn().mockResolvedValue(undefined);

    const result = await sendTourRenderReadyEmailForCompletedRun(payload, {
      repository: createRepository(completedRun),
      loadProject: vi.fn().mockResolvedValue({
        id: "project-1",
        userId: "user-1",
        name: "Elm & Oak Tour",
        propertyAddress: "123 Main St",
      }),
      loadRecipient: vi.fn().mockResolvedValue({
        email: "user@example.test",
        name: "User Example",
      }),
      sendEmail,
    });

    expect(result).toEqual({ sent: true, toEmail: "user@example.test" });
    expect(sendEmail).toHaveBeenCalledWith({
      toEmail: "user@example.test",
      userId: "user-1",
      projectId: "project-1",
      renderRunId: "run-1",
      projectName: "Elm & Oak Tour",
      propertyAddress: "123 Main St",
    });
  });

  it.each([
    ["failed", { status: "failed", resultAssetId: null }, "render_failed"],
    ["cancelled", { status: "cancelled", resultAssetId: null }, "render_cancelled"],
    [
      "superseded",
      { status: "completed", resultAssetId: "asset-other" },
      "result_asset_mismatch",
    ],
  ] as const)("does not send for %s runs", async (_label, run, skippedReason) => {
    const sendEmail = vi.fn();

    const result = await sendTourRenderReadyEmailForCompletedRun(payload, {
      repository: createRepository(run),
      loadProject: vi.fn(),
      loadRecipient: vi.fn(),
      sendEmail,
    });

    expect(result).toEqual({ sent: false, skippedReason });
    expect(sendEmail).not.toHaveBeenCalled();
  });

  it("does not send when the user has no profile email", async () => {
    const sendEmail = vi.fn();

    const result = await sendTourRenderReadyEmailForCompletedRun(payload, {
      repository: createRepository(completedRun),
      loadProject: vi.fn().mockResolvedValue({
        id: "project-1",
        userId: "user-1",
        name: "Elm & Oak Tour",
        propertyAddress: "123 Main St",
      }),
      loadRecipient: vi.fn().mockResolvedValue({ email: null, name: "User Example" }),
      sendEmail,
    });

    expect(result).toEqual({
      sent: false,
      skippedReason: "missing_profile_email",
    });
    expect(sendEmail).not.toHaveBeenCalled();
  });
});

describe("loadTourRenderReadyRecipient", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("uses Supabase Auth email as the delivery source and profile name only as metadata", async () => {
    const maybeSingle = vi.fn().mockResolvedValue({
      data: {
        full_name: "Profile Name",
      },
      error: null,
    });
    const eq = vi.fn().mockReturnValue({ maybeSingle });
    const select = vi.fn().mockReturnValue({ eq });
    const from = vi.fn().mockReturnValue({ select });
    const getUserById = vi.fn().mockResolvedValue({
      data: {
        user: {
          email: "auth@example.test",
          user_metadata: {},
        },
      },
      error: null,
    });

    createServiceRoleClientMock.mockReturnValue({
      auth: {
        admin: {
          getUserById,
        },
      },
      from,
    });

    const recipient = await loadTourRenderReadyRecipient({ userId: "user-1" });

    expect(getUserById).toHaveBeenCalledWith("user-1");
    expect(from).toHaveBeenCalledWith("profiles");
    expect(select).toHaveBeenCalledWith("full_name");
    expect(recipient).toEqual({
      email: "auth@example.test",
      name: "Profile Name",
    });
  });
});
