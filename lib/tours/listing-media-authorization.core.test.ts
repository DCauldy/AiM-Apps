import { test } from "vitest";
import assert from "node:assert/strict";

import {
  type ListingMediaAuthorizationRepository,
  recordListingMediaAcknowledgementWithRepository,
} from "./listing-media-authorization.core";

function repository(
  overrides: Partial<ListingMediaAuthorizationRepository> = {}
): ListingMediaAuthorizationRepository {
  return {
    getCurrentUser: async () => ({ id: "user-1" }),
    getOpenProjectForUser: async () => ({
      id: "project-1",
      listing_media_acknowledged_at: null,
    }),
    acknowledgeProjectListingMedia: async () => ({
      id: "project-1",
      listing_media_acknowledged_at: "2026-06-06T00:00:00.000Z",
    }),
    ...overrides,
  };
}

test("records listing-media acknowledgement on the Tour Project", async () => {
  let updatedProjectId: string | undefined;
  let updatedUserId: string | undefined;
  const result = await recordListingMediaAcknowledgementWithRepository(
    "project-1",
    repository({
      acknowledgeProjectListingMedia: async (projectId, userId) => {
        updatedProjectId = projectId;
        updatedUserId = userId;
        return {
          id: projectId,
          listing_media_acknowledged_at: "2026-06-06T00:00:00.000Z",
        };
      },
    })
  );

  assert.equal(result.ok, true);
  assert.equal(updatedProjectId, "project-1");
  assert.equal(updatedUserId, "user-1");
  if (result.ok) {
    assert.deepEqual(result.acknowledgement, {
      projectId: "project-1",
      acknowledgedAt: "2026-06-06T00:00:00.000Z",
    });
  }
});

test("returns existing project acknowledgement without rewriting the timestamp", async () => {
  let updateCalled = false;
  const result = await recordListingMediaAcknowledgementWithRepository(
    "project-1",
    repository({
      getOpenProjectForUser: async () => ({
        id: "project-1",
        listing_media_acknowledged_at: "2026-06-06T00:00:00.000Z",
      }),
      acknowledgeProjectListingMedia: async () => {
        updateCalled = true;
        return null;
      },
    })
  );

  assert.equal(result.ok, true);
  assert.equal(updateCalled, false);
  if (result.ok) {
    assert.equal(result.acknowledgement.acknowledgedAt, "2026-06-06T00:00:00.000Z");
  }
});

test("rejects acknowledgement when user cannot access the Tour Project", async () => {
  let updateCalled = false;
  const result = await recordListingMediaAcknowledgementWithRepository(
    "project-1",
    repository({
      getOpenProjectForUser: async () => null,
      acknowledgeProjectListingMedia: async () => {
        updateCalled = true;
        return {
          id: "project-1",
          listing_media_acknowledged_at: "2026-06-06T00:00:00.000Z",
        };
      },
    })
  );

  assert.deepEqual(result, {
    ok: false,
    status: 404,
    error: "Tour Project was not found or cannot be acknowledged.",
  });
  assert.equal(updateCalled, false);
});
