import { describe, expect, it, vi } from "vitest";

vi.mock("@/lib/user-api-keys/service", () => ({
  getUserApiKey: vi.fn(),
}));

import {
  DEFAULT_HEYGEN_POSITIONING,
  buildHeyGenAvatarOverlayPlan,
  resolveHeyGenAvatarPlacement,
  waitForHeyGenAvatarVideo,
  type HeyGenAvatarAlphaAnalysis,
} from "./tour-avatar";

const analysis: HeyGenAvatarAlphaAnalysis = {
  sourceWidth: 720,
  sourceHeight: 1280,
  sampledFrameCount: 4,
  alphaThreshold: 16,
  medianBox: {
    x: 120,
    y: 100,
    width: 360,
    height: 900,
    right: 480,
    bottom: 1000,
  },
  maxBox: {
    x: 100,
    y: 80,
    width: 400,
    height: 940,
    right: 500,
    bottom: 1020,
  },
  transparentPadding: {
    left: 120,
    right: 240,
    top: 100,
    bottom: 280,
  },
  edgeTouchRate: {
    left: 0,
    right: 0,
    top: 0,
    bottom: 0,
  },
  cropRisk: {
    level: "none",
    reasons: [],
  },
};

describe("tour avatar rendering helpers", () => {
  it("polls HeyGen status until the generated video is ready", async () => {
    const provider = {
      getAvatarVideo: vi
        .fn()
        .mockResolvedValueOnce({ status: "pending" })
        .mockResolvedValueOnce({ status: "completed", videoUrl: "https://cdn.example/avatar.webm" }),
    };
    const sleep = vi.fn().mockResolvedValue(undefined);

    await expect(
      waitForHeyGenAvatarVideo({
        apiKey: "heygen-key",
        videoId: "video-1",
        provider,
        sleep,
        pollIntervalMs: 50,
      })
    ).resolves.toEqual({ videoUrl: "https://cdn.example/avatar.webm" });

    expect(provider.getAvatarVideo).toHaveBeenCalledTimes(2);
    expect(sleep).toHaveBeenCalledWith(50);
  });

  it("builds visible-bounding-box overlay filters for avatar compositing", () => {
    const placement = resolveHeyGenAvatarPlacement({
      canvas: { width: 1080, height: 1920 },
      size: "medium",
      positioning: DEFAULT_HEYGEN_POSITIONING,
      analysis,
    });

    expect(placement.avatarWidth).toBe(1188);
    expect(placement.overlayX).toBe("W-792-0");
    expect(placement.overlayY).toBe("H-1650-0");

    expect(
      buildHeyGenAvatarOverlayPlan({
        canvas: { width: 1080, height: 1920 },
        size: "medium",
        placement,
      }).ffmpeg.filterComplex
    ).toContain("overlay=x=W-792-0:y=H-1650-0:format=auto[v]");
  });
});
