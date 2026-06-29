import assert from "node:assert/strict";
import { describe, test } from "vitest";

import { isTourRenderDevToolAvailable } from "./availability";

describe("Tour render dev-tool availability", () => {
  test("allows local development", () => {
    assert.equal(
      isTourRenderDevToolAvailable({ nodeEnv: "development" }),
      true
    );
  });

  test("allows Vercel Preview", () => {
    assert.equal(
      isTourRenderDevToolAvailable({ nodeEnv: "production", vercelEnv: "preview" }),
      true
    );
  });

  test("hides in Vercel production", () => {
    assert.equal(
      isTourRenderDevToolAvailable({ nodeEnv: "development", vercelEnv: "production" }),
      false
    );
  });

  test("hides in local production builds by default", () => {
    assert.equal(
      isTourRenderDevToolAvailable({ nodeEnv: "production" }),
      false
    );
  });
});
