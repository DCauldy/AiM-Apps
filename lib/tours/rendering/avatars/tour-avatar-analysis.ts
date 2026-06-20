import { mkdir } from "node:fs/promises";
import path from "node:path";
import { formatTimestampForFile, toPercent } from "./tour-avatar-format";
import {
  probeHeyGenAvatarVideo,
  runHeyGenAvatarBinaryProcess,
  runHeyGenAvatarVoidProcess,
} from "./tour-avatar-process";
import {
  TourAvatarError,
  type AvatarCropRisk,
  type AvatarEdgeTouchRate,
  type HeyGenAvatarAlphaAnalysis,
  type HeyGenAvatarFrameCheck,
  type HeyGenAvatarWorkflowWarning,
  type VisiblePixelBox,
} from "./tour-avatar.types";

export async function analyzeHeyGenAvatarAlpha(input: {
  avatarVideoPath: string;
  alphaThreshold: number;
  sampleEverySeconds: number;
}): Promise<HeyGenAvatarAlphaAnalysis> {
  const { width, height, durationSeconds } = await probeHeyGenAvatarVideo(input.avatarVideoPath);
  const sampleEverySeconds = Math.max(input.sampleEverySeconds, 0.1);
  const frameRate = 1 / sampleEverySeconds;
  const raw = await runHeyGenAvatarBinaryProcess(
    process.env.FFMPEG_PATH || "ffmpeg",
    [
      "-v",
      "error",
      "-c:v",
      "libvpx-vp9",
      "-i",
      input.avatarVideoPath,
      "-vf",
      `fps=${frameRate},format=rgba`,
      "-f",
      "rawvideo",
      "pipe:1",
    ],
    `Could not decode HeyGen avatar alpha frames from ${input.avatarVideoPath}`
  );

  const frameSize = width * height * 4;
  if (frameSize <= 0 || raw.stdoutBuffer.length < frameSize) {
    throw new TourAvatarError(
      "No sampled RGBA frames were decoded from the HeyGen avatar.",
      "AVATAR_ALPHA_ANALYSIS_FAILED"
    );
  }

  const expectedFrames = Math.max(1, Math.ceil(durationSeconds / sampleEverySeconds));
  const frameCount = Math.min(Math.floor(raw.stdoutBuffer.length / frameSize), expectedFrames);
  const boxes: VisiblePixelBox[] = [];
  const edgeTouches = { left: 0, right: 0, top: 0, bottom: 0 };

  for (let frameIndex = 0; frameIndex < frameCount; frameIndex += 1) {
    const offset = frameIndex * frameSize;
    const box = readVisiblePixelBox(raw.stdoutBuffer, offset, width, height, input.alphaThreshold);
    if (!box) continue;
    boxes.push(box);
    if (box.x <= 1) edgeTouches.left += 1;
    if (box.right >= width - 2) edgeTouches.right += 1;
    if (box.y <= 1) edgeTouches.top += 1;
    if (box.bottom >= height - 2) edgeTouches.bottom += 1;
  }

  if (!boxes.length) {
    throw new TourAvatarError(
      "No non-transparent pixels were found in sampled HeyGen avatar frames.",
      "AVATAR_ALPHA_ANALYSIS_FAILED"
    );
  }

  const medianBox = medianVisibleBox(boxes);
  const maxBox = unionVisibleBox(boxes);
  const sampledFrameCount = boxes.length;
  const edgeTouchRate = {
    left: edgeTouches.left / sampledFrameCount,
    right: edgeTouches.right / sampledFrameCount,
    top: edgeTouches.top / sampledFrameCount,
    bottom: edgeTouches.bottom / sampledFrameCount,
  };

  return {
    sourceWidth: width,
    sourceHeight: height,
    sampledFrameCount,
    alphaThreshold: input.alphaThreshold,
    medianBox,
    maxBox,
    transparentPadding: {
      left: medianBox.x,
      right: width - medianBox.right,
      top: medianBox.y,
      bottom: height - medianBox.bottom,
    },
    edgeTouchRate,
    cropRisk: resolveCropRisk({ sourceWidth: width, maxBox, edgeTouchRate }),
  };
}

export async function exportHeyGenAvatarFrameChecks(input: {
  avatarVideoPath: string;
  outputDir: string;
  timestampsSeconds: number[];
}): Promise<HeyGenAvatarFrameCheck[]> {
  await mkdir(input.outputDir, { recursive: true });
  const checks: HeyGenAvatarFrameCheck[] = [];

  for (const timestampSeconds of input.timestampsSeconds) {
    const outputPath = path.join(
      input.outputDir,
      `heygen-avatar-${formatTimestampForFile(timestampSeconds)}s.png`
    );
    await runHeyGenAvatarVoidProcess(process.env.FFMPEG_PATH || "ffmpeg", [
      "-v",
      "error",
      "-y",
      "-ss",
      String(timestampSeconds),
      "-c:v",
      "libvpx-vp9",
      "-i",
      input.avatarVideoPath,
      "-frames:v",
      "1",
      outputPath,
    ]).catch((error) => {
      throw new TourAvatarError(
        `Could not export HeyGen avatar frame at ${timestampSeconds}s: ${error instanceof Error ? error.message : String(error)}`,
        "FRAME_CHECK_FAILED"
      );
    });
    checks.push({ timestampSeconds, path: outputPath });
  }

  return checks;
}

export function collectWorkflowWarnings(
  analysis: HeyGenAvatarAlphaAnalysis
): HeyGenAvatarWorkflowWarning[] {
  return analysis.cropRisk.reasons.map((reason) => ({
    code: reason.includes("92%") ? "avatar-too-tight" : "avatar-edge-touch",
    message: reason,
    severity: analysis.cropRisk.level === "high" ? "warning" : "info",
  }));
}

function readVisiblePixelBox(
  buffer: Buffer,
  frameOffset: number,
  width: number,
  height: number,
  alphaThreshold: number
): VisiblePixelBox | undefined {
  let minX = width;
  let minY = height;
  let maxX = -1;
  let maxY = -1;

  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const alpha = buffer[frameOffset + (y * width + x) * 4 + 3];
      if (alpha <= alphaThreshold) continue;
      if (x < minX) minX = x;
      if (x > maxX) maxX = x;
      if (y < minY) minY = y;
      if (y > maxY) maxY = y;
    }
  }

  if (maxX < minX || maxY < minY) return undefined;
  return toVisibleBox(minX, minY, maxX + 1, maxY + 1);
}

function toVisibleBox(left: number, top: number, right: number, bottom: number): VisiblePixelBox {
  return {
    x: left,
    y: top,
    width: right - left,
    height: bottom - top,
    right,
    bottom,
  };
}

function medianVisibleBox(boxes: VisiblePixelBox[]): VisiblePixelBox {
  return toVisibleBox(
    median(boxes.map((box) => box.x)),
    median(boxes.map((box) => box.y)),
    median(boxes.map((box) => box.right)),
    median(boxes.map((box) => box.bottom))
  );
}

function unionVisibleBox(boxes: VisiblePixelBox[]): VisiblePixelBox {
  return toVisibleBox(
    Math.min(...boxes.map((box) => box.x)),
    Math.min(...boxes.map((box) => box.y)),
    Math.max(...boxes.map((box) => box.right)),
    Math.max(...boxes.map((box) => box.bottom))
  );
}

function median(values: number[]): number {
  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0
    ? Math.round((sorted[middle - 1] + sorted[middle]) / 2)
    : sorted[middle];
}

function resolveCropRisk(input: {
  sourceWidth: number;
  maxBox: VisiblePixelBox;
  edgeTouchRate: AvatarEdgeTouchRate;
}): AvatarCropRisk {
  const reasons: string[] = [];
  if (input.edgeTouchRate.right > 0.15) {
    reasons.push(
      `Avatar touches right edge in ${toPercent(input.edgeTouchRate.right)} of sampled frames; arm may be cropped.`
    );
  }
  if (input.edgeTouchRate.left > 0.15) {
    reasons.push(
      `Avatar touches left edge in ${toPercent(input.edgeTouchRate.left)} of sampled frames; arm may be cropped.`
    );
  }
  if (input.edgeTouchRate.bottom > 0.25) {
    reasons.push(
      `Avatar touches bottom edge in ${toPercent(input.edgeTouchRate.bottom)} of sampled frames; inspect torso framing.`
    );
  }
  if (input.maxBox.width / input.sourceWidth > 0.92) {
    reasons.push(
      "Avatar visible width uses more than 92% of the source frame; source is very tight."
    );
  }

  const sideRisk = input.edgeTouchRate.left > 0.15 || input.edgeTouchRate.right > 0.15;
  const level =
    reasons.length === 0 ? "none" : sideRisk && reasons.length > 1 ? "high" : sideRisk ? "medium" : "low";
  return { level, reasons };
}
