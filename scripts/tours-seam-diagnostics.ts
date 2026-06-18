/**
 * Diagnose avatar dropouts at provider clip seams without regenerating paid assets.
 *
 * Usage:
 *   npx tsx scripts/tours-seam-diagnostics.ts --project b52cfcb1-4cdb-4325-843a-d8e03a78e13b
 *   npx tsx scripts/tours-seam-diagnostics.ts --project <project-id> --run <run-id>
 */

import { execFile } from "node:child_process";
import { promises as fs } from "node:fs";
import path from "node:path";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

const GENERATED_MEDIA_BUCKET = "tours-generated-media";
const DEFAULT_PROJECT_ID = "b52cfcb1-4cdb-4325-843a-d8e03a78e13b";

type CliArgs = {
  projectId: string;
  runId: string | null;
  outputDir: string | null;
  skipFrames: boolean;
};

type JsonRecord = Record<string, any>;

type RenderRunRow = {
  id: string;
  status: string;
  result_asset_id: string | null;
  options: JsonRecord;
  created_at: string;
  completed_at: string | null;
};

type RenderAssetRow = {
  id: string;
  kind: string;
  scene_id: string | null;
  created_by_run_id: string | null;
  storage_bucket: string | null;
  storage_path: string | null;
  content_type: string | null;
  fingerprint: JsonRecord;
  metadata: JsonRecord;
  created_at: string;
  deleted_at: string | null;
  storage_deleted_at: string | null;
};

type DownloadedAsset = RenderAssetRow & {
  localPath: string;
  size: number;
};

type Probe = {
  format?: {
    duration?: string;
    start_time?: string;
    bit_rate?: string;
  };
  streams?: Array<{
    index: number;
    codec_type?: string;
    codec_name?: string;
    width?: number;
    height?: number;
    pix_fmt?: string;
    r_frame_rate?: string;
    avg_frame_rate?: string;
    time_base?: string;
    start_time?: string;
    duration?: string;
    nb_frames?: string;
  }>;
};

type ProbeMap = Record<string, Probe>;

type AvatarOverlay = {
  placement?: {
    avatarWidth?: number;
    overlayX?: string;
    overlayY?: string;
  };
  canvas?: {
    width?: number;
    height?: number;
  };
  ffmpeg: {
    avatarInputCodec?: string;
    outputVideoCodec?: string;
    outputAudioCodec?: string;
    filterComplex: string;
  };
};

type CommandResult = {
  stdout: string;
  stderr: string;
};

type ExperimentResult = {
  label: string;
  theory: string;
  joinedPath: string;
  muxPath: string;
  joinedProbeKey: string;
  muxProbeKey: string;
  joinedDurationSeconds: number | null;
  expectedDurationSeconds: number;
  durationDeltaSeconds: number | null;
  validJoinedDuration: boolean;
  visibilityScores: AvatarVisibilityScore[];
  summary: {
    minAvatarDiffYAvg: number | null;
    averageAvatarDiffYAvg: number | null;
    likelyDropoutFrames: number;
    measuredFrameCount: number;
    expectedFrameCount: number;
  };
};

type AvatarVisibilityScore = {
  seamIndex: number;
  timestampSeconds: number;
  offsetSeconds: number;
  avatarDiffYAvg: number | null;
  avatarDiffYMax: number | null;
  likelyDropout: boolean | null;
};

type OverlayCrop = {
  x: number;
  y: number;
  width: number;
  height: number;
};

function parseArgs(argv: string[]): CliArgs {
  const args: CliArgs = {
    projectId: DEFAULT_PROJECT_ID,
    runId: null,
    outputDir: null,
    skipFrames: false,
  };

  for (let index = 2; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === "--project" || arg === "--project-id") {
      args.projectId = requireValue(argv[++index], arg);
    } else if (arg === "--run" || arg === "--run-id") {
      args.runId = requireValue(argv[++index], arg);
    } else if (arg === "--output" || arg === "--output-dir") {
      args.outputDir = requireValue(argv[++index], arg);
    } else if (arg === "--skip-frames") {
      args.skipFrames = true;
    } else if (arg === "--help" || arg === "-h") {
      printHelp();
      process.exit(0);
    } else {
      throw new Error(`Unknown argument: ${arg}`);
    }
  }

  return args;
}

function requireValue(value: string | undefined, flag: string): string {
  if (!value) throw new Error(`Missing value for ${flag}`);
  return value;
}

function printHelp(): void {
  console.log(`
Usage:
  npx tsx scripts/tours-seam-diagnostics.ts --project ${DEFAULT_PROJECT_ID}
  npx tsx scripts/tours-seam-diagnostics.ts --project <project-id> --run <run-id>

What it does:
  - Loads Supabase credentials from .env.local.
  - Finds a completed provider_image_to_video avatar render run.
  - Downloads scene clips, voiceover, avatar, avatar metadata, joined scenes, and final video.
  - Probes stream timing with ffprobe.
  - Rebuilds joined scenes with current copy-concat behavior.
  - Normalizes each provider clip, copy-concats normalized clips, then remuxes the avatar.
  - Exports seam frames around clip boundaries unless --skip-frames is set.
`);
}

async function loadEnv(filePath: string): Promise<void> {
  try {
    const text = await fs.readFile(filePath, "utf8");
    for (const raw of text.split(/\n/)) {
      const line = raw.trim();
      if (!line || line.startsWith("#")) continue;
      const index = line.indexOf("=");
      if (index < 0) continue;
      const key = line.slice(0, index).trim();
      let value = line.slice(index + 1).trim();
      if (
        (value.startsWith("\"") && value.endsWith("\"")) ||
        (value.startsWith("'") && value.endsWith("'"))
      ) {
        value = value.slice(1, -1);
      }
      process.env[key] ||= value;
    }
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
  }
}

function createSupabase(): SupabaseClient {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceRoleKey) {
    throw new Error("Missing NEXT_PUBLIC_SUPABASE_URL/SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY.");
  }

  return createClient(url, serviceRoleKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  });
}

async function main(): Promise<void> {
  const args = parseArgs(process.argv);
  await loadEnv(path.join(process.cwd(), ".env.local"));
  const supabase = createSupabase();
  const renderRun = args.runId
    ? await getRunById(supabase, args.projectId, args.runId)
    : await getLatestCompletedProviderRun(supabase, args.projectId);

  if (!renderRun) {
    throw new Error("No matching completed provider_image_to_video run found.");
  }

  const assets = await getRunAssets(supabase, args.projectId, renderRun.id);
  const outputDir = path.resolve(
    args.outputDir || path.join("tmp", "tour-seam-diagnostics", renderRun.id)
  );
  await fs.mkdir(outputDir, { recursive: true });

  const downloaded = await downloadAssets(supabase, assets, outputDir);
  const sceneClips = downloaded
    .filter((asset) => asset.kind === "scene_clip")
    .sort((a, b) => {
      const aOrder = Number(a.fingerprint?.scene?.sortOrder ?? 0);
      const bOrder = Number(b.fingerprint?.scene?.sortOrder ?? 0);
      return aOrder - bOrder || a.created_at.localeCompare(b.created_at);
    });
  const voiceover = pickOne(downloaded, "voiceover_audio");
  const avatar = pickOne(downloaded, "avatar_video");
  const avatarMetadataAsset = pickOne(downloaded, "avatar_metadata");
  const joinedScenes = pickOne(downloaded, "joined_scenes", false);
  const finalVideo = pickOne(downloaded, "final_video", false);

  if (sceneClips.length < 2) {
    throw new Error(`Need at least two scene clips to test seams; found ${sceneClips.length}.`);
  }
  if (!voiceover || !avatar || !avatarMetadataAsset) {
    throw new Error("Need voiceover_audio, avatar_video, and avatar_metadata assets.");
  }

  const avatarMetadata = JSON.parse(await fs.readFile(avatarMetadataAsset.localPath, "utf8")) as {
    overlay?: AvatarOverlay;
  };
  const overlay = avatarMetadata.overlay;
  if (!overlay?.ffmpeg?.filterComplex) {
    throw new Error("Avatar metadata did not include overlay.ffmpeg.filterComplex.");
  }

  const probes: ProbeMap = {};
  for (const asset of downloaded) {
    if (asset.content_type?.startsWith("video/") || asset.content_type?.startsWith("audio/")) {
      probes[asset.id] = await ffprobe(asset.localPath);
    }
  }

  const originalConcatList = path.join(outputDir, "original-clips.txt");
  await writeConcatList(originalConcatList, sceneClips.map((asset) => asset.localPath));

  const seamTimes = getSeamTimes(sceneClips, probes);
  const expectedJoinedDurationSeconds = getTotalDuration(sceneClips, probes);
  const overlayCrop = resolveOverlayCrop({
    overlay,
    avatarProbe: probes[avatar.id],
  });
  const experiments: ExperimentResult[] = [];

  const originalJoinedCopy = path.join(outputDir, "joined-original-copy.mp4");
  await joinWithConcatCopy(originalConcatList, originalJoinedCopy);
  await addExperiment({
    label: "original-copy",
    theory: "Production-like concat demuxer with stream copy.",
    joinedPath: originalJoinedCopy,
    voiceoverPath: voiceover.localPath,
    avatarPath: avatar.localPath,
    overlay,
    outputDir,
    seamTimes,
    expectedJoinedDurationSeconds,
    overlayCrop,
    probes,
    experiments,
  });

  const copyThenReencodedJoined = path.join(outputDir, "joined-copy-then-reencoded.mp4");
  await reencodeJoinedVideo(originalJoinedCopy, copyThenReencodedJoined);
  await addExperiment({
    label: "copy-then-reencode",
    theory: "Stream-copy concat first, then re-encode the joined scenes to canonical timing.",
    joinedPath: copyThenReencodedJoined,
    voiceoverPath: voiceover.localPath,
    avatarPath: avatar.localPath,
    overlay,
    outputDir,
    seamTimes,
    expectedJoinedDurationSeconds,
    overlayCrop,
    probes,
    experiments,
  });

  const genptsJoinedCopy = path.join(outputDir, "joined-original-copy-genpts.mp4");
  await joinWithConcatCopy(originalConcatList, genptsJoinedCopy, { genpts: true });
  await addExperiment({
    label: "copy-genpts",
    theory: "Concat demuxer with stream copy and generated input PTS.",
    joinedPath: genptsJoinedCopy,
    voiceoverPath: voiceover.localPath,
    avatarPath: avatar.localPath,
    overlay,
    outputDir,
    seamTimes,
    expectedJoinedDurationSeconds,
    overlayCrop,
    probes,
    experiments,
  });

  const reencodedJoined = path.join(outputDir, "joined-original-reencoded.mp4");
  await joinWithConcatReencode(originalConcatList, reencodedJoined);
  await addExperiment({
    label: "joined-reencode",
    theory: "Concat demuxer followed by canonical 1080x1920/30fps re-encode.",
    joinedPath: reencodedJoined,
    voiceoverPath: voiceover.localPath,
    avatarPath: avatar.localPath,
    overlay,
    outputDir,
    seamTimes,
    expectedJoinedDurationSeconds,
    overlayCrop,
    probes,
    experiments,
  });

  const filterJoined = path.join(outputDir, "joined-filter-concat.mp4");
  await joinWithConcatFilter(
    sceneClips.map((asset) => asset.localPath),
    filterJoined
  );
  await addExperiment({
    label: "filter-concat",
    theory: "Decode each clip, normalize PTS/fps/shape, then concat in a filtergraph.",
    joinedPath: filterJoined,
    voiceoverPath: voiceover.localPath,
    avatarPath: avatar.localPath,
    overlay,
    outputDir,
    seamTimes,
    expectedJoinedDurationSeconds,
    overlayCrop,
    probes,
    experiments,
  });

  const normalizedDir = path.join(outputDir, "normalized-clips");
  await fs.mkdir(normalizedDir, { recursive: true });
  const normalizedClips: string[] = [];
  for (const [index, asset] of sceneClips.entries()) {
    const normalizedPath = path.join(
      normalizedDir,
      `${String(index + 1).padStart(2, "0")}-${asset.id}.mp4`
    );
    await normalizeClip(asset.localPath, normalizedPath);
    normalizedClips.push(normalizedPath);
    probes[`normalizedClip:${asset.id}`] = await ffprobe(normalizedPath);
  }

  const normalizedConcatList = path.join(outputDir, "normalized-clips.txt");
  await writeConcatList(normalizedConcatList, normalizedClips);
  const normalizedJoinedCopy = path.join(outputDir, "joined-normalized-clips-copy.mp4");
  await joinWithConcatCopy(normalizedConcatList, normalizedJoinedCopy);
  await addExperiment({
    label: "normalized-clips-copy",
    theory: "Normalize provider clips first, then concat normalized clips with stream copy.",
    joinedPath: normalizedJoinedCopy,
    voiceoverPath: voiceover.localPath,
    avatarPath: avatar.localPath,
    overlay,
    outputDir,
    seamTimes,
    expectedJoinedDurationSeconds,
    overlayCrop,
    probes,
    experiments,
  });

  if (!args.skipFrames) {
    await exportSeamFrames({
      outputDir: path.join(outputDir, "frames"),
      seamTimes,
      videos: [
        { label: "stored-final", path: finalVideo?.localPath },
        { label: "stored-joined", path: joinedScenes?.localPath },
        ...experiments.map((experiment) => ({
          label: experiment.label,
          path: experiment.muxPath,
        })),
      ].filter((video): video is { label: string; path: string } => Boolean(video.path)),
    });
  }

  const report = {
    projectId: args.projectId,
    run: {
      id: renderRun.id,
      created_at: renderRun.created_at,
      completed_at: renderRun.completed_at,
      result_asset_id: renderRun.result_asset_id,
      renderMode: renderRun.options?.renderMode ?? null,
    },
    outputDir,
    assets: downloaded.map((asset) => ({
      id: asset.id,
      kind: asset.kind,
      scene_id: asset.scene_id,
      content_type: asset.content_type,
      storage_path: asset.storage_path,
      localPath: asset.localPath,
      size: asset.size,
      durationSeconds: asset.metadata?.durationSeconds ?? null,
      sortOrder: asset.fingerprint?.scene?.sortOrder ?? null,
    })),
    seamTimes,
    overlayCrop,
    generated: {
      experiments: experiments.map((experiment) => ({
        label: experiment.label,
        joinedPath: experiment.joinedPath,
        muxPath: experiment.muxPath,
      })),
      framesDir: args.skipFrames ? null : path.join(outputDir, "frames"),
    },
    experimentResults: experiments,
    recommendedExperiment: pickRecommendedExperiment(experiments)?.label ?? null,
    probes: summarizeProbes(probes),
  };

  const reportPath = path.join(outputDir, "report.json");
  await fs.writeFile(reportPath, `${JSON.stringify(report, null, 2)}\n`);
  console.log(`Diagnostics written to ${outputDir}`);
  console.log(`Report: ${reportPath}`);
  console.log(`Run: ${renderRun.id}`);
  console.log(`Scene clips: ${sceneClips.length}`);
  console.log(`Seams: ${seamTimes.map((time) => `${time.toFixed(3)}s`).join(", ")}`);
  const recommended = pickRecommendedExperiment(experiments);
  if (recommended) {
    console.log(
      `Best score: ${recommended.label} (min diff ${formatNullableNumber(recommended.summary.minAvatarDiffYAvg)}, likely dropouts ${recommended.summary.likelyDropoutFrames})`
    );
  }
}

async function getRunById(
  supabase: SupabaseClient,
  projectId: string,
  runId: string
): Promise<RenderRunRow | null> {
  const { data, error } = await supabase
    .from("tour_render_runs")
    .select("id,status,result_asset_id,options,created_at,completed_at")
    .eq("project_id", projectId)
    .eq("id", runId)
    .maybeSingle<RenderRunRow>();
  if (error) throw error;
  return data;
}

async function getLatestCompletedProviderRun(
  supabase: SupabaseClient,
  projectId: string
): Promise<RenderRunRow | null> {
  const { data, error } = await supabase
    .from("tour_render_runs")
    .select("id,status,result_asset_id,options,created_at,completed_at")
    .eq("project_id", projectId)
    .eq("status", "completed")
    .order("created_at", { ascending: false })
    .returns<RenderRunRow[]>();
  if (error) throw error;
  return (data || []).find((run) => run.options?.renderMode === "provider_image_to_video") || null;
}

async function getRunAssets(
  supabase: SupabaseClient,
  projectId: string,
  runId: string
): Promise<RenderAssetRow[]> {
  const { data, error } = await supabase
    .from("tour_render_assets")
    .select(
      "id,kind,scene_id,created_by_run_id,storage_bucket,storage_path,content_type,fingerprint,metadata,created_at,deleted_at,storage_deleted_at"
    )
    .eq("project_id", projectId)
    .eq("created_by_run_id", runId)
    .is("deleted_at", null)
    .is("storage_deleted_at", null)
    .order("created_at", { ascending: true })
    .returns<RenderAssetRow[]>();
  if (error) throw error;
  return data || [];
}

async function downloadAssets(
  supabase: SupabaseClient,
  assets: RenderAssetRow[],
  outputDir: string
): Promise<DownloadedAsset[]> {
  const result: DownloadedAsset[] = [];
  for (const asset of assets) {
    if (asset.storage_bucket !== GENERATED_MEDIA_BUCKET || !asset.storage_path) continue;
    const { data, error } = await supabase.storage
      .from(asset.storage_bucket)
      .download(asset.storage_path);
    if (error || !data) {
      throw new Error(`Failed to download ${asset.kind} ${asset.id}: ${error?.message || "no data"}`);
    }

    const extension = extensionForAsset(asset);
    const localPath = path.join(outputDir, `${asset.kind}-${asset.id}${extension}`);
    const buffer = Buffer.from(await data.arrayBuffer());
    await fs.writeFile(localPath, buffer);
    result.push({ ...asset, localPath, size: buffer.length });
  }
  return result;
}

function extensionForAsset(asset: RenderAssetRow): string {
  const fromPath = path.extname(asset.storage_path || "");
  if (fromPath) return fromPath;
  if (asset.content_type === "video/mp4") return ".mp4";
  if (asset.content_type === "video/webm") return ".webm";
  if (asset.content_type?.startsWith("audio/")) return ".mp3";
  if (asset.content_type === "application/json") return ".json";
  return ".bin";
}

function pickOne(assets: DownloadedAsset[], kind: string, required = true): DownloadedAsset | null {
  const matches = assets.filter((asset) => asset.kind === kind);
  if (!matches.length && required) throw new Error(`Missing required asset kind: ${kind}`);
  return matches.at(-1) || null;
}

async function addExperiment(input: {
  label: string;
  theory: string;
  joinedPath: string;
  voiceoverPath: string;
  avatarPath: string;
  overlay: AvatarOverlay;
  outputDir: string;
  seamTimes: number[];
  expectedJoinedDurationSeconds: number;
  overlayCrop: OverlayCrop | null;
  probes: ProbeMap;
  experiments: ExperimentResult[];
}): Promise<void> {
  const muxPath = path.join(input.outputDir, `avatar-over-${input.label}.mp4`);
  const joinedProbeKey = `joined:${input.label}`;
  const muxProbeKey = `mux:${input.label}`;
  input.probes[joinedProbeKey] = await ffprobe(input.joinedPath);
  const joinedDurationSeconds = probeDurationSeconds(input.probes[joinedProbeKey]);
  const durationDeltaSeconds =
    joinedDurationSeconds === null ? null : joinedDurationSeconds - input.expectedJoinedDurationSeconds;
  const validJoinedDuration =
    durationDeltaSeconds !== null && Math.abs(durationDeltaSeconds) <= 0.25;
  await muxAvatar({
    joinedPath: input.joinedPath,
    avatarPath: input.avatarPath,
    voiceoverPath: input.voiceoverPath,
    overlay: input.overlay,
    outputPath: muxPath,
  });
  input.probes[muxProbeKey] = await ffprobe(muxPath);

  const visibilityScores = input.overlayCrop
    ? await scoreAvatarVisibility({
        muxPath,
        joinedPath: input.joinedPath,
        seamTimes: input.seamTimes,
        crop: input.overlayCrop,
      })
    : [];

  input.experiments.push({
    label: input.label,
    theory: input.theory,
    joinedPath: input.joinedPath,
    muxPath,
    joinedProbeKey,
    muxProbeKey,
    joinedDurationSeconds,
    expectedDurationSeconds: input.expectedJoinedDurationSeconds,
    durationDeltaSeconds,
    validJoinedDuration,
    visibilityScores,
    summary: summarizeVisibilityScores(visibilityScores),
  });
}

async function joinWithConcatCopy(
  concatListPath: string,
  outputPath: string,
  options: { genpts?: boolean } = {}
): Promise<void> {
  await runCommand("ffmpeg", [
    "-y",
    ...(options.genpts ? ["-fflags", "+genpts"] : []),
    "-f",
    "concat",
    "-safe",
    "0",
    "-i",
    concatListPath,
    "-c",
    "copy",
    outputPath,
  ]);
}

async function joinWithConcatReencode(concatListPath: string, outputPath: string): Promise<void> {
  await runCommand("ffmpeg", [
    "-y",
    "-f",
    "concat",
    "-safe",
    "0",
    "-i",
    concatListPath,
    "-vf",
    canonicalVideoFilter(),
    "-an",
    "-c:v",
    "libx264",
    "-preset",
    "medium",
    "-crf",
    "20",
    "-pix_fmt",
    "yuv420p",
    "-movflags",
    "+faststart",
    outputPath,
  ]);
}

async function reencodeJoinedVideo(inputPath: string, outputPath: string): Promise<void> {
  await runCommand("ffmpeg", [
    "-y",
    "-i",
    inputPath,
    "-vf",
    canonicalVideoFilter(),
    "-an",
    "-c:v",
    "libx264",
    "-preset",
    "medium",
    "-crf",
    "20",
    "-pix_fmt",
    "yuv420p",
    "-movflags",
    "+faststart",
    outputPath,
  ]);
}

async function joinWithConcatFilter(inputPaths: string[], outputPath: string): Promise<void> {
  const normalizedLabels = inputPaths
    .map((_, index) => `[${index}:v]${canonicalVideoFilter()}[v${index}]`)
    .join(";");
  const concatInputs = inputPaths.map((_, index) => `[v${index}]`).join("");
  await runCommand("ffmpeg", [
    "-y",
    ...inputPaths.flatMap((inputPath) => ["-i", inputPath]),
    "-filter_complex",
    `${normalizedLabels};${concatInputs}concat=n=${inputPaths.length}:v=1:a=0[v]`,
    "-map",
    "[v]",
    "-an",
    "-c:v",
    "libx264",
    "-preset",
    "medium",
    "-crf",
    "20",
    "-pix_fmt",
    "yuv420p",
    "-movflags",
    "+faststart",
    outputPath,
  ]);
}

async function normalizeClip(inputPath: string, outputPath: string): Promise<void> {
  await runCommand("ffmpeg", [
    "-y",
    "-i",
    inputPath,
    "-vf",
    canonicalVideoFilter(),
    "-an",
    "-c:v",
    "libx264",
    "-preset",
    "medium",
    "-crf",
    "20",
    "-pix_fmt",
    "yuv420p",
    "-movflags",
    "+faststart",
    outputPath,
  ]);
}

function canonicalVideoFilter(): string {
  return "scale=1080:1920:force_original_aspect_ratio=increase,crop=1080:1920,fps=30,setpts=PTS-STARTPTS";
}

async function muxAvatar(input: {
  joinedPath: string;
  avatarPath: string;
  voiceoverPath: string;
  overlay: AvatarOverlay;
  outputPath: string;
}): Promise<void> {
  await runCommand("ffmpeg", [
    "-y",
    "-i",
    input.joinedPath,
    "-c:v",
    input.overlay.ffmpeg.avatarInputCodec || "libvpx-vp9",
    "-i",
    input.avatarPath,
    "-i",
    input.voiceoverPath,
    "-filter_complex",
    input.overlay.ffmpeg.filterComplex,
    "-map",
    "[v]",
    "-map",
    "2:a:0",
    "-c:v",
    input.overlay.ffmpeg.outputVideoCodec || "libx264",
    "-preset",
    "medium",
    "-crf",
    "20",
    "-pix_fmt",
    "yuv420p",
    "-c:a",
    input.overlay.ffmpeg.outputAudioCodec || "aac",
    "-b:a",
    "192k",
    "-shortest",
    "-movflags",
    "+faststart",
    input.outputPath,
  ]);
}

async function writeConcatList(filePath: string, filePaths: string[]): Promise<void> {
  const body = filePaths.map((clipPath) => `file '${escapeConcatPath(clipPath)}'`).join("\n");
  await fs.writeFile(filePath, `${body}\n`);
}

function escapeConcatPath(filePath: string): string {
  return filePath.replaceAll("'", "'\\''");
}

function getSeamTimes(sceneClips: DownloadedAsset[], probes: ProbeMap): number[] {
  const seamTimes: number[] = [];
  let cursor = 0;
  for (const asset of sceneClips.slice(0, -1)) {
    cursor += getClipDuration(asset, probes);
    seamTimes.push(cursor);
  }
  return seamTimes;
}

function getTotalDuration(sceneClips: DownloadedAsset[], probes: ProbeMap): number {
  return sceneClips.reduce((sum, asset) => sum + getClipDuration(asset, probes), 0);
}

function getClipDuration(asset: DownloadedAsset, probes: ProbeMap): number {
  const probedDuration = Number(probes[asset.id]?.format?.duration ?? 0);
  const assetDuration = Number(asset.metadata?.durationSeconds ?? 0);
  return Number.isFinite(probedDuration) && probedDuration > 0 ? probedDuration : assetDuration;
}

function probeDurationSeconds(probe: Probe): number | null {
  const duration = Number(probe.format?.duration ?? 0);
  return Number.isFinite(duration) && duration > 0 ? duration : null;
}

function resolveOverlayCrop(input: {
  overlay: AvatarOverlay;
  avatarProbe: Probe | undefined;
}): OverlayCrop | null {
  const canvasWidth = input.overlay.canvas?.width ?? 1080;
  const canvasHeight = input.overlay.canvas?.height ?? 1920;
  const avatarWidth = input.overlay.placement?.avatarWidth;
  const avatarStream = input.avatarProbe?.streams?.find((stream) => stream.codec_type === "video");
  if (!avatarWidth || !avatarStream?.width || !avatarStream.height) {
    return null;
  }

  const scaledAvatarHeight = Math.round((avatarStream.height * avatarWidth) / avatarStream.width);
  const variables = {
    W: canvasWidth,
    H: canvasHeight,
    w: avatarWidth,
    h: scaledAvatarHeight,
  };
  const rawX = evaluateOverlayExpression(input.overlay.placement?.overlayX ?? "0", variables);
  const rawY = evaluateOverlayExpression(input.overlay.placement?.overlayY ?? "0", variables);
  if (rawX === null || rawY === null) return null;

  const left = Math.max(0, Math.floor(rawX));
  const top = Math.max(0, Math.floor(rawY));
  const right = Math.min(canvasWidth, Math.ceil(rawX + avatarWidth));
  const bottom = Math.min(canvasHeight, Math.ceil(rawY + scaledAvatarHeight));
  const width = right - left;
  const height = bottom - top;
  if (width <= 0 || height <= 0) return null;

  return { x: left, y: top, width, height };
}

function evaluateOverlayExpression(
  expression: string,
  variables: { W: number; H: number; w: number; h: number }
): number | null {
  const replaced = expression
    .replace(/\b[WHwh]\b/g, (match) => String(variables[match as keyof typeof variables]))
    .replaceAll("--", "+")
    .replaceAll("+-", "-");
  if (!/^[\d+\-*/().\s]+$/.test(replaced)) return null;
  try {
    const result = Function(`"use strict"; return (${replaced});`)() as unknown;
    return typeof result === "number" && Number.isFinite(result) ? result : null;
  } catch {
    return null;
  }
}

async function scoreAvatarVisibility(input: {
  muxPath: string;
  joinedPath: string;
  seamTimes: number[];
  crop: OverlayCrop;
}): Promise<AvatarVisibilityScore[]> {
  const scores: AvatarVisibilityScore[] = [];
  for (const [seamIndex, seam] of input.seamTimes.entries()) {
    for (const offsetSeconds of seamFrameOffsets()) {
      const timestampSeconds = Math.max(0, seam + offsetSeconds);
      const stats = await avatarDifferenceStats({
        muxPath: input.muxPath,
        joinedPath: input.joinedPath,
        timestampSeconds,
        crop: input.crop,
      });
      scores.push({
        seamIndex: seamIndex + 1,
        timestampSeconds,
        offsetSeconds,
        avatarDiffYAvg: stats.yAvg,
        avatarDiffYMax: stats.yMax,
        likelyDropout: stats.yAvg === null ? null : stats.yAvg < 1,
      });
    }
  }
  return scores;
}

async function avatarDifferenceStats(input: {
  muxPath: string;
  joinedPath: string;
  timestampSeconds: number;
  crop: OverlayCrop;
}): Promise<{ yAvg: number | null; yMax: number | null }> {
  const cropFilter = `crop=${input.crop.width}:${input.crop.height}:${input.crop.x}:${input.crop.y}`;
  const seekStart = Math.max(0, input.timestampSeconds - 0.5);
  const trimStart = input.timestampSeconds - seekStart;
  const trimEnd = trimStart + 0.05;
  const { stdout, stderr } = await runCommand("ffmpeg", [
    "-v",
    "error",
    "-ss",
    seekStart.toFixed(3),
    "-i",
    input.muxPath,
    "-ss",
    seekStart.toFixed(3),
    "-i",
    input.joinedPath,
    "-filter_complex",
    `[0:v]trim=start=${trimStart.toFixed(3)}:end=${trimEnd.toFixed(3)},setpts=PTS-STARTPTS,${cropFilter},format=rgb24[m];[1:v]trim=start=${trimStart.toFixed(3)}:end=${trimEnd.toFixed(3)},setpts=PTS-STARTPTS,scale=1080:1920:force_original_aspect_ratio=increase,crop=1080:1920,${cropFilter},format=rgb24[b];[m][b]blend=all_mode=difference,format=gray,signalstats,metadata=print:file=-`,
    "-frames:v",
    "1",
    "-f",
    "null",
    "-",
  ], { capture: true });

  return {
    yAvg: parseFfmpegMetadataNumber(`${stdout}\n${stderr}`, "lavfi.signalstats.YAVG"),
    yMax: parseFfmpegMetadataNumber(`${stdout}\n${stderr}`, "lavfi.signalstats.YMAX"),
  };
}

function parseFfmpegMetadataNumber(output: string, key: string): number | null {
  const match = output.match(new RegExp(`${escapeRegExp(key)}=([^\\s]+)`));
  if (!match) return null;
  const value = Number(match[1]);
  return Number.isFinite(value) ? value : null;
}

function summarizeVisibilityScores(scores: AvatarVisibilityScore[]): ExperimentResult["summary"] {
  const yAvgs = scores
    .map((score) => score.avatarDiffYAvg)
    .filter((value): value is number => typeof value === "number" && Number.isFinite(value));
  if (!yAvgs.length) {
    return {
      minAvatarDiffYAvg: null,
      averageAvatarDiffYAvg: null,
      likelyDropoutFrames: 0,
      measuredFrameCount: 0,
      expectedFrameCount: scores.length,
    };
  }

  return {
    minAvatarDiffYAvg: Math.min(...yAvgs),
    averageAvatarDiffYAvg: yAvgs.reduce((sum, value) => sum + value, 0) / yAvgs.length,
    likelyDropoutFrames: scores.filter((score) => score.likelyDropout).length,
    measuredFrameCount: yAvgs.length,
    expectedFrameCount: scores.length,
  };
}

function pickRecommendedExperiment(experiments: ExperimentResult[]): ExperimentResult | null {
  return experiments
    .filter(
      (experiment) =>
        experiment.validJoinedDuration &&
        experiment.summary.minAvatarDiffYAvg !== null &&
        experiment.summary.measuredFrameCount === experiment.summary.expectedFrameCount
    )
    .sort((a, b) => {
      const dropoutDelta = a.summary.likelyDropoutFrames - b.summary.likelyDropoutFrames;
      if (dropoutDelta !== 0) return dropoutDelta;
      return (b.summary.minAvatarDiffYAvg ?? 0) - (a.summary.minAvatarDiffYAvg ?? 0);
    })[0] ?? null;
}

function seamFrameOffsets(): number[] {
  return [-0.1, -0.067, -0.033, 0, 0.033, 0.067, 0.1];
}

async function exportSeamFrames(input: {
  outputDir: string;
  seamTimes: number[];
  videos: Array<{ label: string; path: string }>;
}): Promise<void> {
  await fs.mkdir(input.outputDir, { recursive: true });
  for (const video of input.videos) {
    for (const [index, seam] of input.seamTimes.entries()) {
      for (const offset of seamFrameOffsets()) {
        const timestamp = Math.max(0, seam + offset);
        const outputPath = path.join(
          input.outputDir,
          `${video.label}-seam${index + 1}-${formatTimestamp(timestamp)}.jpg`
        );
        await runCommand("ffmpeg", [
          "-y",
          "-ss",
          timestamp.toFixed(3),
          "-i",
          video.path,
          "-frames:v",
          "1",
          "-q:v",
          "2",
          outputPath,
        ]);
      }
    }
  }
}

function formatTimestamp(seconds: number): string {
  return seconds.toFixed(3).replace(".", "p");
}

function formatNullableNumber(value: number | null): string {
  return value === null ? "n/a" : value.toFixed(3);
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

async function ffprobe(filePath: string): Promise<Probe> {
  const { stdout } = await runCommand("ffprobe", [
    "-v",
    "error",
    "-show_streams",
    "-show_format",
    "-of",
    "json",
    filePath,
  ], { capture: true });
  return JSON.parse(stdout) as Probe;
}

function summarizeProbes(probes: ProbeMap): JsonRecord {
  return Object.fromEntries(
    Object.entries(probes).map(([key, probe]) => [
      key,
      {
        format: {
          duration: probe.format?.duration ?? null,
          start_time: probe.format?.start_time ?? null,
          bit_rate: probe.format?.bit_rate ?? null,
        },
        streams: (probe.streams || []).map((stream) => ({
          index: stream.index,
          codec_type: stream.codec_type,
          codec_name: stream.codec_name,
          width: stream.width ?? null,
          height: stream.height ?? null,
          pix_fmt: stream.pix_fmt ?? null,
          r_frame_rate: stream.r_frame_rate ?? null,
          avg_frame_rate: stream.avg_frame_rate ?? null,
          time_base: stream.time_base ?? null,
          start_time: stream.start_time ?? null,
          duration: stream.duration ?? null,
          nb_frames: stream.nb_frames ?? null,
        })),
      },
    ])
  );
}

async function runCommand(
  command: string,
  args: string[],
  options: { capture?: boolean } = {}
): Promise<CommandResult> {
  return new Promise((resolve, reject) => {
    execFile(command, args, {
      maxBuffer: 1024 * 1024 * 32,
      encoding: "utf8",
    }, (error, stdout, stderr) => {
      if (error) {
        error.message = `${command} failed: ${error.message}\n${stderr}`;
        reject(error);
        return;
      }
      resolve(options.capture ? { stdout, stderr } : { stdout: "", stderr: "" });
    });
  });
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.stack || error.message : error);
  process.exit(1);
});
