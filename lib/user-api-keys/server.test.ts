import { beforeEach, describe, expect, test } from "vitest";
import assert from "node:assert/strict";
import { vi } from "vitest";

const mocks = vi.hoisted(() => ({
  listOrder: vi.fn(),
  maybeSingle: vi.fn(),
  inFilter: vi.fn(),
}));

vi.mock("server-only", () => ({}));

vi.mock("@/lib/supabase/server", () => ({
  createServiceRoleClient: () => ({
    from: () => ({
      select: () => ({
        eq: () => ({
          order: mocks.listOrder,
          eq: () => ({
            maybeSingle: mocks.maybeSingle,
          }),
          in: mocks.inFilter,
        }),
      }),
    }),
  }),
}));

import {
  getUserApiKeyStatus,
  getUserApiKeyStatusMap,
  listUserApiKeySummaries,
} from "@/lib/user-api-keys/server";

describe("user API key UI status helpers", () => {
  beforeEach(() => {
    mocks.listOrder.mockReset();
    mocks.maybeSingle.mockReset();
    mocks.inFilter.mockReset();
  });

  test("lists only safe API key summaries for UI", async () => {
    mocks.listOrder.mockResolvedValue({
      data: [{ service_key: "elevenlabs", updated_at: "2026-06-07T00:00:00.000Z" }],
      error: null,
    });

    await expect(listUserApiKeySummaries("user-1")).resolves.toEqual([
      {
        service_key: "elevenlabs",
        has_key: true,
        updated_at: "2026-06-07T00:00:00.000Z",
      },
    ]);
  });

  test("returns configured status for one integration", async () => {
    mocks.maybeSingle.mockResolvedValue({
      data: { service_key: "heygen", updated_at: "2026-06-07T00:00:00.000Z" },
      error: null,
    });

    await expect(getUserApiKeyStatus("user-1", "heygen")).resolves.toEqual({
      service_key: "heygen",
      has_key: true,
      updated_at: "2026-06-07T00:00:00.000Z",
    });
  });

  test("returns unconfigured status for one integration", async () => {
    mocks.maybeSingle.mockResolvedValue({ data: null, error: null });

    await expect(getUserApiKeyStatus("user-1", "elevenlabs")).resolves.toEqual({
      service_key: "elevenlabs",
      has_key: false,
      updated_at: null,
    });
  });

  test("returns a boolean status map safe to pass to client components", async () => {
    mocks.inFilter.mockResolvedValue({
      data: [{ service_key: "elevenlabs" }],
      error: null,
    });

    assert.deepEqual(await getUserApiKeyStatusMap("user-1", ["elevenlabs", "heygen"]), {
      elevenlabs: true,
      heygen: false,
    });
  });

  test("returns an empty map without querying when no services are requested", async () => {
    assert.deepEqual(await getUserApiKeyStatusMap("user-1", []), {});
    expect(mocks.inFilter).not.toHaveBeenCalled();
  });
});
