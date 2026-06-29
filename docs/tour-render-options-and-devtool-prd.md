# Tour Render Options And Dev Tool PRD

> Deprecated planning artifact.
>
> Do not use this document as source material for new implementation issues. It
> mixes older provider-settings ideas with render dev-tool ideas and may not
> match the current Tours render pipeline. For the focused render dev-tool V1,
> use `docs/tour-project-render-dev-tool-prd.md` and verify details against the
> current code before publishing issues.

## Problem Statement

Tour rendering already has a configurable backend shape, but the product and developer UI still exposes only two actions: generate with defaults or generate fresh. That leaves important provider choices hidden in code and environment variables.

Users need clear places to provide required provider keys and render identity choices such as ElevenLabs voice id and HeyGen avatar id. Developers need a fast, explicit way to change provider/model/reuse options for the next render run without editing code or relying on worker defaults.

## Current State

The render-run API already accepts an `options` object in the request body and passes it into preflight, Supabase render-run persistence, and the Trigger.dev payload. The Trigger task payload therefore can carry per-run render options today.

Render options are persisted on `tour_render_runs.options`, and `createTourRenderRun` merges incoming options with default render options before triggering the background task.

User provider keys are partly solved:

- The `user_api_keys` table stores encrypted keys per user and service.
- `/api/profile/api-keys` can create, list, and delete supported keys.
- Rendering preflight checks whether required ElevenLabs and HeyGen keys exist for the user.
- The Trigger.dev task does not need ElevenLabs or HeyGen keys in the payload. It receives `userId`, then `generateVoiceoverStage` and `prepareHeyGenAvatarStage` read the user's encrypted key from Supabase through the service-role client inside the worker.

What this means: user ElevenLabs and HeyGen API keys are not being sent to Trigger.dev directly. Trigger.dev resolves them from Supabase at task runtime. That is the right direction for sensitive keys, but the worker environment must have the app Supabase service-role credentials and the same encryption secret needed to decrypt stored keys.

OpenRouter is not solved as a user key. Script planning, transition detection, and provider image-to-video currently use `process.env.OPENROUTER_API_KEY` in the Trigger.dev worker provider constructors.

## Current Hardcoded Assumptions

Render task and run defaults:

- Default render mode is `provider_image_to_video`.
- `createTourRenderRun` defaults `reuseExistingAssets` to `true`.
- The workspace's "Generate fresh" button hardcodes `reuseExistingAssets: false` and disables reuse for script plan, voiceover, avatar, scene clips, and final video.
- The Trigger.dev task constructs providers directly from worker environment defaults.
- Trigger queue concurrency is hardcoded to one render per `tour-project-renders` queue.

Script planning:

- Provider is OpenRouter.
- API key is `OPENROUTER_API_KEY` from the Trigger.dev environment.
- Default model is `google/gemini-2.5-flash`.
- Default scene timing is 5 seconds fallback, 3 seconds minimum, and 9 seconds maximum.

Voiceover:

- Provider is ElevenLabs.
- API key is the user's stored `elevenlabs` key from Supabase.
- Voice id comes from `options.elevenLabsVoiceId` or `process.env.ELEVENLABS_VOICE_ID`.
- Default model is `eleven_multilingual_v2`.
- Output format is `mp3_44100_128`.
- Language is hardcoded to `en`.
- Default voice settings are stability `0.45`, style `0.2`, and speaker boost enabled.
- Default transcript options use normalized alignment, word-count phrase mode, and one word per phrase.

Transition detection:

- Provider is OpenRouter.
- API key is `OPENROUTER_API_KEY` from the Trigger.dev environment.
- Default model is `google/gemini-2.5-flash`.
- Minimum transition duration is `0.2` seconds.
- Duration rounding increment is `0.001` seconds.
- Reuse is currently controlled through the voiceover reuse flag, not its own explicit `reuse.transitions` flag.

Scene clips:

- Default render mode is `provider_image_to_video`.
- Provider image-to-video uses OpenRouter when `renderMode` is `provider_image_to_video`.
- API key is `OPENROUTER_API_KEY` from the Trigger.dev environment.
- Default provider image-to-video model is `kwaivgi/kling-v3.0-std`.
- Default render settings are 1080x1920, 30 fps, CRF 18, `cover` crop mode, and 0.25 seconds fade.
- Default concurrency is 2 with a maximum of 4.

Final render:

- Default output is vertical 1080x1920 H.264/AAC.
- Video codec is `libx264`.
- Audio codec is `aac`.
- Preset is `medium`.
- CRF is 20.
- Audio bitrate is `192k`.

Avatar:

- Provider is HeyGen.
- API key is the user's stored `heygen` key from Supabase.
- Avatar id comes from `options.heyGenAvatarId` or `process.env.HEYGEN_AVATAR_ID`.
- Canvas is 1080x1920.
- Default avatar size is `medium`.
- Default positioning is bottom-right, zero margins, visible-bounding-box basis, alpha threshold 16.
- Default generation asks for 9:16, contain, remove background, WebM, 720p, and Avatar V.
- Alpha analysis samples every second.
- Frame-check timestamps are 1, 6, 12, 30, 45, 55, and 61 seconds.

Storage and environment:

- Trigger.dev needs Supabase app URL and service-role key to read/write render state, storage, and user API keys.
- `PROVIDER_VISIBLE_SUPABASE_URL` is an optional provider-facing origin used to validate provider-reachable media URLs.
- FFmpeg and FFprobe paths are environment-based fallback values.

## Solution

Build two related surfaces:

1. A user-facing provider settings flow for durable account/project choices.
2. A developer-only render options tool for the next render run.

The user-facing flow should make required keys and required identity options discoverable before a render starts. Users should be able to add ElevenLabs and HeyGen API keys, pick or enter a voice id, and pick or enter an avatar id without needing environment variables.

The dev tool should generate a complete `TourRenderOptions` payload for the next run and POST it through the existing render-run API. It should make default values visible, allow narrow overrides, and expose explicit reuse controls per asset class.

## User Stories

1. As a tour user, I want to see whether my ElevenLabs key is configured, so that I know whether voice-over tours can render.
2. As a tour user, I want to add or replace my ElevenLabs API key, so that voice-over generation uses my account.
3. As a tour user, I want to see whether my HeyGen key is configured, so that I know whether avatar tours can render.
4. As a tour user, I want to add or replace my HeyGen API key, so that avatar generation uses my account.
5. As a tour user, I want to provide an ElevenLabs voice id, so that the tour uses the voice I expect.
6. As a tour user, I want to provide a HeyGen avatar id, so that the tour uses the avatar I expect.
7. As a tour user, I want preflight messages to name the missing key or missing id, so that I can fix the setup before spending render time.
8. As a developer, I want to change the scene clip provider for the next render, so that I can test provider image-to-video without changing code.
9. As a developer, I want to change the script planning model for the next render, so that I can compare model quality.
10. As a developer, I want to change the transition detection model for the next render, so that I can compare scene timing behavior.
11. As a developer, I want to change the ElevenLabs model and voice settings for the next render, so that I can tune voice quality.
12. As a developer, I want to change HeyGen avatar size and placement for the next render, so that I can test compositing quality.
13. As a developer, I want to regenerate only scene clips, so that I can reuse script and voiceover while testing visual output.
14. As a developer, I want to regenerate only the final video, so that I can test mux/compositing settings without recreating provider assets.
15. As a developer, I want to reuse script and voiceover but regenerate avatar, so that I can test avatar choices without spending on narration.
16. As a developer, I want options sent with the render request, so that the run record documents exactly what configuration produced the output.
17. As a developer, I want a visible JSON preview of the next-run options, so that I can debug what will be sent to Trigger.dev.

## Implementation Decisions

- Treat `TourRenderOptions` as the public contract for per-run overrides.
- Add schema validation at the render-run API boundary before accepting options. Runtime casts are not enough for a dev tool that can submit arbitrary JSON.
- Keep sensitive API keys out of Trigger.dev payloads. The payload should continue carrying `userId`; the task should resolve stored user keys from Supabase at runtime.
- Add OpenRouter to the user API key registry only if product policy requires user-provided OpenRouter keys. Otherwise document OpenRouter as an app-owned render provider key.
- Replace environment fallbacks for user-selectable identity options with saved settings or explicit per-run options. Environment fallbacks can remain local development conveniences but should not be the product path.
- Add a `transitions` reuse flag so transition detection is not implicitly coupled to voiceover reuse.
- Do not expand `tour-avatar.ts` further without extracting a focused module. It is currently 999 lines and sits at the repo cleanliness threshold.
- Store durable user preferences separately from per-run options. Good candidates are profile-level provider preferences or project-level render settings.
- Keep the dev tool developer-only. Gate it by the existing admin/dev capability used elsewhere in the app or an explicit server-side environment flag.
- The dev tool should submit through the existing render-run endpoint instead of creating a parallel Trigger.dev entry point.

## Proposed Option Groups

Provider keys:

- ElevenLabs API key.
- HeyGen API key.
- Optional OpenRouter API key if we choose user-owned OpenRouter spend.

Identity choices:

- ElevenLabs voice id.
- ElevenLabs model id.
- HeyGen avatar id.
- HeyGen avatar size.
- HeyGen avatar placement.

Model choices:

- Script planning model id.
- Transition detection model id.
- Scene clip render mode.
- Scene clip provider model id.

Timing and render settings:

- Script fallback, minimum, and maximum scene duration.
- Transition minimum duration and rounding increment.
- Scene clip width, height, fps, CRF, fade seconds, crop mode, and concurrency.
- Final mux width, height, codec, preset, CRF, and audio bitrate.

Reuse controls:

- Reuse script plan.
- Reuse voiceover audio and transcript.
- Reuse transition and duration assets.
- Reuse avatar video and metadata.
- Reuse scene clips.
- Reuse final video.

## Dev Tool Plan

Create a developer-only panel in the tour workspace or a dedicated dev route that loads the current project and latest render defaults.

The panel should have three modes:

- Default render: send no overrides except saved user/project preferences.
- Guided overrides: form controls for common options.
- Raw JSON: editable `TourRenderOptions` payload with validation errors.

The guided controls should include:

- Render mode segmented control: Ken Burns FFmpeg or provider image-to-video.
- Scene clip provider model input.
- Script planning model input.
- Transition detection model input.
- ElevenLabs voice id and model input.
- HeyGen avatar id, size, anchor, margins, and resolution controls.
- Reuse checklist by asset type.
- Presets for common regeneration intents:
  - Reuse everything possible.
  - Fresh render.
  - Regenerate script only.
  - Regenerate voiceover only.
  - Regenerate avatar only.
  - Regenerate scene clips only.
  - Regenerate final video only.

When the developer starts a run, the tool should call the existing render-runs POST endpoint with:

```json
{
  "options": {
    "renderMode": "provider_image_to_video",
    "scriptPlanningModelId": "google/gemini-2.5-flash",
    "sceneClipProviderModelId": "kwaivgi/kling-v3.0-std",
    "reuse": {
      "scriptPlan": true,
      "voiceover": true,
      "transitions": true,
      "avatar": true,
      "sceneClips": false,
      "finalVideo": false
    }
  }
}
```

## Epic Shape

1. Harden the render options contract with runtime validation and tests.
2. Add explicit transition reuse support to the render options and pipeline.
3. Add user/project render preferences for voice id and avatar id.
4. Build the key and provider setup UI for missing keys and required ids.
5. Build the developer-only render options panel.
6. Add render-run option summaries to status/history so each output can be traced.
7. Add tests for option validation, preflight behavior, Trigger payload creation, and reuse decisions.

## Testing Decisions

Good tests should assert external behavior: accepted request payloads, rejected invalid payloads, preflight issues, generated Trigger payloads, and stage reuse decisions.

Test the render-run API with representative option payloads rather than only TypeScript types.

Test the render-run service to verify that options are merged, persisted, and sent to Trigger.dev.

Test `generateTourProjectVideo` with fake providers and repositories for reuse combinations such as regenerate scene clips only, regenerate final video only, and regenerate avatar only.

Test preflight for missing user keys and missing identity choices without relying on process environment fallbacks.

Test the dev tool at the component level to verify the submitted JSON, including preset behavior.

## Out Of Scope

- Building a provider browser that lists ElevenLabs voices or HeyGen avatars from provider APIs.
- Moving all OpenRouter usage to user-owned keys unless product policy explicitly chooses that.
- Reworking the full render pipeline or provider adapters.
- Changing Trigger.dev deployment or queue policy beyond carrying validated options.
- Adding new Supabase migrations until the preference storage shape is approved.

## Further Notes

The most important architectural boundary is that per-run render options are safe to send to Trigger.dev, but provider API secrets should stay in encrypted storage and be resolved by the worker. The current ElevenLabs and HeyGen key path follows that boundary. OpenRouter remains an app-owned worker environment key today.

The current code already has most of the option fields needed for a useful dev tool. The main missing pieces are UI, runtime validation, persisted user preferences for voice/avatar ids, and one explicit reuse flag for transitions.
