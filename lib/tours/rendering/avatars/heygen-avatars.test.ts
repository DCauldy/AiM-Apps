import { describe, expect, it, vi } from "vitest";
import { HeyGenAvatarsError, listHeyGenDigitalTwinAvatarLooks } from "./heygen-avatars";

function jsonResponse(body: unknown, init?: ResponseInit) {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { "Content-Type": "application/json" },
    ...init,
  });
}

describe("listHeyGenDigitalTwinAvatarLooks", () => {
  it("accepts HeyGen's documented list response shape", async () => {
    const fetch = vi.fn().mockResolvedValue(
      jsonResponse({
        data: [
          {
            id: "look-1",
            name: "Main Look",
            group_id: "group-1",
            preview_image_url: "https://example.test/look.jpg",
            preview_video_url: "https://example.test/look.mp4",
            gender: "female",
            tags: ["business"],
            supported_api_engines: ["avatar_iv"],
            status: "completed",
          },
        ],
        has_more: false,
        next_token: null,
      })
    );

    await expect(
      listHeyGenDigitalTwinAvatarLooks({ apiKey: "heygen-key", fetch: fetch as typeof globalThis.fetch })
    ).resolves.toEqual([
      {
        id: "look-1",
        name: "Main Look",
        avatarType: "digital_twin",
        groupId: "group-1",
        gender: "female",
        previewImageUrl: "https://example.test/look.jpg",
        previewVideoUrl: "https://example.test/look.mp4",
        tags: ["business"],
        supportedApiEngines: ["avatar_iv"],
        status: "completed",
      },
    ]);
  });

  it("fetches private digital twin avatar looks with safe selector fields", async () => {
    const fetch = vi.fn().mockResolvedValue(
      jsonResponse({
        data: {
          avatar_looks: [
            {
              id: "look-1",
              name: "Main Look",
              avatar_type: "digital_twin",
              group_id: "group-1",
              gender: "female",
              preview_image_url: "https://example.test/look.jpg",
              preview_video_url: "https://example.test/look.mp4",
              tags: ["business", 123],
              supported_api_engines: ["vega", false],
              status: "completed",
              unsafe: "ignored",
            },
            {
              id: "studio-1",
              name: "Studio Look",
              avatar_type: "studio_avatar",
              status: "completed",
            },
          ],
          has_more: false,
          next_token: null,
        },
      })
    );

    await expect(
      listHeyGenDigitalTwinAvatarLooks({ apiKey: "heygen-key", fetch: fetch as typeof globalThis.fetch })
    ).resolves.toEqual([
      {
        id: "look-1",
        name: "Main Look",
        avatarType: "digital_twin",
        groupId: "group-1",
        gender: "female",
        previewImageUrl: "https://example.test/look.jpg",
        previewVideoUrl: "https://example.test/look.mp4",
        tags: ["business"],
        supportedApiEngines: ["vega"],
        status: "completed",
      },
    ]);

    expect(fetch).toHaveBeenCalledTimes(1);
    const url = String(fetch.mock.calls[0][0]);
    expect(url).toContain("/v3/avatars/looks");
    expect(url).toContain("ownership=private");
    expect(url).toContain("avatar_type=digital_twin");
    expect(url).toContain("limit=50");
    expect(fetch.mock.calls[0][1]).toEqual({ headers: { "x-api-key": "heygen-key" } });
  });

  it("follows cursor pagination and sorts by name", async () => {
    const fetch = vi
      .fn()
      .mockResolvedValueOnce(
        jsonResponse({
          data: {
            looks: [{ id: "look-b", name: "Bravo", avatar_type: "digital_twin" }],
            has_more: true,
            next_token: "page-2",
          },
        })
      )
      .mockResolvedValueOnce(
        jsonResponse({
          data: {
            looks: [{ id: "look-a", name: "Alpha", avatar_type: "digital_twin" }],
            has_more: false,
            next_token: null,
          },
        })
      );

    const avatars = await listHeyGenDigitalTwinAvatarLooks({
      apiKey: "heygen-key",
      fetch: fetch as typeof globalThis.fetch,
    });

    expect(avatars.map((avatar) => avatar.id)).toEqual(["look-a", "look-b"]);
    expect(String(fetch.mock.calls[1][0])).toContain("token=page-2");
  });

  it("filters private looks where present status is not completed", async () => {
    const fetch = vi.fn().mockResolvedValue(
      jsonResponse({
        data: {
          avatar_looks: [
            { id: "processing", name: "Processing", avatar_type: "digital_twin", status: "processing" },
            { id: "failed", name: "Failed", avatar_type: "digital_twin", status: "failed" },
            { id: "complete", name: "Complete", avatar_type: "digital_twin", status: "completed" },
            { id: "legacy", name: "Legacy", avatar_type: "digital_twin" },
          ],
        },
      })
    );

    const avatars = await listHeyGenDigitalTwinAvatarLooks({
      apiKey: "heygen-key",
      fetch: fetch as typeof globalThis.fetch,
    });

    expect(avatars.map((avatar) => avatar.id)).toEqual(["complete", "legacy"]);
  });

  it("throws safe errors for provider failure and invalid response", async () => {
    await expect(
      listHeyGenDigitalTwinAvatarLooks({
        apiKey: "heygen-key",
        fetch: vi.fn().mockResolvedValue(jsonResponse({ error: "bad" }, { status: 500 })) as typeof globalThis.fetch,
      })
    ).rejects.toMatchObject(new HeyGenAvatarsError("Could not load HeyGen avatars.", "HEYGEN_AVATARS_FAILED"));

    await expect(
      listHeyGenDigitalTwinAvatarLooks({
        apiKey: "heygen-key",
        fetch: vi.fn().mockResolvedValue(jsonResponse({ data: { nope: [] } })) as typeof globalThis.fetch,
      })
    ).rejects.toMatchObject(
      new HeyGenAvatarsError("HeyGen avatars response was invalid.", "HEYGEN_AVATARS_RESPONSE_INVALID")
    );
  });
});
