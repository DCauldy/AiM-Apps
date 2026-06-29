# HeyGen Avatar Compositing ADR

## Status

Accepted for the tours prototype.

## Context

The prototype in `throwaway-prototypes/tours/test1` generates a vertical real-estate tour video and then overlays a HeyGen talking avatar. Previous runs missed important details around HeyGen alpha handling, avatar scale, and avatar placement, which caused bad output even when the generated assets themselves were usable.

The relevant prototype scripts are:

- `throwaway-prototypes/tours/test1/scripts/run-tour.mjs`
- `throwaway-prototypes/tours/test1/scripts/add-heygen-avatar.mjs`
- `throwaway-prototypes/tours/test1/scripts/workflow.ts`
- `throwaway-prototypes/tours/test1/scripts/render-final-tour-video.ts`

The current best known rendered output is:

```text
throwaway-prototypes/tours/test1/output/the-mansion-final-heygen-alpha-large.mp4
```

The current good render used:

```text
avatar width: 580px
right margin: 48px
bottom margin: 80px
VP9 alpha decode: -c:v libvpx-vp9 before the avatar input
overlay: x=W-w-48:y=H-h-80:format=auto
```

The runnable scripts had drifted from that knowledge. At the time this ADR was written, both `add-heygen-avatar.mjs` and `render-final-tour-video.ts` still used `scale=360:-1` and did not force VP9 alpha decoding for the avatar input.

## Decision

HeyGen avatars must be treated as transparent foreground video layers, not normal video clips.

The compositor must preserve alpha explicitly, expose avatar scale and placement as config, and support visual placement based on the visible avatar pixels rather than only the avatar video frame.

## Required HeyGen Generation Settings

For compositing, request a transparent WebM avatar layer:

```js
{
  type: "avatar",
  aspect_ratio: "9:16",
  fit: "contain",
  remove_background: true,
  output_format: "webm"
}
```

If Avatar V is available for the selected avatar, prefer it for better subject quality:

```js
engine: { type: "avatar_v" }
```

Confirm the exact `engine.type` enum against HeyGen's API before committing a production integration. HeyGen's current API docs state that `POST /v3/videos` supports Avatar IV and Avatar V through the `engine` field, and defaults to Avatar IV when omitted for eligible avatars.

Avatar V improves the avatar subject quality: identity stability, long-form consistency, motion, expressions, and gesture realism. It does not solve ffmpeg alpha preservation, scale, placement, or final compositing by itself.

## Alpha Preservation

Do not chromakey the avatar background.

The first bad HeyGen overlay had a black rectangle because the avatar WebM carried alpha metadata, but ffmpeg did not preserve the alpha channel through the default decode path. A chromakey attempt is also wrong because dark clothing can be damaged by keying black.

The avatar input must be decoded with `libvpx-vp9`:

```sh
ffmpeg \
  -y \
  -i output/joined-scenes.mp4 \
  -c:v libvpx-vp9 \
  -i output/avatar/heygen-avatar.webm \
  -i output/audio/voiceover.mp3 \
  -filter_complex "[0:v]scale=1080:1920:force_original_aspect_ratio=increase,crop=1080:1920[bg];[1:v]scale=580:-1[av];[bg][av]overlay=x=W-w-48:y=H-h-80:format=auto[v]" \
  -map "[v]" \
  -map "2:a:0" \
  -c:v libx264 \
  -preset medium \
  -crf 20 \
  -c:a aac \
  -b:a 192k \
  -shortest \
  -movflags +faststart \
  output/the-mansion-final-heygen-alpha-large.mp4
```

The position of `-c:v libvpx-vp9` matters. It must appear before the avatar `-i` because it applies to the next video input.

## Scale And Position

The prototype should expose avatar placement as explicit config:

```ts
type AvatarPlacement = {
  width: number;
  rightMargin: number;
  bottomMargin: number;
};
```

The current known-good starting point is:

```ts
{
  width: 580,
  rightMargin: 48,
  bottomMargin: 80,
}
```

For flush bottom-right placement, use:

```text
overlay=x=W-w:y=H-h:format=auto
```

Flush placement means the avatar video layer is flush. It does not guarantee that the visible person is flush, because HeyGen may include transparent padding inside the WebM frame.

Recommended placement test matrix:

```text
flush:      width=580 right=0  bottom=0
nearFlush:  width=580 right=16 bottom=24
safeFlush:  width=580 right=32 bottom=48
current:    width=580 right=48 bottom=80
small:      width=460 right=40 bottom=72
medium:     width=520 right=44 bottom=76
large:      width=580 right=48 bottom=80
xl:         width=640 right=48 bottom=88
```

Expected useful width range for vertical 1080x1920 tour videos is roughly `520-580px`. Below `500px`, the avatar can feel like a sticker. Above `640px`, the avatar can hide too much property detail.

## Visible Pixel Bounding Box

The best way to make the avatar appear truly flush is to detect the visible avatar bounding box from the alpha channel.

The avatar WebM frame can be flush while the visible person is inset by transparent padding. Therefore, layout should eventually be based on non-transparent pixels, not only `videoWidth` and `videoHeight`.

For sampled frames:

1. Decode the avatar WebM with alpha preserved.
2. Read the alpha channel.
3. Treat pixels with `alpha > 16` as visible.
4. Compute a bounding box:

```text
visibleLeft
visibleTop
visibleRight
visibleBottom
visibleWidth
visibleHeight
```

Then compute transparent padding:

```text
paddingLeft = visibleLeft
paddingTop = visibleTop
paddingRight = frameWidth - visibleRight
paddingBottom = frameHeight - visibleBottom
```

For visible-avatar flush placement, compensate for padding after scaling:

```text
overlayX = canvasWidth - scaledVisibleRight
overlayY = canvasHeight - scaledVisibleBottom
```

This positions the visible person, not just the transparent video layer.

## Crop And Arm Cutoff Detection

Alpha bounding box analysis should also warn when the avatar source appears cropped too tightly.

Warning signs:

```text
visibleLeft <= 1
visibleRight >= frameWidth - 2
visibleTop <= 1
visibleBottom >= frameHeight - 2
```

If non-transparent pixels repeatedly touch a frame edge, the source avatar may have been recorded or generated too tightly. This is especially important for arms and hands.

Suggested sampling:

```text
sample one frame per second across the avatar duration
```

Suggested metrics:

```json
{
  "sourceWidth": 720,
  "sourceHeight": 402,
  "medianBox": { "x": 84, "y": 6, "width": 502, "height": 392 },
  "maxBox": { "x": 32, "y": 0, "width": 612, "height": 402 },
  "edgeTouchRate": {
    "left": 0.08,
    "right": 0.22,
    "top": 0.01,
    "bottom": 0.97
  },
  "warnings": [
    "Avatar touches right edge in 22% of sampled frames; arm may be cropped."
  ]
}
```

Suggested thresholds:

```text
right edge touch rate > 0.15 => likely right-side crop
left edge touch rate > 0.15 => likely left-side crop
bottom edge touch rate > 0.25 => normal for torso, but inspect if side edges also touch
visibleWidth / frameWidth > 0.92 => avatar source is very tight
```

Use the max visible box to reserve enough room for gestures. Use the median visible box for stable placement.

## Timing Rules

Use `joined-scenes.mp4` as the background for avatar compositing, not `the-mansion-final.mp4`, when the avatar was generated from the full voiceover.

Known prototype durations:

```text
the-mansion-final.mp4: 46.29s
joined-scenes.mp4: 63.2s
heygen-avatar.webm: 62.58s
the-mansion-final-heygen-alpha-large.mp4: 62.55s
```

The final compositor should use `-shortest` so the output ends with the shortest mapped stream.

## Visual QA

Do not judge avatar placement from one frame.

Export spot-check frames for each candidate render:

```text
1s
6s
12s
30s
45s
55s
61s
```

Check:

- Does the avatar preserve transparent edges?
- Is there any black rectangle or keying damage?
- Is the head and torso visible?
- Are arms or hands cut off?
- Does the avatar block important property details?
- Does flush placement still look intentional?
- Would mobile player UI, captions, or controls cover the avatar?

Useful ffmpeg frame export:

```sh
ffmpeg -ss 30 -i final.mp4 -frames:v 1 frame-30s.jpg
```

## Implementation Guidance

The next implementation should centralize compositing in one helper used by both the post-processing script and the transcript-driven workflow.

Recommended responsibilities:

- Generate HeyGen avatar WebM with background removed.
- Decode avatar input with `libvpx-vp9`.
- Expose avatar width and margins as config.
- Support raw video-layer anchoring first.
- Add alpha-bounding-box analysis for visible-pixel anchoring.
- Emit crop/cutoff warnings before final render.
- Render a small matrix of placement variants without regenerating HeyGen, ElevenLabs, or scene clips.
- Export frame checks for each candidate.

Avoid rerunning expensive asset generation when tuning placement. Placement should be iterated from existing:

```text
output/joined-scenes.mp4
output/audio/voiceover.mp3
output/avatar/heygen-avatar.webm
```

## Non-Goals

This ADR does not decide:

- The final production UI for avatar placement controls.
- The exact final Avatar V API enum.
- Whether captions or lower-thirds are present.
- Whether all tours must use flush placement.

## Agent Checklist

Before declaring avatar compositing work done:

- Confirm `remove_background: true` and `output_format: "webm"` are used for HeyGen.
- Confirm `-c:v libvpx-vp9` appears before the avatar `-i`.
- Confirm chromakey is not used for normal HeyGen alpha removal.
- Confirm default avatar width is not accidentally left at `360px`.
- Confirm placement is configurable.
- Confirm candidate frame checks were generated or visually reviewed.
- Confirm flush placement accounts for transparent padding if visible flush is required.
- Confirm warnings exist or are planned for edge-touch/cropped-arm risk.
- Confirm `joined-scenes.mp4` is used when matching the full avatar/voiceover duration.
