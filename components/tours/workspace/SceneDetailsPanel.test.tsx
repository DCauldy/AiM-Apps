import assert from "node:assert/strict";
import { afterEach, test } from "vitest";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import type { TourScene, TourSceneFact } from "@/lib/tours/workspace";
import { SceneDetailsPanel } from "./SceneDetailsPanel";

type SourcePhoto = TourScene["sourcePhotos"][number];

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

afterEach(() => cleanup());

function photo(id: string, fileName = `${id}.jpg`): SourcePhoto {
  return {
    id,
    fileName,
    storagePath: `projects/project-1/${fileName}`,
    contentType: "image/jpeg",
    previewUrl: `https://example.test/${fileName}`,
  };
}

function fact(id: string, text = `Fact ${id}`): TourSceneFact {
  return {
    id,
    text,
    sourceType: "human",
    sourceLabel: "Agent entry",
    sourcePhotoId: null,
    proofStatus: "proofed",
    sortOrder: Number(id.replace(/\D/g, "")) || 0,
  };
}

function scene(overrides: Partial<TourScene> = {}): TourScene {
  const authoritativePhoto = photo("primary", "primary-source.jpg");
  return {
    id: "scene-1",
    title: "Kitchen",
    sortOrder: 0,
    included: true,
    cameraMotion: "slow_push",
    transitionEffect: "swipe-on-top",
    authoritativePhoto,
    sourcePhotos: [authoritativePhoto],
    facts: [],
    hasProofedContext: false,
    status: "ready",
    ...overrides,
  };
}

test("renders active scene heading without duplicating image state", () => {
  const displayPhoto = photo("display", "display-angle.jpg");

  render(
    <SceneDetailsPanel
      activeScene={scene({ sourcePhotos: [photo("primary", "primary-source.jpg"), displayPhoto] })}
      displayPhoto={displayPhoto}
      sceneIndex={2}
      onAddScene={() => {}}
    />
  );

  assert.ok(screen.getByRole("heading", { name: "Kitchen" }));
  assert.ok(screen.getByText("Scene 3"));
  assert.ok(screen.getByLabelText("Camera motion"));
  assert.ok(screen.getByText("Slow push"));
  assert.ok(screen.getByLabelText("Scene transition"));
  assert.ok(screen.getByText("Swipe on top"));
  assert.equal(screen.queryByText("Scene/image description"), null);
  assert.equal(screen.queryByText("Primary source image: primary-source.jpg"), null);
  assert.equal(screen.queryByText("Viewing display image: display-angle.jpg"), null);
});

test("updates camera motion from the dropdown", async () => {
  const user = userEvent.setup();
  const updates: string[] = [];

  render(
    <SceneDetailsPanel
      activeScene={scene({ cameraMotion: "auto" })}
      displayPhoto={null}
      sceneIndex={0}
      onAddScene={() => {}}
      onCameraMotionChange={(cameraMotion) => {
        updates.push(cameraMotion);
      }}
    />
  );

  await user.click(screen.getByLabelText("Camera motion"));
  await user.click(screen.getByRole("option", { name: "Hero reveal" }));

  assert.deepEqual(updates, ["hero_reveal"]);
});

test("surfaces scene transition options in the dropdown", async () => {
  const user = userEvent.setup();

  render(
    <SceneDetailsPanel
      activeScene={scene()}
      displayPhoto={null}
      sceneIndex={0}
      onAddScene={() => {}}
      onTransitionEffectChange={() => {}}
    />
  );

  await user.click(screen.getByLabelText("Scene transition"));

  assert.ok(screen.getByRole("option", { name: "Swipe on top" }));
  assert.ok(screen.getByRole("option", { name: "Cross dissolve" }));
  assert.ok(screen.queryByRole("option", { name: "Light leak" }) === null);
});

test("does not render skipped scene status copy in the compact details panel", () => {
  render(
    <SceneDetailsPanel
      activeScene={scene({ included: false })}
      displayPhoto={null}
      sceneIndex={0}
      onAddScene={() => {}}
    />
  );

  assert.ok(screen.getByRole("heading", { name: "Kitchen" }));
  assert.equal(screen.queryByText("Skipped from the approval workflow."), null);
});

test("renders empty-scene add affordance", async () => {
  const user = userEvent.setup();
  let addSceneClicks = 0;

  render(
    <SceneDetailsPanel
      activeScene={null}
      displayPhoto={null}
      sceneIndex={-1}
      onAddScene={() => {
        addSceneClicks += 1;
      }}
    />
  );

  await user.click(screen.getByRole("button", { name: "Add first scene" }));

  assert.equal(addSceneClicks, 1);
});

test("submits a non-empty fact with Enter and clears after success", async () => {
  const user = userEvent.setup();
  const submittedFacts: string[] = [];

  render(
    <SceneDetailsPanel
      activeScene={scene()}
      displayPhoto={null}
      sceneIndex={0}
      onAddScene={() => {}}
      onCreateFact={async (text) => {
        submittedFacts.push(text);
      }}
    />
  );

  const textarea = screen.getByLabelText("Proofed scene facts");
  await user.type(textarea, "  Quartz counters{Enter}");

  await waitFor(() => assert.deepEqual(submittedFacts, ["Quartz counters"]));
  assert.equal((textarea as HTMLTextAreaElement).value, "");
});

test("allows Shift+Enter line breaks and supports visible submit control", async () => {
  const user = userEvent.setup();
  const submittedFacts: string[] = [];

  render(
    <SceneDetailsPanel
      activeScene={scene()}
      displayPhoto={null}
      sceneIndex={0}
      onAddScene={() => {}}
      onCreateFact={(text) => {
        submittedFacts.push(text);
      }}
    />
  );

  const textarea = screen.getByLabelText("Proofed scene facts");
  await user.type(textarea, "Line one{Shift>}{Enter}{/Shift}Line two");
  assert.equal((textarea as HTMLTextAreaElement).value, "Line one\nLine two");

  await user.click(screen.getByRole("button", { name: /add fact/i }));

  assert.deepEqual(submittedFacts, ["Line one\nLine two"]);
});

test("renders empty, error, pending, and long-list states without hiding scene heading", () => {
  const longFacts = Array.from({ length: 12 }, (_, index) => fact(`fact-${index + 1}`, `Proofed fact ${index + 1}`));

  render(
    <SceneDetailsPanel
      activeScene={scene({ facts: longFacts })}
      displayPhoto={null}
      sceneIndex={0}
      isSubmittingFact
      factError={new Error("Could not save the scene fact.")}
      onAddScene={() => {}}
    />
  );

  assert.ok(screen.getByRole("heading", { name: "Kitchen" }));
  assert.ok(screen.getByText("Adding"));
  assert.ok(screen.getByText("Could not save the scene fact."));
  assert.ok(screen.getByText("Proofed fact 12"));
  assert.equal(screen.getAllByLabelText("Approved fact").length, 12);
  assert.equal(screen.queryByText(/Human-entered/), null);
  assert.match(screen.getByTestId("scene-fact-list").className, /max-h-48/);
  assert.match(screen.getByTestId("scene-fact-list").className, /overflow-y-auto/);
});

test("renders only facts for the selected scene after scene switching", () => {
  const { rerender } = render(
    <SceneDetailsPanel
      activeScene={scene({ id: "scene-1", title: "Kitchen", facts: [fact("fact-1", "Island seating")] })}
      displayPhoto={null}
      sceneIndex={0}
      onAddScene={() => {}}
    />
  );

  assert.ok(screen.getByText("Island seating"));

  rerender(
    <SceneDetailsPanel
      activeScene={scene({ id: "scene-2", title: "Bedroom", facts: [fact("fact-2", "Walk-in closet")] })}
      displayPhoto={null}
      sceneIndex={1}
      onAddScene={() => {}}
    />
  );

  assert.ok(screen.getByRole("heading", { name: "Bedroom" }));
  assert.ok(screen.getByText("Walk-in closet"));
  assert.equal(screen.queryByText("Island seating"), null);
});

test("opens fact item actions from a top-right menu and confirms edit/delete dialogs", async () => {
  const user = userEvent.setup();
  const updates: Array<{ factId: string; text: string }> = [];
  const deletes: string[] = [];

  render(
    <SceneDetailsPanel
      activeScene={scene({ facts: [fact("fact-1", "Island seating")] })}
      displayPhoto={null}
      sceneIndex={0}
      onAddScene={() => {}}
      onUpdateFact={async (factId, text) => {
        updates.push({ factId, text });
      }}
      onDeleteFact={async (factId) => {
        deletes.push(factId);
      }}
    />
  );

  await user.click(screen.getByRole("button", { name: "Open actions for Island seating" }));
  await user.click(screen.getByText("Edit"));
  await user.clear(screen.getByLabelText("Fact"));
  await user.type(screen.getByLabelText("Fact"), "Island breakfast seating");
  await user.click(screen.getByRole("button", { name: "Save fact" }));

  await waitFor(() => assert.deepEqual(updates, [{ factId: "fact-1", text: "Island breakfast seating" }]));

  await user.click(screen.getByRole("button", { name: "Open actions for Island seating" }));
  await user.click(screen.getByText("Delete"));
  assert.ok(screen.getByRole("heading", { name: "Delete approved fact?" }));
  await user.click(screen.getByRole("button", { name: "Delete fact" }));

  await waitFor(() => assert.deepEqual(deletes, ["fact-1"]));
});

test("renders fact empty state", () => {
  render(
    <SceneDetailsPanel
      activeScene={scene()}
      displayPhoto={null}
      sceneIndex={0}
      onAddScene={() => {}}
    />
  );

  assert.ok(screen.getByText("No scene facts yet."));
});
