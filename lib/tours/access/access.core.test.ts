import { test } from "vitest";
import assert from "node:assert/strict";

import { evaluateToursAccess } from "./access.core";

test("allows a pro user when Tours is enabled and no project is required", () => {
  assert.deepEqual(
    evaluateToursAccess({
      user: { id: "user-1", app_metadata: { subscription_tier: "pro" } },
      isToursEnabled: true,
    }),
    { ok: true }
  );
});

test("denies unauthenticated access with the shared Tours message", () => {
  assert.deepEqual(
    evaluateToursAccess({
      user: null,
      isToursEnabled: true,
    }),
    { ok: false, status: 401, error: "Sign in to access Tours." }
  );
});

test("denies archived project access when an open project is required", () => {
  assert.deepEqual(
    evaluateToursAccess({
      user: { id: "user-1", app_metadata: { subscription_tier: "pro" } },
      isToursEnabled: true,
      requireProject: true,
      requireOpenProject: true,
      project: { id: "project-1", status: "archived" },
    }),
    { ok: false, status: 409, error: "Archived Tour Projects cannot be modified." }
  );
});
