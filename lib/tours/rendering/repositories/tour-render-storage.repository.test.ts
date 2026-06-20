import { describe, expect, it, vi } from "vitest";

import { createTourRenderStorageRepository } from "./tour-render-storage.repository";

describe("tour render storage repository", () => {
  it("signs generated media URLs with a download title", async () => {
    const createSignedUrl = vi.fn().mockResolvedValue({
      data: {
        signedUrl: "https://storage.example.test/final.mp4?token=abc&download=Lake+House+Tour.mp4",
      },
      error: null,
    });
    const from = vi.fn().mockReturnValue({ createSignedUrl });
    const repository = createTourRenderStorageRepository({ storage: { from } } as never);

    const signed = await repository.createSignedGeneratedMediaUrl({
      storageBucket: "tours-generated-media",
      storagePath: "user-1/project-1/run-1/final.mp4",
      downloadTitle: "Lake House Tour.mp4",
    });

    expect(from).toHaveBeenCalledWith("tours-generated-media");
    expect(createSignedUrl).toHaveBeenCalledWith(
      "user-1/project-1/run-1/final.mp4",
      60 * 60,
      { download: "Lake House Tour.mp4" }
    );
    expect(signed?.signedUrl).toBe(
      "https://storage.example.test/final.mp4?token=abc&download=Lake+House+Tour.mp4"
    );
  });
});
