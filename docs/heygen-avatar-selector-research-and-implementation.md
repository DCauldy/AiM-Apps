# HeyGen Avatar Selector Research And Implementation Suggestion

## Status

Research and implementation suggestion only. No code changes are proposed here as completed work.

## Problem

Tour projects currently persist `elevenlabs_voice_id`, but not the HeyGen avatar choice or avatar placement. Avatar render support exists lower in the render pipeline through per-run options and environment fallback, but project create/edit flows cannot collect or persist the avatar selection.

For `tour_video_avatar`, the app should require:

- an ElevenLabs voice id
- a HeyGen avatar id
- avatar positioning coordinates for the 9:16 output frame

Those values should be stored on the project and used automatically when creating render runs.

## HeyGen API Research

HeyGen's current developer docs identify v3 as the active API surface. The relevant avatar selector endpoints are:

- `GET https://api.heygen.com/v3/avatars`
  Lists avatar groups, which are character identities. Supports `ownership`, `limit`, and cursor `token`.
- `GET https://api.heygen.com/v3/avatars/looks`
  Lists avatar looks, which are the actual selectable outfits/styles. Supports `group_id`, `avatar_type`, `ownership`, `limit`, and cursor `token`.
- `GET https://api.heygen.com/v3/avatars/looks/{look_id}`
  Fetches one look.
- `POST https://api.heygen.com/v3/videos`
  Creates the avatar video. For avatar renders, the `avatar_id` should be the avatar look `id`, not the group id.

The look response includes the fields needed for a selector:

- `id`: persist this as `heygen_avatar_id`
- `name`: display label
- `avatar_type`: `studio_avatar`, `digital_twin`, or `photo_avatar`
- `group_id`: optional grouping key
- `gender`: optional filter/display metadata
- `preview_image_url`: primary grid preview
- `preview_video_url`: optional richer preview
- `default_voice_id`: not needed for the current ElevenLabs-driven flow
- `tags`: searchable metadata
- `supported_api_engines`: useful later for engine selection
- `status`: use to filter private avatars to `completed`

### Suggested Selector Filters

To mirror the ElevenLabs voice selector behavior, the first implementation should only list the user's own HeyGen digital twin avatars, not public presets or photo avatars.

Call:

```text
GET https://api.heygen.com/v3/avatars/looks?ownership=private&avatar_type=digital_twin&limit=50
```

Continue pagination while `has_more` is true:

```text
GET https://api.heygen.com/v3/avatars/looks?ownership=private&avatar_type=digital_twin&limit=50&token=<next_token>
```

Recommended filter behavior:

- `ownership=private`: returns the authenticated user's own avatars. This is the HeyGen equivalent of filtering ElevenLabs to the user's own digital twin voices.
- `avatar_type=digital_twin`: returns avatars created from user video footage. Do not include `studio_avatar` or `photo_avatar` in the default selector.
- `limit=50`: use the maximum documented page size to reduce round trips.
- `token=<next_token>`: page through results until `has_more` is false, with a local safety cap.
- Client-side `status === "completed"` filter: HeyGen documents `status` as present for private avatars and values include `processing`, `completed`, and `failed`. Only show completed looks.

Do not use `GET /v3/avatars` for the main selector unless grouping by character becomes a UI requirement. The project must persist a look id from `/v3/avatars/looks`, because that look `id` is the value passed as `avatar_id` when creating videos.

Sources:

- HeyGen docs index: https://developers.heygen.com/llms.txt
- Avatar Looks guide: https://developers.heygen.com/docs/avatar-looks.md
- List Avatar Looks reference: https://developers.heygen.com/reference/list-avatar-looks.md
- List Avatar Groups reference: https://developers.heygen.com/reference/list-avatar-groups.md
- Create Video reference: https://developers.heygen.com/reference/create-video.md

## Current Repo State

Relevant existing pieces:

- `components/tours/CreateTourProjectForm.tsx` already shows the ElevenLabs voice selector when the selected type needs narration.
- `components/tours/workspace/WorkspacePresentation.tsx` has the edit-project dialog and voice selector for existing projects.
- `components/tours/workspace/ElevenLabsVoiceSelector.tsx` is the closest UI/module pattern.
- `app/api/apps/tours/voices/route.ts` reads the user-owned ElevenLabs API key and proxies provider voice listing.
- `app/api/apps/tours/projects/route.ts` persists `tour_type` and `elevenlabs_voice_id`.
- `app/api/apps/tours/projects/[projectId]/route.ts` updates project details and optional voice id.
- `lib/tours/workspace.ts` returns `elevenLabsVoiceId` in the workspace view model.
- `lib/tours/rendering/tour-render-project-settings.ts` only reads `elevenlabs_voice_id`.
- `lib/tours/rendering/tour-render-preflight.ts` requires avatar id only from per-run options or `HEYGEN_AVATAR_ID`.
- `lib/tours/rendering/tour-render-runs.ts` persists and sends render options to Trigger.dev, but does not merge project avatar settings.
- `lib/tours/rendering/generate-tour-project-video.ts` passes `input.options?.heyGenAvatarId` and `input.options?.heyGenAvatarPositioning` to `prepareHeyGenAvatarStage`.
- `lib/tours/rendering/tour-avatar.ts` already handles HeyGen generation, alpha analysis, placement, fingerprinting, reuse, and ffmpeg overlay planning.
- `docs/heygen-avatar-compositing-adr.md` contains the current accepted compositing constraints.

Existing docs note that provider browsing was out of scope for an earlier render-options PRD. This feature should explicitly supersede that non-goal for HeyGen avatar selection.

## Recommended Data Shape

Add project-level fields to `public.tours_projects`:

```sql
heygen_avatar_id text,
heygen_avatar_position jsonb
```

Recommended `heygen_avatar_position` shape:

```ts
type HeyGenAvatarProjectPosition = {
  frame: {
    width: 1080;
    height: 1920;
  };
  offsets: {
    top: number;
    left: number;
    bottom: number;
    right: number;
  };
};
```

Interpretation:

- Coordinates are stored against the final 9:16 frame.
- Values are pixel offsets in the 1080x1920 canonical frame.
- Negative values are allowed so the preview/avatar can extend past the frame for cropping.
- Keep all values bounded to a sane range, such as `-1920..1920`, to avoid unusable overlays.

Reasoning:

- The user request asks for top, left, bottom, and right offsets.
- The current render code internally wants a width plus margin/basis model. Store the user-facing crop offsets as the durable project preference, then add a small normalizer that converts this shape to `HeyGenAvatarPositioningInput` for the existing render stage.
- Keeping the raw 9:16 offsets lets the UI round-trip exactly without leaking compositor implementation details into the form.

Migration notes:

- Do not make the new database columns globally `not null`; non-avatar projects do not need them.
- Enforce avatar-required behavior in API validation and render preflight based on `tour_type = 'tour_video_avatar'`.
- If a migration is added during implementation, run it locally before marking implementation done, per repo instructions.

## Provider Module Plan

Build the HeyGen avatar listing module like the ElevenLabs voice module:

- Add `lib/tours/rendering/heygen-avatars.ts`.
- Add `HeyGenAvatarLook` type with normalized fields.
- Add `HeyGenAvatarsError` with provider failure and invalid-response codes.
- Add `listHeyGenDigitalTwinAvatarLooks({ apiKey, fetch })`.
- Request `/v3/avatars/looks?ownership=private&avatar_type=digital_twin&limit=50`.
- Page with `token` while `has_more` is true, with a local page cap.
- Filter out private looks where `status` exists and is not `completed`.
- Sort by name.

API route:

- Add `app/api/apps/tours/avatars/route.ts`.
- Require tours access.
- Read the user's stored `heygen` API key through `getUserApiKey`.
- Return `{ avatars: HeyGenAvatarLook[] }`.
- Return `422` when the user has no HeyGen key, matching the voice route behavior.

## UI Plan

Create `components/tours/workspace/HeyGenAvatarSelector.tsx`.

Behavior:

- It should not be a dropdown.
- The field surface should be a button/input-like control showing the selected preview image and avatar name.
- Clicking opens a media-browser panel inside the current create/edit modal.
- The panel shows avatar preview image cards with names and metadata.
- Selecting an avatar advances to, or enables, a positioning step.
- The positioning step uses a fixed 9:16 frame preview.
- The selected avatar preview can be dragged/resized beyond the frame bounds.
- Save records `heyGenAvatarId` and `heyGenAvatarPosition`.

### Suggested Positioning UX

The cleanest interaction is a two-step chooser inside the same create/edit modal, not a second modal stacked on top.

Recommended flow:

1. The project form shows an avatar field surface.
2. Clicking the field switches the current modal body from `project details` to `choose avatar`.
3. The user picks a completed private digital twin look from a media grid.
4. The same modal body advances to `position avatar`.
5. The user drags and resizes the avatar inside a 9:16 preview frame.
6. The user clicks `Use avatar`, which writes the avatar id and position into the parent form draft and returns to `project details`.
7. The project form save/create button persists the whole form.

Do not open a nested `Dialog` on top of the create/edit `Dialog` with the current UI primitive. `components/ui/dialog.tsx` portals each dialog to `document.body`, uses a fixed `z-50` layer, and directly toggles `document.body.style.overflow`. A child dialog can conflict with the parent overlay/focus behavior, and closing the child can reset body scrolling while the parent is still open. If stacked dialogs are ever required, add a real modal manager or move to a dialog primitive with stack-aware focus and scroll handling first.

External UI references support this constraint:

- WAI-ARIA's modal dialog pattern expects focus to stay inside the active dialog until it closes: https://www.w3.org/WAI/ARIA/apg/patterns/dialog-modal/
- Radix Dialog documents focus trapping and modal/non-modal modes, which is the kind of behavior a stack-aware primitive would need to manage: https://www.radix-ui.com/primitives/docs/components/dialog
- Floating UI's dialog guidance calls out dismissal, ARIA role, and focus management as core accessible dialog behavior: https://floating-ui.com/docs/dialog

Implementation shape:

```ts
type AvatarSelectorMode = "details" | "choose-avatar" | "position-avatar";

type AvatarPlacementDraft = {
  left: number;
  top: number;
  width: number;
  height: number;
};
```

Use local component state for the picker/positioner draft. Commit into the parent form only when the user clicks `Use avatar`; cancel/back should leave the previous form value untouched unless the user explicitly commits.

Recommended component split:

- `HeyGenAvatarField`: compact field shown in create/edit forms. Displays selected preview/name and opens selector mode.
- `HeyGenAvatarSelectorPanel`: owns the choose/position mode state.
- `HeyGenAvatarGrid`: fetches and renders the filtered avatar looks.
- `HeyGenAvatarPositioner`: contains the 9:16 frame, draggable/resizable avatar layer, and coordinate conversion helpers.

This keeps `CreateTourProjectForm.tsx` and `WorkspacePresentation.tsx` thin. `WorkspacePresentation.tsx` is already large, so do not place the picker or positioner implementation in that file.

### Coordinate Capture Model

Use a canonical 9:16 frame of `1080 x 1920` for all stored coordinates.

The positioner should render a responsive frame:

```css
aspect-ratio: 9 / 16;
```

Then convert between rendered CSS pixels and canonical coordinates:

```ts
const scaleX = 1080 / frameRect.width;
const scaleY = 1920 / frameRect.height;
const canonicalX = cssX * scaleX;
const canonicalY = cssY * scaleY;
```

The drag layer should be absolutely positioned relative to the frame. Let the avatar layer extend outside the frame by setting the outer frame to clip for visual preview while allowing the draggable layer state to move negative or beyond the frame bounds:

```css
.frame {
  position: relative;
  aspect-ratio: 9 / 16;
  overflow: hidden;
}

.avatarLayer {
  position: absolute;
  touch-action: none;
  cursor: grab;
}
```

Store offsets in the requested top/left/bottom/right shape:

```ts
const offsets = {
  top: Math.round(draft.top),
  left: Math.round(draft.left),
  bottom: Math.round(1920 - (draft.top + draft.height)),
  right: Math.round(1080 - (draft.left + draft.width)),
};
```

Negative offsets are valid and mean the avatar extends beyond the frame edge. Example: `bottom: -80` means the avatar extends 80 canonical pixels below the output frame and will be cropped by the final 9:16 composition.

Preserve the preview image aspect ratio while resizing. The simplest first version is:

- drag to move
- slider to scale avatar size
- optional corner handles after the slider version works

Suggested first-position defaults:

- avatar visible width around 35-45% of the 1080px frame
- bottom-right placement
- slight negative or small positive bottom offset depending on the preview asset

The original request mentions a "16 by 9 box", but the current tour output and compositing docs use vertical `9:16`. If horizontal output becomes a product requirement, parameterize the frame as `1920 x 1080`; do not bake horizontal assumptions into the avatar selector.

Implementation details:

- Use the HeyGen `preview_image_url` for selection and positioning preview.
- Store canonical 1080x1920 coordinates regardless of actual rendered CSS size.
- Convert pointer drag coordinates from CSS frame space to canonical frame space.
- Include numeric inputs for top/left/bottom/right after the first pass if precise QA requires them.
- Avoid putting this inside the existing select primitive because the desired interaction is a modal browser and crop/position editor.

Create form:

- Add local state for `heyGenAvatarId` and `heyGenAvatarPosition`.
- Show the selector only when `tourType === "tour_video_avatar"`.
- Clear avatar fields when switching away from avatar tour.
- Disable submit when avatar tour is selected and avatar/position is missing.
- Include fields in `CreateTourProjectInput`.

Edit form:

- Extend the project details state with `heyGenAvatarId` and `heyGenAvatarPosition`.
- Show selector for avatar projects.
- Save both fields through the existing project `PATCH`.

File-size note:

- `components/tours/workspace/WorkspacePresentation.tsx` is already large. If avatar UI pushes an app-related file over 1,000 lines during implementation, follow `docs/codebase-cleanliness.md` before finishing.

## API And Validation Plan

Create/update project schemas:

- Add optional normalized `heyGenAvatarId` string schema.
- Add `heyGenAvatarPosition` schema for canonical frame and bounded numeric offsets.
- For `tour_video_avatar`, require both avatar id and position.
- For non-avatar tour types, store `null` for both values.

Workspace model:

- Select and return `heygen_avatar_id` and `heygen_avatar_position`.
- Add `heyGenAvatarId` and `heyGenAvatarPosition` to `TourProjectWorkspaceViewModel.project`.

Project settings:

- Extend `TourRenderProjectSettings` to include avatar id and position.
- Read the new fields from `tours_projects`.

Preflight:

- Remove environment fallback as the primary application path for user-facing avatar tours.
- Check `options.heyGenAvatarId` or project settings.
- Add a blocking issue for missing avatar position, for example `missing_heygen_avatar_position`.
- Keep env fallback only if there is a deliberate dev-tool path that still needs it.

Render run creation:

- Merge project settings into render options before preflight/create run/Trigger payload.
- Use explicit per-run options as overrides.
- For avatar tours, pass resolved `heyGenAvatarId` and normalized `heyGenAvatarPositioning`.

## Position Normalization

Add a helper near render settings or avatar placement:

```ts
function resolveProjectAvatarPositionToRenderInput(
  position: HeyGenAvatarProjectPosition
): HeyGenAvatarPositioningInput
```

Suggested first-pass mapping:

- Use `basis: "visibleBoundingBox"` for final render quality while preview-image positioning is approximate.
- Derive `anchor` from the side with the smaller horizontal inset.
- Map right/bottom offsets to existing `rightMargin` and `bottomMargin` for the current compositor.
- Preserve the raw project offsets in render options or metadata so future compositor changes can use all four values directly.

Open implementation question:

- The existing compositor calculates placement after alpha analysis of the generated WebM. The UI only has a static preview image before generation. The first release should treat UI positioning as an approximate frame placement and let alpha-aware placement still refine the visible body. A later release can use generated avatar metadata or a provider preview video to make UI positioning closer to final output.

### Compatibility With Current Final Render Placement

The proposed UI output does not match the current render-stage input one-to-one.

Current render input:

```ts
type HeyGenAvatarPositioningInput = {
  anchor: "bottom-right" | "bottom-left";
  rightMargin: number;
  bottomMargin: number;
  basis: "videoLayer" | "visibleBoundingBox";
  alphaThreshold?: number;
};
```

Current render sizing is separate:

```ts
type HeyGenAvatarSize = "small" | "medium" | "large";
```

Those size presets map to visible avatar width ratios, currently `0.4`, `0.55`, and `0.7` of the output canvas width. The default positioning is bottom-right, `rightMargin: 0`, `bottomMargin: 0`, and `basis: "visibleBoundingBox"`.

Proposed UI output:

```ts
type HeyGenAvatarProjectPosition = {
  frame: { width: 1080; height: 1920 };
  offsets: {
    top: number;
    left: number;
    bottom: number;
    right: number;
  };
};
```

Conflicts:

- The UI captures a freeform rectangle. The current renderer only accepts bottom-left or bottom-right anchoring.
- The UI captures all four edges. The current renderer only consumes horizontal margin from the anchor side plus bottom margin.
- The UI can express top placement and arbitrary vertical crop. The current renderer always computes `overlayY` from the bottom edge.
- The UI rectangle includes scale through its width/height. The current renderer uses named size presets and calculates final `avatarWidth` from the generated WebM's visible alpha bounding box.
- The UI uses the provider preview image. The current renderer positions the generated transparent WebM after sampling its alpha channel, so preview-image bounds can differ from final visible body bounds.
- Negative UI offsets are natural for cropping. Current ffmpeg expression generation should be checked before passing negative margins directly because expressions such as `W-visibleRight--80` may be brittle.

Do not pass the stored top/left/bottom/right object directly as `heyGenAvatarPositioning`.

Recommended compatibility path:

1. Store the full UI rectangle as project truth.
2. Add a normalizer that maps the rectangle into the current `HeyGenAvatarPositioningInput`.
3. Derive `anchor` from the side the user placed the avatar near:
   - if `left <= right`, use `bottom-left`
   - otherwise use `bottom-right`
4. Use the matching side as the horizontal margin:
   - bottom-left: `rightMargin` currently acts like a left margin in render code; consider renaming later, but map `left` into it for now
   - bottom-right: map `right` into it
5. Map `bottom` into `bottomMargin`.
6. Derive closest `HeyGenAvatarSize` from the UI rectangle width:
   - visible width ratio = `draft.width / 1080`
   - choose nearest preset for `small`, `medium`, or `large`
7. Keep `basis: "visibleBoundingBox"` for final render quality unless exact layer placement is required.
8. Preserve the raw UI offsets in project settings and/or render metadata so a later compositor can support exact rectangle placement without losing user intent.

Longer-term cleanest implementation:

- Extend `HeyGenAvatarPositioningInput` with a new mode, for example:

```ts
type HeyGenAvatarPositioningInput =
  | {
      mode: "anchor-margin";
      anchor: "bottom-right" | "bottom-left";
      rightMargin: number;
      bottomMargin: number;
      basis: "videoLayer" | "visibleBoundingBox";
      alphaThreshold?: number;
    }
  | {
      mode: "frame-rectangle";
      frame: { width: 1080; height: 1920 };
      offsets: { top: number; left: number; bottom: number; right: number };
      basis: "videoLayer" | "visibleBoundingBox";
      alphaThreshold?: number;
    };
```

- Update `resolveHeyGenAvatarPlacement` to compute `avatarWidth`, `overlayX`, and `overlayY` from the rectangle mode directly.
- Keep the old anchor-margin mode for existing render runs and dev-tool options.

This avoids forcing a lossy UI-to-render conversion forever while keeping the first implementation small enough to land safely.

## Render Flow Changes

Current flow:

1. Project has `tour_type` and `elevenlabs_voice_id`.
2. Render run options may include `heyGenAvatarId` and `heyGenAvatarPositioning`.
3. Worker calls `prepareHeyGenAvatarStage`.
4. Avatar stage fingerprints the avatar id and positioning.
5. Final render composites the avatar overlay metadata.

Suggested flow:

1. Project stores voice id, avatar id, and avatar position.
2. Render run service resolves project settings.
3. Preflight validates required keys and project identity choices.
4. Render run options include resolved voice/avatar settings.
5. Trigger payload carries validated render options.
6. Worker uses the project-selected HeyGen avatar look id.
7. Avatar fingerprint includes avatar id and normalized position, so reuse is invalidated when placement changes.
8. Final render uses the generated avatar metadata as it does today.

## Testing Plan

Provider module:

- Lists private completed looks.
- Paginates with `next_token`.
- Rejects invalid provider responses.
- Handles non-OK provider responses with `HeyGenAvatarsError`.

API routes:

- `/api/apps/tours/avatars` returns normalized looks.
- Missing HeyGen key returns `422`.
- Project create rejects avatar tour without avatar id.
- Project create rejects avatar tour without avatar position.
- Project update rejects clearing avatar fields on avatar projects.
- Project update clears avatar fields when changing to non-avatar tour.

UI:

- Create form requires voice, avatar, and position for avatar tour.
- Edit form shows selected avatar and saves changed position.
- Selector opens modal instead of a dropdown.
- Position editor allows negative offsets for crop-outside-frame behavior.

Render/preflight:

- Preflight reports missing avatar id and missing position for avatar projects.
- Render run creation merges project avatar settings into stored run options.
- Trigger payload includes resolved avatar id and positioning.
- `generateTourProjectVideo` passes the resolved avatar options to `prepareHeyGenAvatarStage`.
- Avatar reuse changes when avatar id or position changes.

Suggested command shape:

```sh
npm test -- --run <relevant vitest files>
```

Do not use `--runInBand`; this repo uses Vitest, not Jest.

## Suggested Implementation Order

1. Add the migration and types for project-level avatar id/position.
2. Extend project create/update APIs and workspace/settings reads.
3. Add the HeyGen avatar listing module and `/api/apps/tours/avatars`.
4. Build `HeyGenAvatarSelector` with the modal browser and 9:16 positioning editor.
5. Wire selector into create and edit forms.
6. Merge project settings into render run options and preflight.
7. Add focused tests for provider listing, API validation, UI behavior, preflight, and Trigger payload options.
8. Run the new Supabase migration locally and run targeted Vitest coverage.

## Main Risks

- Preview-image positioning may not exactly match the generated transparent WebM because HeyGen can include transparent padding and alpha bounds vary by generated output.
- HeyGen public avatar result volume could make a naive modal slow; start with private avatars or capped pages, then add search/pagination UI.
- There are two concepts named avatar id in HeyGen docs: avatar group id and avatar look id. Persist the look id.
- Environment fallback for `HEYGEN_AVATAR_ID` can hide missing project settings in tests. Prefer explicit project settings for the app path.
