import { describe, expect, it, vi } from "vitest";

import {
  LISTING_MEDIA_SIGN_BATCH_SIZE,
  createTourRenderStorageRepository,
} from "./tour-render-storage.repository";

describe("tour render storage repository", () => {
  it("checks listing media read access in bounded parallel batches", async () => {
    const resolvers: Array<
      (value: { data: { signedUrl: string }; error: null }) => void
    > = [];
    const createSignedUrl = vi.fn(() => {
      return new Promise<{ data: { signedUrl: string }; error: null }>(
        (resolve) => {
          resolvers.push(resolve);
        },
      );
    });
    const from = vi.fn().mockReturnValue({ createSignedUrl });
    const repository = createTourRenderStorageRepository({
      storage: { from },
    } as never);
    const storagePaths = Array.from(
      { length: LISTING_MEDIA_SIGN_BATCH_SIZE + 2 },
      (_, index) => `user-1/project-1/photo-${index}.jpg`,
    );

    const canRead = repository.canReadListingMedia({ storagePaths });
    await Promise.resolve();

    expect(from).toHaveBeenCalledWith("tours-listing-media");
    expect(createSignedUrl).toHaveBeenCalledTimes(
      LISTING_MEDIA_SIGN_BATCH_SIZE,
    );

    for (const resolve of resolvers.splice(0)) {
      resolve({
        data: { signedUrl: "https://storage.example.test/photo.jpg" },
        error: null,
      });
    }
    await Promise.resolve();
    await Promise.resolve();

    expect(createSignedUrl).toHaveBeenCalledTimes(storagePaths.length);

    for (const resolve of resolvers.splice(0)) {
      resolve({
        data: { signedUrl: "https://storage.example.test/photo.jpg" },
        error: null,
      });
    }

    await expect(canRead).resolves.toBe(true);
    expect(createSignedUrl).toHaveBeenNthCalledWith(1, storagePaths[0], 60);
  });

  it("returns false when any listing media path cannot be signed", async () => {
    const createSignedUrl = vi
      .fn()
      .mockResolvedValueOnce({
        data: { signedUrl: "https://storage.example.test/ok.jpg" },
        error: null,
      })
      .mockResolvedValueOnce({
        data: null,
        error: new Error("missing object"),
      });
    const from = vi.fn().mockReturnValue({ createSignedUrl });
    const repository = createTourRenderStorageRepository({
      storage: { from },
    } as never);

    await expect(
      repository.canReadListingMedia({
        storagePaths: [
          "user-1/project-1/ok.jpg",
          "user-1/project-1/missing.jpg",
        ],
      }),
    ).resolves.toBe(false);
  });

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
