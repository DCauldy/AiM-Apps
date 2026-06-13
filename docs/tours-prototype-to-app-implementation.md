# Tours Prototype To App Implementation

This document describes how to graduate the Ken Burns tour prototype at
`throwaway-prototypes/tours/test1/scripts/run-kenburns-tour.ts` into the
production Tours app.

Trigger.dev guidance in this document was checked against the official docs on
June 13, 2026.

The goal is a deep app module with a small product-facing interface:

```ts
await generateTourProjectVideo({
  projectId,
  userId,
  renderRunId,
  options: {
    reuse: {
      scriptPlan: true,
      voiceover: true,
      sceneClips: true,
      finalVideo: false,
    },
    openRouterModel,
    voiceId,
  },
});
```

The caller should provide a Tour Project id and optional reuse/render options.
The module should read project context from the database, reuse durable assets
when fingerprints match, generate missing assets, and persist product status
for the workspace UI.

Voice-over Tours must require an ElevenLabs API key. Do not fall back to HeyGen
for `tour_video_voice_over`. HeyGen should be reserved for avatar/video-avatar
flows where a talking-head video is part of the selected output.

## Current Prototype Responsibilities

The prototype currently combines these responsibilities in one script:

- CLI option parsing and local env loading
- JSON config reading and scene normalization
- temporary public image upload through tmpfiles.org
- OpenRouter script planning with image context
- ElevenLabs full voiceover and transcript generation
- OpenRouter transcript-to-scene transition detection
- scene duration derivation
- per-scene Ken Burns FFmpeg clip rendering
- final concat and audio mux
- local JSON manifests and summary files

In the app, CLI/config/tmpfiles/local manifests should disappear. Database rows,
Supabase Storage, Trigger.dev runs, and product APIs should replace them.

## Existing App Inputs

The production input model already exists:

- `tours_projects`: project shell, owner, address, listing URL, tour type
- `tour_scenes`: ordered scene plan with inclusion and camera motion
- `tour_scene_source_photos`: authoritative listing media per scene
- `tour_scene_facts`: proofed facts used as script context
- `tours-listing-media`: private Supabase Storage bucket for source photos

The render module should load one renderable project view:

```ts
type RenderableTourProject = {
  project: {
    id: string;
    userId: string;
    name: string;
    propertyAddress: string;
    listingUrl: string | null;
    tourType: "tour_video" | "tour_video_voice_over" | "tour_video_avatar";
  };
  scenes: Array<{
    id: string;
    title: string;
    sortOrder: number;
    included: boolean;
    cameraMotion: "slow_push" | "slow_pan" | "static_hold";
    authoritativePhoto: {
      id: string;
      storagePath: string;
      fileName: string;
      contentType: "image/jpeg" | "image/png" | "image/webp";
      byteSize: number;
      width: number | null;
      height: number | null;
    };
    proofedFacts: Array<{
      id: string;
      text: string;
      sortOrder: number;
      sourcePhotoId: string | null;
    }>;
  }>;
};
```

## Module Shape

Keep the Trigger.dev task thin. Put product logic in `lib/tours/rendering`.

```text
trigger/render-tour-project.ts
  Thin Trigger.dev task wrapper.

lib/tours/rendering/generate-tour-project-video.ts
  Public app service. Coordinates the render using injected adapters.

lib/tours/rendering/tour-render.core.ts
  Pure orchestration helpers, fingerprints, reuse decisions, normalization,
  transition validation, and duration derivation.

lib/tours/rendering/tour-render.repository.ts
  Supabase reads/writes for projects, runs, events, and asset manifests.

lib/tours/rendering/tour-render.storage.ts
  Supabase Storage adapter for signed image URLs, downloads, uploads, and
  short-lived local scratch paths required by FFmpeg.

lib/tours/rendering/tour-render-preflight.ts
  Validates that a render can finish before spending model/provider money.

lib/tours/rendering/providers/openrouter-tour-script.ts
  Script planning and scene transition detection.

lib/tours/rendering/providers/elevenlabs-voiceover.ts
  Voiceover generation using the existing ElevenLabs workflow shape.

lib/tours/rendering/ffmpeg/create-ken-burns-clip.ts
  Promoted prototype helper. Keep FFmpeg details hidden.

lib/tours/rendering/ffmpeg/render-base-tour-video.ts
  Promoted final concat/mux helper.
```

Core tests should exercise the orchestration boundary with fake repository,
storage, model, voice, and render adapters. Avoid testing every small helper
instead of the real decisions the module owns.

## Scene Clip Render Policy

Production scene clips should default to provider-generated image-to-video clips
through OpenRouter, using a selected image-to-video model such as Kling or a
later approved equivalent. Ken Burns FFmpeg rendering remains the default in
local development and preview environments for this epic so the pipeline can be
implemented and validated without paid image-to-video generation on every test
render.

Both paths must implement the same scene clip renderer interface. The render
module should leave an explicit render-mode selection point so a later devtool or
setting can override the environment default. This epic only needs to keep the
adapter swappable and leave space for the provider dependency that will replace
Ken Burns-style clips in production.

Provider-generated clips have higher and less predictable per-scene cost,
latency, provider retry, polling, and output-import requirements. They are the
production quality target and must be imported into AiM-controlled
`tours-generated-media` storage before any durable asset row is recorded. Ken
Burns clips are deterministic FFmpeg outputs generated in Trigger.dev scratch
space, uploaded to the same storage bucket, and used for development, preview,
and pipeline testing.

Scene clip fingerprints must include the selected render mode, provider/model or
Ken Burns renderer version, source photo identity, duration, render settings,
and adapter version. This prevents asset reuse across incompatible renderer
policies.

## Preflight Validation

Preflight validation should be its own service and API step. It should run
before a Trigger.dev render is started and again at the beginning of the
Trigger.dev task. The API preflight gives immediate user feedback; the task
preflight protects against state changes between clicking render and task
execution.

```text
POST /api/apps/tours/projects/:projectId/render-preflight
  Validates render readiness and returns blocking issues.

POST /api/apps/tours/projects/:projectId/render-runs
  Runs preflight, creates a render run only if preflight passes, then triggers
  Trigger.dev.
```

Service shape:

```ts
type TourRenderPreflightResult =
  | { ok: true; summary: TourRenderPreflightSummary }
  | {
      ok: false;
      issues: Array<{
        code: string;
        message: string;
        severity: "blocking";
        sceneId?: string;
      }>;
    };

async function preflightTourRender(input: {
  projectId: string;
  userId: string;
  options: TourRenderOptions;
}): Promise<TourRenderPreflightResult>;
```

Validate all blockers before provider calls:

- Project exists, belongs to the user, and is open.
- At least one scene is included.
- Every included scene has an authoritative source photo.
- Proofed facts policy is satisfied.
- Required provider keys are present.
- Input storage bucket can be read.
- Generated-media storage bucket exists and is writable.

Proofed facts are optional for rendering, but only proofed facts may be used by
script generation. Preflight should not block an included scene only because it
has no proofed facts. Unproofed, generated, raw, or draft facts must not be sent
to script planning or used in narration. If an included scene has no proofed
facts, the script planner may still use safe project fields, the scene title,
camera motion, and source photo context, but it must not invent property claims.

Provider key requirements:

- `tour_video`: OpenRouter/platform script provider only, plus any provider
  needed by the selected render mode.
- `tour_video_voice_over`: ElevenLabs is required. HeyGen must not satisfy this
  requirement.
- `tour_video_avatar`: HeyGen is required; ElevenLabs may still be needed if the
  avatar flow uses externally generated narration.

OpenRouter is a platform-owned provider for the first production render path.
Users do not provide OpenRouter API keys for script planning, transition
detection, or provider image-to-video scene clip rendering.

Storage checks should be cheap but real. For generated output, attempt a small
write/delete probe in `tours-generated-media` or use an equivalent repository
method that proves the task can upload final assets before any paid provider
work starts.

## Trigger.dev Orchestration

The app route or server action should create a product render run row, then
trigger a background task.

```ts
const handle = await renderTourProjectTask.trigger(
  {
    projectId,
    userId,
    renderRunId,
    options,
  },
  {
    idempotencyKey,
    tags: [`user:${userId}`, `tour-project:${projectId}`],
    metadata: {
      product: "tours",
      projectId,
      renderRunId,
      step: "queued",
      progressPercent: 0,
    },
  }
);
```

The task should call the deep module:

```ts
export const renderTourProjectTask = task({
  id: "render-tour-project",
  maxDuration: 60 * 60,
  run: async (payload) => {
    return generateTourProjectVideo({
      ...payload,
      progress: async (update) => {
        await updateTourRenderProgress(payload.renderRunId, update);
        metadata.set("step", update.step);
        metadata.set("progressPercent", update.progressPercent);
      },
    });
  },
});
```

Use Trigger.dev for execution, retries, queues, logs, and operational metadata.
Use Supabase for product status and durable asset reuse.

### Local no-op proof

Before product render rows exist, the local proof path is intentionally separate
from end-user render actions:

- Task: `triggers/tours-render-noop-proof.ts`
- Endpoint: `POST /api/apps/tours/projects/:projectId/render-proof/noop`
- Payload shape:

```json
{
  "renderRunId": "proof-render-run-id",
  "options": {
    "renderMode": "ken_burns_ffmpeg",
    "reuseExistingAssets": true
  }
}
```

The endpoint requires normal Tours project access, adds the authenticated
`userId`, forces `options.proofOnly = true`, and triggers
`tours-render-noop-proof` with Trigger.dev tags and metadata. The task logs the
received payload, writes `toursRenderNoopProof` run metadata, flushes metadata,
and returns `{ ok: true, proof }`.

Local caveats for agents:

- Start the app on port 6060 by the repo's normal process; do not expose this
  proof endpoint in UI.
- Start Trigger.dev local development in a separate terminal with the project's
  Trigger.dev credentials configured, then open the local Trigger.dev dev
  dashboard.
- Call the endpoint as an authenticated Tours user against an open Tour Project.
  A successful response includes `triggerRunId`; the matching run should appear
  in the dashboard with task id `tours-render-noop-proof`, tags, logs, metadata,
  and successful output.

Treat Trigger.dev metadata as operational, not authoritative. Metadata updates
are flushed in the background, so `metadata.set(...)` is synchronous. Only call
`await metadata.flush()` when a task needs immediate metadata persistence before
continuing, and do not make product correctness depend on that flush. Supabase
rows remain the authoritative source for render status, generated assets, reuse
decisions, and user-visible result state.

## Trigger.dev FFmpeg Pattern

Use Trigger.dev's FFmpeg build extension instead of assuming FFmpeg exists in
the Vercel or task runtime image.

```ts
// trigger.config.ts
import { ffmpeg } from "@trigger.dev/build/extensions/core";
import { defineConfig } from "@trigger.dev/sdk";

export default defineConfig({
  project: "<project ref>",
  build: {
    extensions: [ffmpeg()],
  },
});
```

If the renderer needs FFmpeg 7 behavior, configure the static FFmpeg 7 build:

```ts
build: {
  extensions: [ffmpeg({ version: "7" })],
}
```

The extension exposes `FFMPEG_PATH` and `FFPROBE_PATH` in the Trigger.dev task
environment. The FFmpeg wrapper should prefer those paths:

```ts
const ffmpegPath = process.env.FFMPEG_PATH ?? "ffmpeg";
const ffprobePath = process.env.FFPROBE_PATH ?? "ffprobe";
```

If the implementation uses `fluent-ffmpeg`, add it to `external` in
`trigger.config.ts` as Trigger.dev documents. The current prototype shells out
directly, so it can avoid that dependency by passing `FFMPEG_PATH` to the
existing command runner.

The project also needs `@trigger.dev/build` in `devDependencies` when using
build extensions.

The task pattern should be:

1. Download required Supabase Storage inputs into a task-local scratch directory
   such as `os.tmpdir()`.
2. Run FFmpeg inside the Trigger.dev task, using bounded concurrency for scene
   clips.
3. Upload generated outputs to Supabase Storage immediately after each artifact
   is produced.
4. Persist a `tour_render_assets` row only after upload succeeds.
5. Delete scratch files in a `finally` block.

Do not write generated media into the Next.js app filesystem and do not route
FFmpeg work through a Vercel request. Vercel should only trigger the task and
serve status/results.

Use an explicit machine preset for FFmpeg tasks. The Trigger.dev default is a
small machine, and their machine docs call out child processes such as FFmpeg as
a common source of out-of-memory failures. Start conservatively:

```ts
export const renderTourProjectTask = task({
  id: "render-tour-project",
  machine: "medium-2x",
  retry: {
    outOfMemory: {
      machine: "large-1x",
    },
  },
  run: async (payload) => {
    // ...
  },
});

export const renderTourSceneClipTask = task({
  id: "render-tour-scene-clip",
  machine: "medium-1x",
  queue: {
    concurrencyLimit: 2,
  },
  run: async (payload) => {
    // ...
  },
});
```

If the scene clip renderer becomes the slowest production stage, tune machine
size and queue concurrency from observed run duration, memory, and cost rather
than guessing.

Trigger.dev references:

- FFmpeg extension: https://trigger.dev/docs/config/extensions/ffmpeg
- FFmpeg video processing examples: https://trigger.dev/docs/guides/examples/ffmpeg-video-processing
- Machines and OOM handling: https://trigger.dev/docs/machines

## Render Run Tables

Add durable product run state. Trigger.dev status alone is not enough because
the app needs product concepts like final asset ids, scene counts, reuse
decisions, and user-visible progress.

```sql
create table public.tour_render_runs (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.tours_projects(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  trigger_run_id text,
  status text not null default 'queued'
    check (status in ('queued', 'running', 'completed', 'failed', 'cancelled')),
  current_step text not null default 'queued',
  current_step_label text not null default 'Queued',
  progress_percent integer not null default 0
    check (progress_percent between 0 and 100),
  scene_clip_completed_count integer not null default 0,
  scene_clip_total_count integer not null default 0,
  options jsonb not null default '{}'::jsonb,
  error_message text,
  result_asset_id uuid,
  started_at timestamptz,
  completed_at timestamptz,
  heartbeat_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index tour_render_runs_project_created_idx
  on public.tour_render_runs (project_id, created_at desc);

create index tour_render_runs_user_status_idx
  on public.tour_render_runs (user_id, status, created_at desc);
```

Add a current/history event table if the UI needs a journey timeline:

```sql
create table public.tour_render_run_events (
  id uuid primary key default gen_random_uuid(),
  run_id uuid not null references public.tour_render_runs(id) on delete cascade,
  project_id uuid not null references public.tours_projects(id) on delete cascade,
  step text not null,
  status text not null,
  message text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index tour_render_run_events_run_created_idx
  on public.tour_render_run_events (run_id, created_at asc);
```

## Asset Tables

Store reusable generated assets separately from run state. Assets are durable
project artifacts with run provenance, not children owned by a run. Old run
cleanup must not delete reusable asset rows or generated Storage objects that
are still valid for fingerprint reuse.

```sql
create table public.tour_render_assets (
  id uuid primary key default gen_random_uuid(),
  created_by_run_id uuid references public.tour_render_runs(id) on delete set null,
  project_id uuid not null references public.tours_projects(id) on delete cascade,
  scene_id uuid references public.tour_scenes(id) on delete set null,
  kind text not null check (kind in (
    'script_plan',
    'narration_text',
    'voiceover_audio',
    'voiceover_transcript',
    'scene_transitions',
    'scene_durations',
    'scene_clip',
    'joined_scenes',
    'final_video'
  )),
  storage_bucket text,
  storage_path text,
  content_type text,
  fingerprint_hash text not null,
  fingerprint jsonb not null,
  reusable boolean not null default true,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index tour_render_assets_project_kind_fingerprint_idx
  on public.tour_render_assets (project_id, kind, fingerprint_hash, created_at desc);

create index tour_render_assets_scene_kind_fingerprint_idx
  on public.tour_render_assets (scene_id, kind, fingerprint_hash, created_at desc)
  where scene_id is not null;
```

If a product run uses an existing asset, record that relationship separately
rather than rewriting ownership:

```sql
create table public.tour_render_run_assets (
  run_id uuid not null references public.tour_render_runs(id) on delete cascade,
  asset_id uuid not null references public.tour_render_assets(id) on delete restrict,
  usage text not null default 'used'
    check (usage in ('created', 'reused', 'used', 'result')),
  created_at timestamptz not null default now(),
  primary key (run_id, asset_id, usage)
);

create index tour_render_run_assets_asset_idx
  on public.tour_render_run_assets (asset_id, created_at desc);
```

This lets run history be deleted or compacted without destroying assets that
future renders can reuse. Asset garbage collection should be its own policy,
based on project ownership, age, fingerprint reachability, Storage object
existence, and whether any non-expired run/result still references the asset.

Use a generated-assets bucket for output files. The bucket may be private, with
signed URLs returned by app APIs. I think I prefer the public bucket.

```text
tours-generated-media/{user_id}/{project_id}/{run_id}/script-plan.json
tours-generated-media/{user_id}/{project_id}/{run_id}/voiceover.mp3
tours-generated-media/{user_id}/{project_id}/{run_id}/transcript.json
tours-generated-media/{user_id}/{project_id}/{run_id}/clips/{scene_id}.mp4
tours-generated-media/{user_id}/{project_id}/{run_id}/joined-scenes.mp4
tours-generated-media/{user_id}/{project_id}/{run_id}/final.mp4
```

## Status Without WebSockets

Use lightweight polling against the app database.

```text
POST /api/apps/tours/projects/:projectId/render-runs
  Creates tour_render_runs row and triggers Trigger.dev.

GET /api/apps/tours/projects/:projectId/render-runs/:runId/status
  Returns current product status from Supabase.

GET /api/apps/tours/projects/:projectId/render-runs
  Returns recent runs for the project.
```

Status response:

```json
{
  "runId": "uuid",
  "status": "running",
  "step": "rendering_scene_clips",
  "label": "Rendering scene clips",
  "progressPercent": 62,
  "sceneClips": { "completed": 5, "total": 8 },
  "updatedAt": "2026-06-12T16:00:00.000Z",
  "result": null,
  "error": null
}
```

Polling cadence:

```text
queued/running, first minute: every 2 seconds
queued/running after one minute: every 5 seconds
browser tab hidden: every 15-30 seconds
completed/failed/cancelled: stop
```

Trigger.dev run metadata remains useful for logs, dashboard visibility, and
debugging. It is operational state only. The workspace UI should read product
state from Supabase.

## Journey Steps

Use stable machine step names. Map them to UI labels in the app.

```ts
type TourRenderStep =
  | "queued"
  | "preparing_assets"
  | "planning_script"
  | "generating_voiceover"
  | "detecting_transitions"
  | "rendering_scene_clips"
  | "joining_scene_clips"
  | "muxing_final_video"
  | "uploading_final_video"
  | "completed"
  | "failed";
```

The run row stores the current step. The event table stores step history.

## Dependency Graph

```text
project access
  -> preflight validation
  -> load project + included scenes + source photos + proofed facts
  -> compute input fingerprints + find reusable assets
  -> signed image URLs for vision + local source image files for FFmpeg
  -> script plan
  -> voiceover audio + transcript
  -> scene transition detection
  -> scene durations
  -> scene clips
  -> joined-scenes video
  -> final mux with voiceover
  -> upload final asset + mark run complete
```

## Batching Opportunities

Batch these stages:

- Load DB inputs in one repository call.
- Query reusable assets by `project_id`, `kind`, and fingerprint hashes.
- Create signed URLs for all source photos.
- Download source images concurrently with a cap.
- Render scene clips concurrently once durations are known.
- Upload generated clips as each clip finishes.

Do not batch these initially:

- Script plan generation: keep one call for narrative coherence.
- Full voiceover generation: one audio file simplifies transcript timing.
- Transition detection: needs the full transcript and scene list.
- Final concat/mux: depends on ordered clips and voiceover.

The highest-value batch is per-scene clip rendering. If Ken Burns remains part
of production, use child Trigger.dev tasks for scene clips. If production drops
Ken Burns, this stage becomes either cheap static clip generation or disappears.

Use Trigger.dev's fan-out/fan-in APIs correctly:

- Use `renderTourSceneClipTask.batchTriggerAndWait([...])` from the parent task
  when the parent needs all clip results before joining/muxing.
- Do not wrap `triggerAndWait()` or `batchTriggerAndWait()` in `Promise.all()`.
- Use the child task queue's `concurrencyLimit` to cap FFmpeg parallelism.
- Define reusable queues ahead of time with `queue()` when multiple tasks must
  share a limit.
- Do not assume subtasks inherit the parent queue. Trigger.dev documents that
  subtasks run on their own queue unless specified.
- Prefer `batchTriggerAndWait()` over calling `trigger()` repeatedly in a loop
  when rendering many clips.
- In v4, `triggerAndWait()` and `batchTriggerAndWait()` return Result objects;
  inspect `result.ok`/`result.error` or use `.unwrap()`.

For per-project protection, trigger with a concurrency key or define a queue
strategy that prevents multiple heavy renders for the same project from running
at once.

Trigger.dev references:

- Triggering and `batchTriggerAndWait()`: https://trigger.dev/docs/triggering
- Concurrency and queues: https://trigger.dev/docs/queue-concurrency
- Version locking for child tasks: https://trigger.dev/docs/versioning

## Reuse Fingerprints

Each reusable asset kind needs a fingerprint. Hash a stable JSON object and
store both `fingerprint_hash` and the JSON payload.

`script_plan` fingerprint:

```text
project id
project name/address/listing URL
included scene ids/order/titles
proofed facts
camera motion values if prompt uses them
authoritative photo fingerprints if vision is used
OpenRouter model
prompt version
timing options
```

`voiceover_audio` fingerprint:

```text
full script
voice id
ElevenLabs model/settings
transcript settings
provider module version
```

`scene_transitions` fingerprint:

```text
transcript chunks/text/timestamps
scene ids/order/titles/facts
OpenRouter model
transition prompt version
```

`scene_clip` fingerprint:

```text
scene id
source photo storage path + byte size/hash/etag
duration seconds
Ken Burns motion
render preset: width, height, fps, crf, fade, crop behavior
clip renderer version
```

`joined_scenes` fingerprint:

```text
ordered scene clip asset ids or fingerprint hashes
concat settings
```

`final_video` fingerprint:

```text
joined-scenes fingerprint
voiceover fingerprint
mux settings
output preset
```

## Storage Behavior

Do not expose private listing media permanently.

- Use signed URLs for OpenRouter image context.
- Download private source photos to an internal scratch directory for FFmpeg.
- Upload generated outputs to `tours-generated-media`.
- Delete scratch files after the run or task attempt finishes.
- Never store local filesystem paths in durable product rows.

Temporary local files are acceptable as an implementation detail for FFmpeg.
They should not be part of the public module interface.

## Credentials

Use app-managed user API keys where the product requires user credentials:

- ElevenLabs: required for `tour_video_voice_over`; read through `user_api_keys`
  using the server-side service helper. If the key is missing, fail the render
  before script/audio work starts and return a product error that tells the user
  to add an ElevenLabs key.
- HeyGen: reserved for `tour_video_avatar` when avatar rendering is added. It
  must not be treated as a voice-over fallback.
- OpenRouter: platform-owned for the first production render path. Users do not
  provide OpenRouter keys for script planning, transition detection, or provider
  image-to-video scene clip rendering.

Trigger.dev tasks run outside the request lifecycle, so they should use a
service-role Supabase client and explicitly scope queries by `projectId` and
`userId`.

Trigger.dev's Supabase Storage example supports both the Supabase client and S3
client upload paths. Start with the Supabase client for consistency with this
app unless large-file streaming performance pushes us toward S3-compatible
uploads.

Environment handling options:

- set required secrets directly in Trigger.dev environments, or
- use Trigger.dev's `syncSupabaseEnvVars()` build extension to sync Supabase
  values into Trigger.dev for deployed environments.

Trigger.dev references:

- Supabase Storage uploads: https://trigger.dev/docs/guides/examples/supabase-storage-upload
- Sync Supabase env vars: https://trigger.dev/docs/config/extensions/syncEnvVars

## Error Handling

Classify failures so the UI can respond cleanly:

- missing project or unauthorized project
- archived or closed project
- no included scenes
- missing authoritative photo
- proofed facts policy failed
- missing required provider API key
- voice-over tour requested without an ElevenLabs key
- generated-media storage bucket is not writable
- provider request failed
- invalid provider JSON response
- transcript/transition validation failed
- FFmpeg render failed
- storage upload failed

On failure:

- mark `tour_render_runs.status = 'failed'`
- set `current_step = 'failed'`
- store a safe `error_message`
- insert a `tour_render_run_events` failure event
- keep partial reusable assets that were successfully uploaded and fingerprinted

## First Implementation Slice

Build this in vertical slices:

1. Add render run and render asset tables plus storage bucket.
2. Add repository methods to create/update runs and read renderable project data.
3. Add Trigger.dev project scaffolding before any Tours render work:
   `@trigger.dev/sdk`, `@trigger.dev/build`, `trigger.config.ts`, `/trigger`,
   package scripts, required environment variables, and the deploy path. This
   repo currently has Inngest but no Trigger.dev dependency/config, so prove the
   platform wiring separately from the product workflow.
4. Add a no-op Trigger.dev task and prove local Trigger dev can call it from a
   backend route or server action. The proof should show the task receives a
   payload, writes a log/metadata value, returns successfully, and appears in
   the Trigger.dev dev dashboard.
5. Add product render run polling without real rendering: create a
   `tour_render_runs` row, trigger a no-op or fake progress task, update the run
   through a few statuses, and verify the Tours UI/status API polls Supabase.
6. Add `preflightTourRender` plus an API preflight endpoint. Block render run
   creation when preflight fails.
7. Add the real Tours render task shell that re-runs preflight, then marks a run
   from queued to completed without rendering.
8. Move script planning into `lib/tours/rendering` and persist `script_plan`.
9. Enforce the ElevenLabs requirement for `tour_video_voice_over`, update any
   existing app availability/copy that currently implies HeyGen can satisfy
   voice-over tours, then move ElevenLabs voiceover generation and persist
   audio/transcript.
10. Add transition detection and duration derivation.
11. Add final static or Ken Burns video rendering behind the same interface.
12. Add per-scene clip reuse and optional child Trigger.dev tasks if Ken Burns
   stays in production.

This keeps the product shippable at each step and avoids porting the prototype
as one large script.
