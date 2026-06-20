import { afterEach, describe, expect, test, vi } from "vitest";
import {
  buildCreateRenderRunRequestBody,
  FRESH_RENDER_OPTIONS,
  readToursJsonResponse,
  tourQueryKeys,
  toursApiRoutes,
  fetchDigitalTwinVoices,
  fetchHeyGenAvatarLooks,
  updateTourProjectDetails,
} from "./tours-api-client";

afterEach(() => {
  vi.restoreAllMocks();
});

describe("Tours API client boundary", () => {
  test("builds shared Tours API routes", () => {
    expect(toursApiRoutes.voices()).toBe("/api/apps/tours/voices");
    expect(toursApiRoutes.avatars()).toBe("/api/apps/tours/avatars");
    expect(toursApiRoutes.projects()).toBe("/api/apps/tours/projects");
    expect(toursApiRoutes.project("project-1")).toBe("/api/apps/tours/projects/project-1");
    expect(toursApiRoutes.scenePhoto("project-1", "scene-1", "photo 1")).toBe(
      "/api/apps/tours/projects/project-1/scenes/scene-1/photo?sourcePhotoId=photo%201"
    );
    expect(toursApiRoutes.renderRunStatus("project-1", "run-1")).toBe(
      "/api/apps/tours/projects/project-1/render-runs/run-1/status"
    );
    expect(toursApiRoutes.renderRunAssets("run-1")).toBe(
      "/api/apps/tours/render-runs/run-1/assets"
    );
  });

  test("encodes all Tours API route path segments", () => {
    expect(toursApiRoutes.project("project/1")).toBe("/api/apps/tours/projects/project%2F1");
    expect(toursApiRoutes.projectArchive("project 1")).toBe(
      "/api/apps/tours/projects/project%201/archive"
    );
    expect(toursApiRoutes.listingMediaAuthorization("project?1")).toBe(
      "/api/apps/tours/projects/project%3F1/listing-media-authorization"
    );
    expect(toursApiRoutes.scenes("project#1")).toBe("/api/apps/tours/projects/project%231/scenes");
    expect(toursApiRoutes.scenesReorder("project/1")).toBe(
      "/api/apps/tours/projects/project%2F1/scenes/reorder"
    );
    expect(toursApiRoutes.scene("project/1", "scene/1")).toBe(
      "/api/apps/tours/projects/project%2F1/scenes/scene%2F1"
    );
    expect(toursApiRoutes.sceneInclusion("project/1", "scene 1")).toBe(
      "/api/apps/tours/projects/project%2F1/scenes/scene%201/inclusion"
    );
    expect(toursApiRoutes.scenePhoto("project/1", "scene?1", "photo/1")).toBe(
      "/api/apps/tours/projects/project%2F1/scenes/scene%3F1/photo?sourcePhotoId=photo%2F1"
    );
    expect(toursApiRoutes.sceneFacts("project/1", "scene#1")).toBe(
      "/api/apps/tours/projects/project%2F1/scenes/scene%231/facts"
    );
    expect(toursApiRoutes.sceneFact("project/1", "scene/1", "fact/1")).toBe(
      "/api/apps/tours/projects/project%2F1/scenes/scene%2F1/facts/fact%2F1"
    );
    expect(toursApiRoutes.renderRuns("project/1")).toBe(
      "/api/apps/tours/projects/project%2F1/render-runs"
    );
    expect(toursApiRoutes.renderRunStatus("project/1", "run/1")).toBe(
      "/api/apps/tours/projects/project%2F1/render-runs/run%2F1/status"
    );
    expect(toursApiRoutes.renderRunAssets("run/1")).toBe(
      "/api/apps/tours/render-runs/run%2F1/assets"
    );
  });

  test("builds shared Tours query keys", () => {
    expect(tourQueryKeys.elevenLabsDigitalTwinVoices()).toEqual([
      "tours",
      "elevenlabs",
      "digital-twin-voices",
    ]);
    expect(tourQueryKeys.heyGenAvatarLooks()).toEqual([
      "tours",
      "heygen",
      "digital-twin-avatar-looks",
    ]);
    expect(tourQueryKeys.openProjects()).toEqual(["tours", "projects", "open"]);
    expect(tourQueryKeys.workspace("project-1")).toEqual(["tours", "workspace", "project-1"]);
    expect(tourQueryKeys.renderRuns("project-1")).toEqual([
      "tours",
      "render-runs",
      "project-1",
    ]);
    expect(tourQueryKeys.renderRunStatus("project-1", "run-1")).toEqual([
      "tours",
      "render-runs",
      "project-1",
      "run-1",
      "status",
    ]);
    expect(tourQueryKeys.renderRunAssets("run-1")).toEqual([
      "tours",
      "render-runs",
      "run-1",
      "assets",
    ]);
  });

  test("reads API error messages and falls back for malformed error payloads", async () => {
    await expect(
      readToursJsonResponse(Response.json({ error: "Specific Tours error" }, { status: 422 }), "Fallback")
    ).rejects.toThrow("Specific Tours error");

    await expect(
      readToursJsonResponse(new Response("not json", { status: 500 }), "Fallback Tours error")
    ).rejects.toThrow("Fallback Tours error");
  });

  test("fresh render request body sends reuse disabled without overriding render mode", () => {
    const body = buildCreateRenderRunRequestBody({ fresh: true });

    expect(body).toEqual({ options: FRESH_RENDER_OPTIONS });
    expect(JSON.stringify(body)).not.toContain("renderMode");
    expect(buildCreateRenderRunRequestBody({ fresh: false })).toEqual({});
  });

  test("dev-tool render request body sends selected preset options", () => {
    const options = {
      renderMode: "provider_image_to_video" as const,
      sceneClipProviderModelId: "kwaivgi/kling-v3.0-std",
      reuseExistingAssets: true,
      reuse: {
        scriptPlan: true,
        voiceover: true,
        avatar: true,
        sceneClips: false,
        finalVideo: false,
      },
    };

    expect(buildCreateRenderRunRequestBody({ options })).toEqual({ options });
  });

  test("updateTourProjectDetails sends avatar settings through the shared project route", async () => {
    const fetchMock = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValue(Response.json({ project: { id: "project-1" } }));
    const placement = {
      frame: { width: 1080 as const, height: 1920 as const },
      offsets: { top: 240, left: 540, bottom: 0, right: 40 },
    };

    await updateTourProjectDetails("project-1", {
      name: "Lake House Tour",
      propertyAddress: "123 Lake Road",
      listingUrl: "",
      elevenLabsVoiceId: "voice-1",
      heyGenAvatarId: "avatar-look-1",
      heyGenAvatarPlacement: placement,
    });

    expect(fetchMock).toHaveBeenCalledWith("/api/apps/tours/projects/project-1", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: "Lake House Tour",
        propertyAddress: "123 Lake Road",
        listingUrl: "",
        elevenLabsVoiceId: "voice-1",
        heyGenAvatarId: "avatar-look-1",
        heyGenAvatarPlacement: placement,
      }),
    });
  });

  test("selector helpers fetch voices and avatars through shared routes", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch").mockImplementation(async (input) => {
      if (input === "/api/apps/tours/voices") {
        return Response.json({ voices: [{ id: "voice-1", name: "Voice" }] });
      }
      if (input === "/api/apps/tours/avatars") {
        return Response.json({ avatars: [{ id: "avatar-1", name: "Avatar" }] });
      }
      return Response.json({ error: "Unexpected request" }, { status: 500 });
    });

    await expect(fetchDigitalTwinVoices()).resolves.toEqual({
      voices: [{ id: "voice-1", name: "Voice" }],
    });
    await expect(fetchHeyGenAvatarLooks()).resolves.toEqual({
      avatars: [{ id: "avatar-1", name: "Avatar" }],
    });
    expect(fetchMock).toHaveBeenCalledWith("/api/apps/tours/voices");
    expect(fetchMock).toHaveBeenCalledWith("/api/apps/tours/avatars");
  });
});
