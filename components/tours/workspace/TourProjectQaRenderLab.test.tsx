import assert from "node:assert/strict";
import { afterEach, test } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import { TourProjectQaRenderLab } from "./TourProjectQaRenderLab";

afterEach(() => {
  cleanup();
});

test("does not render when the server-authored availability signal is false", () => {
  render(<TourProjectQaRenderLab isAvailable={false} />);

  assert.equal(screen.queryByRole("button", { name: "QA Render Lab" }), null);
});

test("renders a compact fixed launcher and dev-only popover when available", async () => {
  const user = userEvent.setup();

  render(<TourProjectQaRenderLab isAvailable />);

  const launcher = screen.getByRole("button", { name: "QA Render Lab" });
  assert.match(launcher.className, /border-dotted/);
  assert.match(screen.getByTestId("tour-project-qa-render-lab").className, /fixed/);

  await user.click(launcher);

  const panel = screen.getByRole("region", { name: "QA Render Lab" });
  assert.match(panel.className, /border-dotted/);
  assert.match(panel.className, /border-yellow-400/);
  assert.ok(screen.getByText("Preview/dev only"));
});
