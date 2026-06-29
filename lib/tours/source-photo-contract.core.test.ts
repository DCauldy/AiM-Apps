import { test } from "vitest";
import assert from "node:assert/strict";

import {
  getDeleteAuthoritativeSourcePhotoRpcArgs,
  mapDeleteAuthoritativeSourcePhotoError,
} from "./source-photo-contract.core";

test("source photo deletion RPC args default to the primary source photo", () => {
  assert.deepEqual(
    getDeleteAuthoritativeSourcePhotoRpcArgs({ projectId: "project-1", sceneId: "scene-1" }),
    {
      p_project_id: "project-1",
      p_scene_id: "scene-1",
      p_source_photo_id: null,
    }
  );
});

test("source photo deletion RPC args pass through a selected secondary source-photo id", () => {
  assert.deepEqual(
    getDeleteAuthoritativeSourcePhotoRpcArgs({
      projectId: "project-1",
      sceneId: "scene-1",
      sourcePhotoId: "photo-secondary",
    }),
    {
      p_project_id: "project-1",
      p_scene_id: "scene-1",
      p_source_photo_id: "photo-secondary",
    }
  );
});

test("maps last-photo prevention to a listing photo error", () => {
  assert.deepEqual(
    mapDeleteAuthoritativeSourcePhotoError("TourScene needs at least one listing photo"),
    {
      status: 409,
      error: "TourScene needs at least one listing photo.",
    }
  );
});

test("maps missing removed photo to a listing photo error", () => {
  assert.deepEqual(
    mapDeleteAuthoritativeSourcePhotoError("TourScene listing photo was not found"),
    {
      status: 404,
      error: "TourScene listing photo was not found.",
    }
  );
});
