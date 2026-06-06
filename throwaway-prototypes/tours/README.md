# Tours Video Pipeline Prototype

PROTOTYPE - throw this away or absorb the useful logic into the real Tours modules after the workflow shape is validated.

## Question

Does the Tours state flow from ordered listing images to scene clips, timed script, voiceover, optional avatar overlay, and a final 9:16 MP4 feel right before the production `TourWorkflow`, `ClipGenerationEngine`, `TourNarrationEngine`, `VoiceoverEngine`, `AvatarEngine`, and `TourRenderEngine` are built?

## Run

```bash
npm run prototype:tours -- --input ./tours-prototype-input
```

Press `r` to render the local pipeline. For an unattended run:

```bash
npm run prototype:tours -- --input ./tours-prototype-input --run
```

By default, the prototype uses FFmpeg to create five-second vertical motion clips from the still images. Set `clip.provider` to `openrouter` to spend OpenRouter credits and generate one image-to-video clip per TourScene through OpenRouter's video API.

## Input Directory

Create this structure:

```txt
tours-prototype-input/
  config.json
  scenes/
    001-entry.jpg
    002-kitchen.jpg
    003-living-room.jpg
  avatar/
    agent-avatar.mp4
```

`avatar/agent-avatar.mp4` is optional and only used when `avatar.enabled` is true and `avatar.localVideo` is set.

## Config

Copy `sample-config.json` into your input directory as `config.json`, then update scene file names and provider settings.

Clip providers:

- `local-ffmpeg`: no API key; creates motion from the local `sourceImage` files.
- `openrouter`: requires `OPENROUTER_API_KEY`; submits one image-to-video job per scene, polls, downloads the generated MP4, then assembles the final video locally.

When `clip.provider` is `openrouter`, each scene must include `sourceImageUrl`, a stable public HTTPS image URL that returns an image content type. The local `sourceImage` is still useful as the authoritative reference file in your input directory.

Voiceover providers:

- `silent`: no API key; creates a silent track for render validation.
- `macos-say`: no API key on macOS; creates local computer-voice audio for timing validation.
- `elevenlabs`: requires `ELEVENLABS_API_KEY` and `voiceover.elevenLabsVoiceId`.

## API Keys

Only the selected provider path needs credentials.

```bash
export ELEVENLABS_API_KEY="..."
export OPENROUTER_API_KEY="..."
export HEYGEN_API_KEY="..."
```

Current prototype behavior:

- `OPENROUTER_API_KEY` is used when `clip.provider` is `openrouter`.
- `ELEVENLABS_API_KEY` is used when `voiceover.provider` is `elevenlabs`.
- `HEYGEN_API_KEY` is documented for the production avatar adapter path. The local prototype overlays a provided local avatar video instead, because HeyGen audio-source generation needs a public audio URL or uploaded audio asset.

Avatar providers:

- `local`: overlays `avatar.localVideo` from the input directory.
- `heygen`: uses a HeyGen public avatar through `avatar.heyGenAvatarId`, generates a green-screen MP4, downloads it, chroma-keys it, and overlays it lower-right. The runner loads `.env.local` automatically, so `HEYGEN_API_KEY` can live there for prototype runs.

OpenRouter video generation uses `POST https://openrouter.ai/api/v1/videos`, polls the returned job, and downloads the completed video. The default sample model is `google/veo-3.1-lite`, but model capabilities change; check available video models with:

```bash
curl https://openrouter.ai/api/v1/videos/models \
  -H "Authorization: Bearer $OPENROUTER_API_KEY"
```

## Output

The prototype writes:

```txt
prototype-output/
  script.xml
  manifest.json
  clips/
  plans/
    scene-prompts.json
    render-plan.json
    concat.txt
  walkthrough-muted.mp4
  voiceover-silent.m4a or voiceover.mp3
  walkthrough-with-voiceover.mp4
  final-tour.mp4
```

## Production Architecture Notes

The prototype intentionally follows the PRD and architecture docs:

- Scenes are `TourScenes`, not generic rooms.
- Image-to-video prompts are strict preservation prompts with controlled camera motion.
- Script timing comes from ordered scene duration, not from asking a model to infer timing from rendered video.
- Voiceover is required for V1 export.
- Avatar is optional.
- Final output is one V1 preset: 9:16, 1080x1920, H.264/AAC MP4.
