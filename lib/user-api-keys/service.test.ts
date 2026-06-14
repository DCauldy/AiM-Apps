import { beforeEach, describe, expect, test, vi } from "vitest";
import assert from "node:assert/strict";

const mocks = vi.hoisted(() => ({
  decrypt: vi.fn(),
  maybeSingle: vi.fn(),
}));

vi.mock("server-only", () => ({}));

vi.mock("@/lib/blog-engine/encryption", () => ({
  decrypt: mocks.decrypt,
}));

vi.mock("@/lib/supabase/server", () => ({
  createServiceRoleClient: () => ({
    from: () => ({
      select: () => ({
        eq: () => ({
          eq: () => ({
            maybeSingle: mocks.maybeSingle,
          }),
        }),
      }),
    }),
  }),
}));

import {
  getUserApiKey,
  UserApiKeyMissingError,
  withUserApiKey,
} from "@/lib/user-api-keys/service";

describe("user API key service", () => {
  beforeEach(() => {
    mocks.decrypt.mockReset();
    mocks.maybeSingle.mockReset();
  });

  test("decrypts a configured user API key", async () => {
    mocks.maybeSingle.mockResolvedValue({
      data: { api_key_encrypted: "encrypted-key" },
      error: null,
    });
    mocks.decrypt.mockReturnValue("plain-key");

    await expect(getUserApiKey("user-1", "elevenlabs")).resolves.toBe("plain-key");
    expect(mocks.decrypt).toHaveBeenCalledWith("encrypted-key");
  });

  test("returns null when a user API key is not configured", async () => {
    mocks.maybeSingle.mockResolvedValue({ data: null, error: null });

    await expect(getUserApiKey("user-1", "heygen")).resolves.toBeNull();
    expect(mocks.decrypt).not.toHaveBeenCalled();
  });

  test("wraps a configured API key with the provided factory", async () => {
    mocks.maybeSingle.mockResolvedValue({
      data: { api_key_encrypted: "encrypted-key" },
      error: null,
    });
    mocks.decrypt.mockReturnValue("plain-key");

    const service = await withUserApiKey("user-1", "elevenlabs", (apiKey) => ({
      apiKey,
      ready: true,
    }));

    assert.deepEqual(service, { apiKey: "plain-key", ready: true });
  });

  test("throws a typed missing-key error when wrapping an unconfigured service", async () => {
    mocks.maybeSingle.mockResolvedValue({ data: null, error: null });

    await expect(
      withUserApiKey("user-1", "heygen", (apiKey) => ({ apiKey }))
    ).rejects.toMatchObject({
      name: "UserApiKeyMissingError",
      serviceKey: "heygen",
    });
  });

  test("keeps missing-key errors distinguishable with instanceof", async () => {
    mocks.maybeSingle.mockResolvedValue({ data: null, error: null });

    try {
      await withUserApiKey("user-1", "elevenlabs", (apiKey) => ({ apiKey }));
      assert.fail("Expected withUserApiKey to throw");
    } catch (error) {
      assert.ok(error instanceof UserApiKeyMissingError);
      assert.equal(error.serviceKey, "elevenlabs");
    }
  });
});
