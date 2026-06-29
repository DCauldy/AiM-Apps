# Tour Project Render Dev Tool PRD

## Status

Issue-ready PRD for a focused V1. This document is organized so a later `to-issues`
pass can split it into vertical tracer-bullet issues with clear dependencies.

This is the source document for the focused Tour Project render dev tool V1. Do
not use the deprecated `docs/tour-render-options-and-devtool-prd.md` as source
material for issue generation; it mixes older provider-settings ideas with
dev-tool ideas and may not match the current render pipeline.

## Goal

Give QA and developers a safe, visible way to run Tour Project render experiments
without editing code, changing Trigger.dev worker environment variables, or
regenerating the whole pipeline for every test.

The tool should expose only the render controls needed to test:

- Render mode: `ken_burns_ffmpeg` or `provider_image_to_video`.
- Provider image-to-video model id for scene clips.
- Script planning model id.
- Per-run reuse intent for supported generated asset classes.
- Provider-spend risk before starting a run.
- Run investigation details after a run exists.

## Non-Goals

The V1 is not a customer-facing render settings product and not a general render
console. It must not expose raw provider secrets, avatar internals, final mux
settings, Trigger.dev queue settings, or arbitrary JSON editing.

Selected scene clip regeneration and full pre-run prompt preview are Phase 2.

## Current State

The render pipeline already has most of the server-side shape needed for this
tool:

- `TourRenderOptions` exists as the per-run options type.
- The Tour Project render-run API accepts an optional `options` object.
- `createTourRenderRun` merges incoming options with default render options.
- Render options are persisted on `tour_render_runs.options`.
- Trigger.dev receives the resolved options in the render task payload.
- The render-run status response already includes `triggerRunId`.
- The product fresh-render path already submits `reuseExistingAssets: false`.
- Project voice/avatar settings are merged server-side before a run starts.

The key gaps are:

- The render-run API currently accepts option-shaped data through a runtime cast
  instead of validating the supported dev-tool subset.
- QA has no guided UI for per-run render experiments.
- Cost/provider-spend risk is not visible before starting a run.
- Run details do not yet present a compact copyable investigation packet.
- The dev-tool environment gate and Tour Project page scope need a clear shared
  helper and server-authored availability signal.

## V1 Scope

Build an internal-only Tour Project render dev tool on Tour Project
workspace/editor pages. It should be available only in local development and
Vercel Preview, hidden in Vercel Production, and hidden in local production
builds unless a future explicit opt-in flag is added.

V1 delivers this workflow:

1. QA opens a Tour Project workspace/editor page.
2. If the environment allows the tool, a compact internal-only launcher button
   appears fixed near the bottom of the viewport.
3. The collapsed launcher shows or exposes the current low/moderate/high
   provider-spend risk.
4. QA opens a popover/modal-style dev-tool panel from that launcher and chooses
   a preset recipe.
5. QA optionally adjusts advanced controls for supported options.
6. The panel shows the estimated provider calls and reasons.
7. QA starts the run through the existing product render-run endpoint.
8. The normal render-run status, persistence, polling, and Trigger.dev flow stay
   unchanged.
9. After a run exists, QA can copy a compact bug-report packet with run context.

## V1 User Stories

US-01: As a QA person, I want to see the render dev tool only in development and
Vercel Preview, so hidden render controls are not exposed in production.

US-02: As a developer, I want the dev tool to appear only on Tour Project
workspace/editor pages, so experimental settings stay attached to the project
they affect.

US-03: As a QA person, I want a compact bottom launcher that shows or exposes
provider-spend risk, so I can see cost risk before opening the popover/modal.

US-04: As a product owner, I want the tool to look unmistakably internal, so
preview reviewers understand it is QA/dev infrastructure rather than product UI.

US-05: As a QA person, I want preset run recipes to be the primary workflow, so I
can choose a debugging intent without configuring every option manually.

US-06: As a QA person, I want advanced controls for render mode, provider scene
clip model id, script planning model id, and reuse toggles, so I can make custom
run configurations when presets are not enough.

US-07: As a QA person, I want toggle-on to mean "reuse this asset", so reuse
controls match the mental model of saving time and spend.

US-08: As a QA person, I want to compare Ken Burns FFmpeg with provider
image-to-video/Kling-style rendering, so I can choose cheaper UX tests or
higher-quality provider tests without code changes.

US-09: As a QA person, I want to override the script planning model id, so I can
compare planning quality and regressions on the same Tour Project.

US-10: As a QA person, I want to override the provider scene clip model id for
provider image-to-video runs, so I can compare model quality without changing
environment variables.

US-11: As a developer, I want dev-tool runs to use the existing render-run API,
so render history, persistence, polling, and Trigger.dev orchestration stay
unchanged.

US-12: As a developer, I want the dev-tool option contract validated at the API
boundary, so malformed modes, reuse flags, or model ids cannot create confusing
render runs.

US-13: As a developer, I want submitted options to persist on the render run, so
later debugging can identify what produced an output.

US-14: As a QA person, I want an estimate of likely provider calls before
starting, so I can avoid accidentally triggering expensive provider work.

US-15: As a developer, I want the estimate to explain why providers are expected
or not expected, so QA can reason about cost differences.

US-16: As a QA person, I want the parent Trigger.dev run id visible when
available, so I can hand engineers the exact job identifier for investigation.

US-17: As an engineer, I want a compact bug-report export with project id, render
run id, Trigger.dev run id, status/error, submitted options, and estimate
summary, so I can jump to the relevant records and logs.

US-18: As a maintainer, I want option building, preset mapping, cost estimation,
and environment gating isolated in small helpers, so the workspace UI does not
become harder to reason about.

## Phase 2 Stories

P2-01: As a QA person, I want selected scene clip regeneration, so I can
regenerate one or a few bad scene clips without rerunning every scene clip.

P2-02: As a QA person, I want pre-run prompt preview, so I can inspect script and
scene clip prompts before spending render time.

P2-03: As a client-facing reviewer in a Vercel Preview environment, I want prompt
preview, so I can understand what the system is asking models to do without code
access.

P2-04: As an engineer, I want child Trigger.dev run ids for scene clip/avatar
work if they can be persisted cleanly, so deeper investigations can jump to
child jobs.

## Decisions

### Availability

- The dev tool is available when `NODE_ENV === "development"` or
  `VERCEL_ENV === "preview"`.
- The dev tool is disabled when `VERCEL_ENV === "production"`.
- Local production builds hide the dev tool by default.
- Any future local production QA access requires a separate explicit opt-in flag.
- Availability should be centralized behind a small helper.
- Tour Project UI should receive a server-authored or build-time reliable
  availability signal. It should not reveal the tool through client-only state.

### Page Scope

- The dev tool appears only on Tour Project workspace/editor pages.
- It does not appear on the Tours dashboard, app picker, admin screens, or
  non-Tours apps.
- The tool does not replace normal product render controls.

### Visual Treatment

- The collapsed affordance is a compact fixed bottom-of-viewport launcher button,
  preferably bottom-right unless the Tour Project layout requires a safer
  collision-free placement.
- Activating the launcher opens a contained popover/modal-style dev-tool panel
  anchored visually to the launcher. Do not render the dev tool as a normal
  in-page product section.
- The expanded popover/modal surface has an unmistakable internal-only
  construction/caution treatment, including a yellow dotted border on the outer
  dev-tool surface.
- Internal-only styling applies only to the dev-tool launcher and popover/modal
  shell, not the surrounding customer workspace.
- The label should use plain language such as "Dev Tool", "QA Render Lab", or
  "Construction Mode", with "Preview/dev only" where space allows.

### Controls

- Presets are the primary interaction.
- Advanced controls expose the same underlying options for custom cases.
- V1 advanced controls are limited to:
  - Render mode.
  - Provider scene clip model id.
  - Script planning model id.
  - Supported global reuse flags.
- Blank model id inputs mean "omit override and use backend defaults".
- Provider scene clip model id is relevant only for
  `provider_image_to_video` runs and should be visually tied to that mode.
- Toggle-on means reuse; toggle-off means regenerate.

### Supported Asset Reuse Flags

V1 exposes the currently supported reuse contract:

- `scriptPlan`
- `voiceover`
- `avatar`
- `sceneClips`
- `finalVideo`

Transition reuse is not in V1 unless the backend contract adds a named
`transitions` reuse flag first. Do not hide transition reuse under the voiceover
flag in the UI.

### Backend Contract

- The dev tool submits through the existing product render-run endpoint with an
  `options` object.
- The tool must not create a parallel Trigger.dev entry point.
- The API should validate the dev-tool-supported subset of `TourRenderOptions`.
- Validation should reject unsupported render modes and malformed reuse/model
  fields before a run is created.
- Project settings for ElevenLabs voice and HeyGen avatar remain server-owned
  merge behavior. The dev tool should not duplicate identity-setting logic in
  the client.
- Normal product render still sends no explicit dev-tool options.
- Product fresh-render behavior remains unchanged.

### Prompt Preview

Full pre-run prompt preview is Phase 2. V1 may show prompt artifacts only if they
are already available from run metadata/assets or existing pure helpers. If those
artifacts are unavailable, the UI should show a clear unavailable state rather
than blocking the dev tool.

### Investigation

- Parent Trigger.dev run id is V1 when available.
- Child Trigger.dev run ids are Phase 2 unless already persisted cleanly.
- The compact bug-report export should be copyable Markdown or plain text.
- A more polished investigation packet workflow is out of scope for V1.

## Preset Run Recipes

Presets should express QA intent. Advanced controls may modify a preset, and the
UI should indicate when a run configuration has become custom.

### Reuse Everything Possible

Use the reusable path and request reuse for every supported asset class.

```json
{
  "options": {
    "reuseExistingAssets": true,
    "reuse": {
      "scriptPlan": true,
      "voiceover": true,
      "avatar": true,
      "sceneClips": true,
      "finalVideo": true
    }
  }
}
```

### Regenerate Scene Clips

Reuse script plan, voiceover, and avatar. Regenerate scene clips and final video.

### Regenerate Final Video

Reuse script plan, voiceover, avatar, and scene clips. Regenerate final video.

### Cheap Ken Burns UX Test

Set `renderMode` to `ken_burns_ffmpeg`. Default to regenerating scene clips and
final video without provider image-to-video spend.

### Provider Image-To-Video Quality Experiment

Set `renderMode` to `provider_image_to_video`. Expose
`sceneClipProviderModelId`. Default to regenerating scene clips and final video.

```json
{
  "options": {
    "renderMode": "provider_image_to_video",
    "sceneClipProviderModelId": "kwaivgi/kling-v3.0-std",
    "reuseExistingAssets": true,
    "reuse": {
      "scriptPlan": true,
      "voiceover": true,
      "avatar": true,
      "sceneClips": false,
      "finalVideo": false
    }
  }
}
```

### Script Model Experiment

Set or override `scriptPlanningModelId`. Default to regenerating script plan and
downstream dependent assets.

### Full Fresh Render

Use product fresh-render semantics for comparison and smoke testing. Submit
`reuseExistingAssets: false` and all supported `reuse` flags as `false`.

```json
{
  "options": {
    "reuseExistingAssets": false,
    "reuse": {
      "scriptPlan": false,
      "voiceover": false,
      "avatar": false,
      "sceneClips": false,
      "finalVideo": false
    }
  }
}
```

## Phase 2 Contract Candidate

Selected scene clip regeneration requires an explicit backend contract before UI
controls are added.

```json
{
  "options": {
    "reuseExistingAssets": true,
    "reuse": {
      "scriptPlan": true,
      "voiceover": true,
      "avatar": true,
      "sceneClips": true,
      "finalVideo": false
    },
    "sceneClipRegeneration": {
      "mode": "selected",
      "sceneIds": ["scene-id-1", "scene-id-2"]
    }
  }
}
```

This shape is only a candidate. It should be implemented only if the pipeline can
express selected scene regeneration cleanly without overloading the global
`reuse.sceneClips` flag.

## Provider-Spend Estimate

The estimate is a required V1 feature. It is not an exact billing promise. It is
a pre-run explanation of cheap, moderate, or expensive provider-spend risk.

The collapsed bottom launcher shows or exposes the risk label. The expanded
popover/modal panel shows provider-call reasons.

V1 risk labels:

- Low provider spend.
- Moderate provider spend.
- High provider spend.

V1 estimate inputs:

- Included scene count.
- Expected number of regenerated scene clips.
- Selected render mode.
- Selected provider scene clip model id, when relevant.
- Selected reuse flags.
- Project tour type.
- Whether script planning is expected.
- Whether voiceover is expected.
- Whether avatar generation is expected.
- Whether final muxing is local-only.

V1 provider-call reasons should mention:

- OpenRouter script planning.
- OpenRouter provider image-to-video scene clips.
- ElevenLabs voiceover.
- HeyGen avatar generation.
- Local Ken Burns scene clip generation.
- Local final muxing.

If reusable asset availability is unknown before the run, the estimate should
distinguish requested reuse from confirmed reusable assets only when the backend
can provide that distinction. Exact dollar pricing can be added later if reliable
provider/model pricing exists in code.

## Bug-Report Export

The compact export should be optimized for pasting into Slack, Linear, GitHub,
or a support thread.

V1 fields:

- Project id.
- Render run id.
- Parent Trigger.dev run id, when available.
- Status, current step, error message, and result asset id.
- Submitted render options.
- Effective render mode and reuse settings.
- Selected provider scene clip model id, when relevant.
- Provider-spend estimate summary.

The export may start as a copyable Markdown or JSON block. Do not design a
larger packet workflow in V1.

## Architecture Requirements

- Keep option building in a small pure helper.
- Keep preset-to-options mapping in a small pure helper.
- Keep provider-spend estimation in a small helper or service.
- Keep environment availability in a small helper.
- Keep bug-report export formatting in a small pure helper.
- Keep the UI shell focused and visually secondary to the normal project
  workflow.
- Avoid expanding large workspace components. If wiring into an existing
  component makes it harder to read, extract a focused component.
- Prefer tests around helpers and request/response behavior over tests that
  couple to internal component structure.

## V1 Acceptance Criteria

### Availability And Placement

- The dev tool is hidden when `VERCEL_ENV === "production"`.
- The dev tool is hidden in local production builds by default.
- The dev tool is visible on Tour Project workspace/editor pages when
  `NODE_ENV === "development"` or `VERCEL_ENV === "preview"`.
- The dev tool is not visible on the Tours dashboard, app picker, admin screens,
  or non-Tours apps.
- Availability is determined through a centralized helper and a reliable
  server-authored or build-time signal.

### UI And Workflow

- The collapsed bottom launcher shows or exposes a low/moderate/high
  provider-spend estimate.
- The expanded popover/modal panel shows provider-call reasons for the selected
  preset/options.
- The dev-tool popover/modal shell uses an unmistakable internal-only visual
  treatment, including a yellow dotted border on its outer surface.
- The internal-only treatment does not style the surrounding customer workspace.
- Presets are selectable as the primary workflow.
- Advanced controls can set render mode, provider scene clip model id, script
  planning model id, and supported global reuse flags.
- The UI makes custom configurations clear after manual changes to a preset.

### Payloads And Validation

- Presets produce deterministic `TourRenderOptions` payloads.
- Blank script planning model id is omitted from the submitted options.
- Blank provider scene clip model id is omitted from the submitted options.
- The full fresh render preset submits `reuseExistingAssets: false` with all
  supported `reuse` flags set to `false`.
- Normal product render still sends no explicit dev-tool options.
- Product fresh-render behavior remains unchanged.
- Invalid render modes are rejected before a render run is created.
- Malformed reuse values are rejected before a render run is created.
- Submitted dev-tool options persist on the render run through the existing
  render-run persistence path.

### Investigation

- Parent Trigger.dev run id is visible in run details when available.
- Submitted/effective options are visible in dev-tool run details or the
  bug-report export.
- Compact bug-report export includes project id, run id, parent Trigger.dev run
  id when available, status/error, submitted options, and estimate summary.

### Explicitly Not Required For V1

- Selected scene clip regeneration.
- Full pre-run prompt preview.
- Child Trigger.dev run id persistence if those ids are not already available.
- Exact provider billing estimates.
- Supabase schema changes or migrations.

## Testing Plan

Use Vitest and existing repo test patterns. Do not use Jest-only flags.

Recommended V1 tests:

- Environment helper covers development, Vercel Preview, Vercel Production, and
  local production cases.
- Render-options builder covers default toggles, disabled toggles, blank model
  ids, explicit model ids, and both render modes.
- Preset-to-options mapping covers every preset.
- Full fresh render preset emits `reuseExistingAssets: false` and all supported
  `reuse` flags as `false`.
- Provider-spend estimator covers cheap reuse, full scene regeneration, Ken Burns
  scene regeneration, provider image-to-video regeneration, voiceover tours, and
  avatar tours.
- Collapsed bottom launcher renders or exposes the estimate summary.
- Dev-tool shell renders internal-only styling without leaking into production
  rendering.
- Dev-tool submit path posts the expected `options` payload.
- Normal product render path still sends no dev-tool overrides.
- Product fresh render path still sends the established fresh-render options.
- API boundary accepts supported dev-tool payloads.
- API boundary rejects invalid render modes and malformed reuse values.
- Run details or export includes Trigger.dev run id when present.
- Bug-report export includes project id, run id, Trigger.dev run id, status,
  error, submitted options, and estimate summary.
- Prompt artifact display, if included in V1, shows only already-available prompt
  metadata/assets and has a clear unavailable state.

## Out Of Scope

- Exposing ElevenLabs voice settings, HeyGen avatar provider/key controls,
  avatar generation/compositing settings, transition detection model controls,
  final render settings, final mux settings, or raw JSON editing.
- Final render controls such as dimensions, video codec, audio codec, FFmpeg
  preset, CRF, and audio bitrate.
- Avatar controls such as provider/key selection, avatar id, canvas, avatar size
  preset, positioning defaults, generation format/resolution/engine,
  alpha-analysis cadence, or frame-check timestamps.
- Creating a full render-options console.
- Creating new Supabase tables or migrations.
- Changing provider API key storage.
- Changing Trigger.dev queue concurrency or task duration.
- Changing default product render buttons beyond allowing the dev tool to submit
  explicit options.
- Exposing the dev tool in production.
- Guaranteeing exact provider billing.
- Selected scene clip regeneration in V1.
- Full pre-run prompt preview in V1.
- Child Trigger.dev run id persistence if those ids are not already available.
- Designing a polished long-term investigation packet workflow.

## Issue-Slicing Handoff

When this PRD is passed to `to-issues`, prefer vertical slices that are demoable
on their own and preserve the existing render-run flow. The first implementation
slice should establish the backend/client contract boundary before the UI submits
new option shapes.

Suggested dependency order:

1. Environment gate and Tour Project availability signal.
2. Dev-tool option validation and pure option/preset helpers.
3. Provider-spend estimator and collapsed bottom launcher risk summary.
4. Preset-first dev-tool panel with advanced controls and submit path.
5. Run investigation details and compact bug-report export.
6. Optional V1 prompt artifact display if existing metadata makes it cheap.

Likely HITL slices:

- Any decision to expose Phase 2 selected scene clip regeneration.
- Any decision to make prompt preview visible to client-facing preview reviewers.
- Any decision to add exact provider pricing or new persisted provider metadata.

Likely AFK slices:

- Environment gate and page-scope availability.
- Runtime validation for supported dev-tool options.
- Preset-to-options helper and tests.
- Provider-spend estimator and tests.
- Dev-tool bottom launcher and popover/modal integration.
- Bug-report export helper and UI.

## Implementation Notes

Build on the existing product render-run flow rather than creating a parallel
orchestration path. The main architectural risk is letting this become a grab bag
of render internals. Keeping V1 intentionally narrow gives the codebase a clean
place to grow later.

If implementation reveals a missing asset class in the reuse contract, add that
as a named backend contract improvement with tests before surfacing it in UI.
