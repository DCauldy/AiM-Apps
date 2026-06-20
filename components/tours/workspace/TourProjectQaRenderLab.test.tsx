import assert from "node:assert/strict";
import { afterEach, test, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import { TourProjectQaRenderLab } from "./TourProjectQaRenderLab";

if (!HTMLElement.prototype.hasPointerCapture) {
  HTMLElement.prototype.hasPointerCapture = () => false;
}

if (!HTMLElement.prototype.setPointerCapture) {
  HTMLElement.prototype.setPointerCapture = () => undefined;
}

if (!HTMLElement.prototype.releasePointerCapture) {
  HTMLElement.prototype.releasePointerCapture = () => undefined;
}

if (!HTMLElement.prototype.scrollIntoView) {
  HTMLElement.prototype.scrollIntoView = () => undefined;
}

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
  assert.ok(screen.getByRole("combobox", { name: "Render preset" }));
  assert.ok(screen.getByRole("button", { name: /Start preset run/ }));
});

test("submits the selected preset through the provided dev-tool callback", async () => {
  const user = userEvent.setup();
  const onSubmitPreset = vi.fn();

  render(<TourProjectQaRenderLab isAvailable onSubmitPreset={onSubmitPreset} />);

  await user.click(screen.getByRole("button", { name: "QA Render Lab" }));
  await user.click(screen.getByRole("combobox", { name: "Render preset" }));
  await user.click(screen.getByRole("option", { name: "Regenerate final video" }));
  await user.click(screen.getByRole("button", { name: /Start preset run/ }));

  assert.equal(onSubmitPreset.mock.calls.length, 1);
  assert.equal(onSubmitPreset.mock.calls[0]?.[0], "regenerate_final_video");
});
