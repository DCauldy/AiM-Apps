import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import { validateListingMediaFile } from "./listing-media-upload";

function imageFile(bytes: number[], type: string) {
  return new File([new Uint8Array(bytes)], "listing-photo", { type });
}

describe("validateListingMediaFile", () => {
  it("accepts supported files when declared type matches magic bytes", async () => {
    await expect(
      validateListingMediaFile(imageFile([0xff, 0xd8, 0xff, 0x00], "image/jpeg"))
    ).resolves.toMatchObject({ ok: true });

    await expect(
      validateListingMediaFile(
        imageFile([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a], "image/png")
      )
    ).resolves.toMatchObject({ ok: true });

    await expect(
      validateListingMediaFile(
        imageFile(
          [0x52, 0x49, 0x46, 0x46, 0x00, 0x00, 0x00, 0x00, 0x57, 0x45, 0x42, 0x50],
          "image/webp"
        )
      )
    ).resolves.toMatchObject({ ok: true });
  });

  it("rejects files with spoofed image content types", async () => {
    await expect(
      validateListingMediaFile(imageFile([0x6e, 0x6f, 0x70, 0x65], "image/png"))
    ).resolves.toEqual({
      ok: false,
      error: "Upload a supported listing photo: JPEG, PNG, or WebP.",
      status: 415,
    });
  });

  it("rejects files whose declared type does not match detected image type", async () => {
    await expect(
      validateListingMediaFile(imageFile([0xff, 0xd8, 0xff, 0x00], "image/png"))
    ).resolves.toEqual({
      ok: false,
      error: "Upload a supported listing photo: JPEG, PNG, or WebP.",
      status: 415,
    });
  });
});
