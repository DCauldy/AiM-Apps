# Tour Project Render Dev Tool PRD

## Problem Statement

QA and developers need a safe, visible way to run Tours render experiments without editing code, changing worker environment variables, or regenerating the whole pipeline every time. Today the Tours workspace exposes a normal render path and a fresh render path, but the reusable render path does not let a tester choose which assets should be reused. Important render options such as render mode and script planning model also exist in the backend contract but are not surfaced in the project UI.

The immediate need is intentionally narrow: expose only the settings required to test render mode, provider video model quality, script planning model choice, and reuse behavior for the reusable generation path. This should live as a self-contained dev tool that only appears in local development and Vercel Preview environments, and only on Tour Project screens.

## Solution

Build a Tour Project render dev tool that appears in development and Vercel Preview environments. The tool lets a QA person or developer create a render run through the existing render-run flow with preset-first controls and advanced overrides:

1. Choose a preset run recipe for the most common QA/debugging paths.
2. Review an estimated provider spend/cost profile before starting the run.
3. Optionally open advanced settings to select render mode, choose the provider video model for image-to-video runs, choose reusable asset classes, target scene clip regeneration, and enter a script planning model id.
4. Inspect prompts, Trigger.dev job ids, and a compact bug-report export after a run exists.

The tool should not replace the normal product render controls. It should be clearly developer-facing, isolated from production, and implemented through a small boundary that prepares a `TourRenderOptions` payload and submits it to the existing render-run API.

The implementation should prefer improving code clarity around render options rather than adding one-off UI logic. If backend changes are needed, they should make the render options contract more explicit, easier to validate, and easier to test.

## User Stories

1. As a QA person, I want to see a render dev tool only in development and Vercel Preview, so that I can test hidden render behavior without exposing unfinished controls to production users.
2. As a developer, I want the dev tool to appear only on Tour Project screens, so that experimental render settings stay attached to the project they affect.
3. As a QA person, I want to select Ken Burns FFmpeg or provider image-to-video/Kling-style rendering, so that I can compare cheap local clip generation against higher-quality provider video without code changes.
4. As a developer, I want the render mode control to use the same allowed values as the backend, so that invalid modes cannot be submitted from the guided UI.
5. As a QA person, I want to enter a script planning model id, so that I can test model quality and regressions on the same project.
6. As a developer, I want the script planning model id to be optional, so that leaving it blank preserves the backend default.
7. As a QA person, I want a list of reusable asset toggles, so that I can decide which existing assets should be reused during a reusable render.
8. As a QA person, I want a toggle being on to mean “reuse this asset,” so that the reuse controls match the mental model of saving work and spend.
9. As a QA person, I want to reuse the script plan while regenerating scene clips, so that I can test visual output without changing narration planning.
10. As a QA person, I want to reuse script and voiceover while regenerating the final video, so that I can debug muxing or compositing without provider spend.
11. As a QA person, I want to reuse scene clips while regenerating only the final video, so that small final-render experiments are fast.
12. As a developer, I want the dev tool to submit through the existing render-run endpoint, so that render history, persistence, progress polling, and Trigger.dev orchestration stay unchanged.
13. As a developer, I want the submitted options to be persisted on the render run, so that later debugging can identify exactly which settings produced an output.
14. As a developer, I want render option construction isolated in a small helper, so that UI tests can assert payload behavior without rendering the whole workspace.
15. As a developer, I want the dev-only environment gate to be server-authored or build-time reliable, so that production cannot reveal the dev tool through client-side state alone.
16. As a product owner, I want this first version to stay narrow, so that future render settings can be added intentionally instead of creating a sprawling debug panel.
17. As a maintainer, I want any backend contract changes to improve validation and readability, so that the dev tool does not make the render pipeline harder to reason about.
18. As a QA person, I want preset run recipes to be the primary workflow, so that I can choose common debugging paths without manually configuring every toggle.
19. As a QA person, I want an advanced section for manual toggles, so that I can still create custom reuse/regeneration combinations when a preset is not enough.
20. As a QA person, I want to see a render cost or provider spend estimate before starting, so that I can avoid accidentally triggering expensive provider work.
21. As a developer, I want the spend estimate to explain which providers are expected to be called, so that QA understands why one run is more expensive than another.
22. As a QA person, I want advanced per-scene clip regeneration controls, so that I can regenerate one or a few bad scene clips without rerunning every scene clip.
23. As a QA person, I want to preview all prompts that will be sent to providers, so that I can validate script planning and scene clip instructions before spending render time.
24. As a client-facing reviewer in a preview environment, I want prompt preview, so that I can understand what the system is asking models to do without needing code access.
25. As a QA person, I want Trigger.dev task/job ids surfaced on render runs, so that I can hand engineers the exact job identifier for investigation.
26. As an engineer, I want bug reports to include Trigger.dev job ids, project id, run id, options, and render status, so that I can jump directly to the relevant logs and records.
27. As a QA person, I want a compact bug report export, so that I can paste a consistent investigation summary into Slack, Linear, GitHub, or a support thread.
28. As a QA person, I want a low-priority copy packet for run settings, project id, and final render payload, so that deeper investigations can include enough context without screenshots.
29. As a QA person, I want to switch the image-to-video provider model used for scene clips, so that I can compare Kling/model quality without changing code or environment variables.
30. As a QA person, I want the cost estimate to make Ken Burns vs provider image-to-video cost differences obvious, so that I can choose the cheaper render path for UX testing and the provider path for quality testing.

## Implementation Decisions

- The dev tool is available only when the app is running in local development or a Vercel Preview environment. It must not render in Vercel Production.
- The dev tool is scoped to Tour Project pages. It should not appear on the Tours dashboard, app picker, admin screens, or non-Tours apps.
- Preset run recipes are the primary interaction. Advanced controls expose the same underlying options for custom cases.
- The initial custom controls are limited to render mode, provider scene clip model id, reusable asset toggles, per-scene clip regeneration, and script planning model id.
- The first preset set should cover common QA intents: reuse everything possible, regenerate scene clips, regenerate selected scene clips, regenerate final video, cheap Ken Burns UX test, provider image-to-video/Kling quality experiment, script model experiment, and full fresh render.
- The render mode control uses the existing `TourRenderMode` values: `ken_burns_ffmpeg` and `provider_image_to_video`. The UI labels should use plain language such as “Ken Burns FFmpeg (cheap/local)” and “Provider image-to-video / Kling (quality/costly)” while preserving the backend values in the payload.
- The provider scene clip model id control should be in scope for provider image-to-video runs. It should default to the existing backend default when blank and should be visually tied to the provider/Kling render mode.
- The script planning model id control is a text input. Blank means “do not send an override.”
- The reusable asset controls are toggle rows where on means reuse and off means regenerate.
- Per-scene clip regeneration belongs in advanced settings. It should be modeled as an explicit scene-level override instead of overloading the global `reuse.sceneClips` flag in a way that hides intent.
- The reusable path should submit `reuseExistingAssets: true` plus a `reuse` object. This preserves the meaning of the normal reusable generation path while allowing per-asset overrides.
- The initial asset classes are script plan, voiceover, avatar, scene clips, and final video, matching the currently supported `reuse` contract.
- Transition assets are not part of this first UI unless the backend contract is expanded first. If transition reuse is added, it should be introduced as a named contract change rather than hidden under the voiceover flag.
- The dev tool should call the existing render-run POST endpoint with `options`, not a new Trigger.dev entry point.
- The API should continue to merge project settings for ElevenLabs voice, HeyGen avatar id, and HeyGen placement. The dev tool should not duplicate identity settings in this first version.
- The render cost/provider spend estimate is a must-have part of the dev tool. It can start as an estimate based on selected options, reusable asset intent, included scene count, avatar/voiceover requirements, and whether provider image-to-video is selected.
- The spend estimate should be explicit that it is an estimate. It should identify likely provider calls such as OpenRouter script planning, OpenRouter image-to-video scene clips, ElevenLabs voiceover, and HeyGen avatar generation.
- The spend estimate should explicitly call out that Ken Burns scene clip generation is local/cheaper while provider image-to-video/Kling scene clip generation can create provider spend per regenerated scene.
- Prompt preview should show every prompt the system can determine before or during a run, including script planning prompts and scene clip provider prompts. If a prompt depends on a generated intermediate artifact, the UI should explain when it becomes available.
- Trigger.dev task/job ids should be visible in run details whenever available. This includes the parent render task id and, if the data is available, child scene-clip/avatar task ids.
- Compact bug report export should collect the most useful investigation data in one copyable summary.
- Copying run settings, project id, and final render payload is useful but lower priority because the final shape needs more design. The first version may include a simple copyable JSON/Markdown block rather than a polished packet workflow.
- Any validation added at the API boundary should be reusable by future dev-tool options and should not live only in the component.
- Option-building should be extracted into a small, pure helper that can be tested independently.
- Preset-to-options mapping should be extracted into a small, pure helper so presets remain understandable and testable.
- Cost-estimate calculation should be isolated in a small helper or service. It should not be embedded directly in the component.
- Prompt preview construction should reuse existing prompt-building code where possible. If current prompt builders are buried inside provider adapters, extract small pure helpers rather than duplicating prompt text in the UI.
- The environment visibility decision should be centralized behind a small helper so future dev-only Tours controls use the same rule.
- The UI should be visually secondary to the normal project workflow. It can be a compact panel, disclosure, or developer section, but it should not look like the primary product action.
- The implementation should avoid expanding large workspace components unnecessarily. If wiring the tool into an existing file makes that file harder to read, extract a focused component.

## Preset Run Recipes

Presets should be the primary workflow because QA usually knows the debugging intent, not the exact option combination.

- Reuse everything possible: all reuse toggles on.
- Regenerate scene clips: reuse script plan, voiceover, and avatar; regenerate scene clips and final video.
- Regenerate selected scene clips: reuse global reusable assets, regenerate only selected scene clips, then regenerate final video.
- Regenerate final video: reuse script plan, voiceover, avatar, and scene clips; regenerate final video.
- Cheap Ken Burns UX test: set render mode to `ken_burns_ffmpeg`, default to regenerating scene clips and final video without provider image-to-video spend.
- Provider image-to-video / Kling quality experiment: set render mode to `provider_image_to_video`, expose `sceneClipProviderModelId`, and default to regenerating scene clips and final video.
- Script model experiment: set or override `scriptPlanningModelId`, default to regenerating script plan and downstream dependent assets.
- Full fresh render: mirror the existing fresh render behavior for comparison and smoke testing.

Advanced options should let QA inspect and modify the preset output before submitting. The UI should make it clear when a manual change has made the current run configuration custom.

## Render Cost And Provider Spend Estimate

The dev tool must show an estimate before starting a run. The goal is not perfect billing accuracy; the goal is to help QA understand whether a run is cheap, moderate, or expensive and which providers are likely to be called.

The estimate should include:

- Included scene count.
- Number of scene clips expected to regenerate.
- Whether OpenRouter script planning is expected.
- Whether OpenRouter provider image-to-video is expected, and which scene clip provider model id is selected.
- Whether ElevenLabs voiceover is expected.
- Whether HeyGen avatar generation is expected.
- Whether final muxing is local-only.
- A short explanation of why each provider is or is not expected to be called.

The estimate should account for selected reuse flags, selected scene clip regeneration overrides, project tour type, render mode, and selected provider scene clip model. If reusable asset availability is unknown before the run, the estimate should distinguish “requested reuse” from “confirmed reusable asset found” when the backend can provide that distinction.

## Prompt Preview

Prompt preview is a dev/QA feature, but it may also be valuable in client-facing preview reviews. It should remain behind the dev-tool environment gate.

The preview should include:

- Script planning prompt inputs and the final prompt payload shape that will be sent to the script planning provider.
- Scene clip provider prompts for each included scene when `provider_image_to_video` is selected.
- The selected scene clip provider model id when provider image-to-video is selected.
- Camera motion, scene title, source photo context, and secondary reference image inclusion state where relevant.
- A clear unavailable state for prompts that depend on generated data that does not exist yet.

Prompt preview should not duplicate prompt text in a second place if the provider adapter already owns the prompt construction. Prefer extracting pure prompt builders that both the provider and the dev tool can use.

## Run Investigation Tools

The dev tool should help QA hand useful packets to engineering without asking them to understand the database or Trigger.dev internals.

Run details should surface:

- Project id.
- Render run id.
- Parent Trigger.dev job id.
- Child Trigger.dev job ids for scene clip and avatar work when available.
- Current status, current step, error message, and result asset id.
- Submitted render options.
- Effective render mode and reuse settings.
- Selected scene clip provider model id when relevant.

Compact bug report export should produce a copyable Markdown or plain-text block with the most useful fields. It should be optimized for pasting into Slack, Linear, GitHub, or a support thread.

Copy run settings, project id, and final render payload is lower priority. The first version should treat this as an investigation aid, not a fully designed workflow. It can start as a copyable JSON/Markdown payload and evolve once QA and engineers learn what fields are actually useful.

## Proposed Dev Tool Contract

Default guided payload shape:

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

Example payload for testing provider image-to-video while reusing planning and voice assets:

```json
{
  "options": {
    "renderMode": "provider_image_to_video",
    "sceneClipProviderModelId": "kwaivgi/kling-v3.0-std",
    "scriptPlanningModelId": "google/gemini-2.5-flash",
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

Potential future contract for selected scene clip regeneration:

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

This contract does not exist yet. It should only be added if implementation confirms the pipeline can express selected scene regeneration cleanly.

## Implementation Shape

1. Add a small environment helper that answers whether Tours render dev tools are enabled.
2. Add or reuse a route/layout prop so Tour Project UI can know whether to show the dev tool without guessing production status purely on the client.
3. Add a small render-options builder for the dev tool.
4. Add a preset-to-options builder for QA run recipes.
5. Add a cost-estimate helper that can explain expected provider calls from project state and selected options.
6. Extract or expose pure prompt builders needed for prompt preview.
7. Add a focused Tour Project render dev tool component.
8. Extend the render-run client hook or create a sibling function that can submit explicit `TourRenderOptions`, while preserving the existing normal and fresh render buttons.
9. Add API validation for the subset of render options accepted by the dev tool, or add a broader reusable validation schema if that can be done cleanly.
10. Persist the submitted options through the existing render-run persistence path.
11. Surface Trigger.dev job ids and submitted options in run details.
12. Add compact bug-report export.

## Testing Decisions

Tests should assert external behavior and payloads rather than implementation details.

- Test the environment helper for development, Vercel Preview, and production cases.
- Test the render-options builder with default toggles, disabled toggles, blank script planning model, explicit script planning model, and both render modes.
- Test the render-options builder with blank and explicit scene clip provider model id values.
- Test preset-to-options mapping for every preset.
- Test the cost-estimate helper for cheap reuse, selected scene regeneration, full scene regeneration, Ken Burns local clip regeneration, provider image-to-video/Kling regeneration, voiceover tours, and avatar tours.
- Test prompt preview builders against the same prompt construction used by the provider adapters.
- Test that the dev-tool submit path posts the expected `options` payload.
- Test that the existing normal render path still sends no options.
- Test that the existing fresh render path still sends the current fresh options.
- Test the API boundary for accepting the supported dev-tool payload and rejecting invalid render modes or malformed reuse values if validation is added.
- Test that run details expose Trigger.dev ids when present.
- Test that compact bug report export includes project id, run id, Trigger.dev job id, status, error, and submitted options.
- Reuse existing Vitest patterns. Do not use Jest-only flags.

## Out of Scope

- Surfacing ElevenLabs voice, HeyGen avatar, avatar placement, transition detection model, voice settings, final mux settings, or raw JSON editing.
- Creating a full render-options console.
- Creating new Supabase tables or migrations.
- Changing provider API key storage.
- Changing Trigger.dev queue concurrency or task duration.
- Changing the default product render buttons beyond allowing the dev tool to submit explicit options.
- Exposing the dev tool in production.
- Guaranteeing exact provider billing. The first cost/spend view is an estimate and explanation tool.
- Designing a polished long-term investigation packet workflow. Copying run settings and payloads can start simple.

## Further Notes

The existing render-run API already accepts and persists an `options` object, so the first implementation should mostly be UI, option construction, and validation hardening. The main architectural risk is letting the dev tool become a grab bag. Keeping the first version intentionally small gives the codebase a clean place to grow later.

If implementation reveals that per-asset reuse currently has a missing asset class, add that as a small backend contract improvement with tests before surfacing it in UI.
