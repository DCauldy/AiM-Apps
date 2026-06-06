#!/usr/bin/env node

// PROTOTYPE - throwaway terminal runner for the Tours image/script/audio/final-video flow.

import fs from "node:fs/promises";
import fsSync from "node:fs";
import path from "node:path";
import readline from "node:readline";
import { spawn } from "node:child_process";
import {
  CAMERA_MOTIONS,
  approveAll,
  buildRenderPlan,
  buildVoiceoverSegments,
  createInitialState,
  normalizeConfig,
  recordArtifacts,
  summarizeState,
  toggleAvatar,
} from "./tour-video-prototype.logic.mjs";

const IMAGE_EXTENSIONS = new Set([".jpg", ".jpeg", ".png", ".webp"]);

async function main() {
  loadEnvFile(path.resolve(".env.local"));
  const args = parseArgs(process.argv.slice(2));
  const inputDir = path.resolve(args.input ?? "tours-prototype-input");
  const outputDir = path.resolve(args.output ?? path.join(inputDir, "prototype-output"));
  const config = await loadConfig(inputDir);
  const discoveredImages = await discoverImages(inputDir);
  let state = createInitialState(normalizeConfig(config, discoveredImages), inputDir, outputDir);

  await ensureInputState(state);

  if (args.run) {
    state = approveAll(state);
    state = await runPipeline(state, { writeOnly: args["write-only"] === true, reuseVideo: args["reuse-video"] === true });
    printSummary(state);
    return;
  }

  await interactiveLoop(state);
}

async function interactiveLoop(initialState) {
  let state = initialState;
  renderFrame(state);

  readline.emitKeypressEvents(process.stdin);
  if (process.stdin.isTTY) process.stdin.setRawMode(true);

  for await (const [, key] of process.stdin) {
    const name = key?.name;
    if (name === "q" || (key?.ctrl && name === "c")) {
      process.stdout.write("\n");
      process.exit(0);
    }
    if (name === "a") state = approveAll(state);
    if (name === "v") state = toggleAvatar(state);
    if (name === "w") state = await writePrototypeFiles(state);
    if (name === "r") state = await runPipeline(state, { writeOnly: false, reuseVideo: false });
    renderFrame(state);
  }
}

async function runPipeline(state, options) {
  let nextState = await writePrototypeFiles(state);
  if (options.writeOnly) return nextState;

  await assertFfmpeg();
  const existingWalkthrough = path.join(nextState.outputDir, "walkthrough-muted.mp4");
  const clipPaths = options.reuseVideo ? existingClipPaths(nextState) : await renderSceneClips(nextState);
  const assembledWalkthrough = options.reuseVideo && fsSync.existsSync(existingWalkthrough)
    ? existingWalkthrough
    : await concatenateClips(nextState, clipPaths);
  const voiceoverAudio = await createVoiceover(nextState);
  const withAudio = await muxVoiceover(nextState, assembledWalkthrough, voiceoverAudio);
  const avatarVideo = await createAvatarIfConfigured(nextState, voiceoverAudio);
  const finalExport = await overlayAvatarIfConfigured(nextState, withAudio, avatarVideo);

  nextState = recordArtifacts(nextState, {
    sceneClips: clipPaths,
    assembledWalkthrough,
    voiceoverAudio,
    avatarVideo,
    finalExport,
  });
  await fs.writeFile(nextState.artifacts.manifest, JSON.stringify({ state: summarizeState(nextState), renderPlan: buildRenderPlan(nextState) }, null, 2));
  return nextState;
}

async function writePrototypeFiles(state) {
  await fs.mkdir(state.outputDir, { recursive: true });
  await fs.mkdir(path.join(state.outputDir, "clips"), { recursive: true });
  await fs.mkdir(path.join(state.outputDir, "plans"), { recursive: true });

  const scriptPath = path.join(state.outputDir, "script.xml");
  const promptsPath = path.join(state.outputDir, "plans", "scene-prompts.json");
  const renderPlanPath = path.join(state.outputDir, "plans", "render-plan.json");
  const manifestPath = path.join(state.outputDir, "manifest.json");

  const nextState = recordArtifacts(state, { manifest: manifestPath });
  await fs.writeFile(scriptPath, `${state.script}\n`);
  await fs.writeFile(promptsPath, JSON.stringify(state.scenePrompts, null, 2));
  await fs.writeFile(renderPlanPath, JSON.stringify(buildRenderPlan(nextState), null, 2));
  await fs.writeFile(manifestPath, JSON.stringify({ state: summarizeState(nextState), renderPlan: buildRenderPlan(nextState) }, null, 2));
  return nextState;
}

async function renderSceneClips(state) {
  if (state.config.clip.provider === "openrouter") {
    return renderSceneClipsWithOpenRouter(state);
  }

  const clipPaths = [];
  for (const [index, scene] of state.config.scenes.entries()) {
    const inputImage = path.resolve(state.inputDir, scene.sourceImage);
    const outputPath = path.join(state.outputDir, "clips", `${String(index + 1).padStart(2, "0")}-${scene.id}.mp4`);
    const vf = buildSmoothMotionFilter(state, scene);

    await run("ffmpeg", [
      "-y",
      "-loop",
      "1",
      "-framerate",
      String(state.config.clip.fps),
      "-i",
      inputImage,
      "-t",
      String(scene.durationSeconds),
      "-vf",
      vf,
      "-an",
      "-c:v",
      "libx264",
      "-preset",
      "slow",
      "-crf",
      "18",
      "-movflags",
      "+faststart",
      outputPath,
    ]);
    clipPaths.push(outputPath);
  }
  return clipPaths;
}

function buildSmoothMotionFilter(state, scene) {
  const motion = CAMERA_MOTIONS[scene.motion] ?? CAMERA_MOTIONS.slow_push_in;
  const { width, height, fps } = state.config.clip;
  const duration = scene.durationSeconds;
  const baseScale = Math.ceil(Math.max(width * motion.endZoom, height * motion.endZoom));
  const frameCount = Math.max(1, Math.round(duration * fps) - 1);
  const ease = `(3*pow(n/${frameCount},2)-2*pow(n/${frameCount},3))`;
  const zoom = `(${motion.startZoom}+(${motion.endZoom}-${motion.startZoom})*${ease})`;
  const focusX = `(${motion.startX}+(${motion.endX}-${motion.startX})*${ease})`;
  const focusY = `(${motion.startY}+(${motion.endY}-${motion.startY})*${ease})`;
  const cropW = `iw/${zoom}`;
  const cropH = `ih/${zoom}`;
  const cropX = `max(0,min(iw-${cropW},iw*${focusX}-${cropW}/2))`;
  const cropY = `max(0,min(ih-${cropH},ih*${focusY}-${cropH}/2))`;

  return [
    `fps=${fps}`,
    `scale=${baseScale}:${baseScale}:force_original_aspect_ratio=increase:flags=lanczos`,
    `crop=w='${cropW}':h='${cropH}':x='${cropX}':y='${cropY}':exact=1`,
    `scale=${width}:${height}:flags=lanczos`,
    "setsar=1",
    "format=yuv420p",
  ].join(",");
}

async function renderSceneClipsWithOpenRouter(state) {
  const apiKey = process.env.OPENROUTER_API_KEY;
  if (!apiKey) throw new Error("OPENROUTER_API_KEY is required when clip.provider is openrouter.");

  const clipPaths = [];
  for (const [index, scene] of state.config.scenes.entries()) {
    if (!scene.sourceImageUrl) {
      throw new Error(`scene ${scene.id} needs sourceImageUrl for OpenRouter image-to-video. OpenRouter providers must fetch a public HTTPS image URL.`);
    }
    await assertPublicImageUrl(scene.sourceImageUrl);

    const outputPath = path.join(state.outputDir, "clips", `${String(index + 1).padStart(2, "0")}-${scene.id}.mp4`);
    const job = await submitOpenRouterVideoJob(state, scene);
    const completedJob = await pollOpenRouterVideoJob(job, state.config.clip.openRouter);
    await downloadOpenRouterVideo(completedJob, outputPath, apiKey);
    clipPaths.push(outputPath);
  }

  return clipPaths;
}

async function submitOpenRouterVideoJob(state, scene) {
  const apiKey = process.env.OPENROUTER_API_KEY;
  const response = await fetch("https://openrouter.ai/api/v1/videos", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
      "HTTP-Referer": "https://aimapps.local/tours-prototype",
      "X-Title": "AiM Tours Prototype",
    },
    body: JSON.stringify({
      model: state.config.clip.openRouter.model,
      prompt: state.scenePrompts.find((item) => item.sceneId === scene.id)?.prompt,
      duration: scene.durationSeconds,
      resolution: state.config.clip.openRouter.resolution,
      aspect_ratio: state.config.clip.aspectRatio,
      generate_audio: state.config.clip.openRouter.generateAudio,
      frame_images: [
        {
          type: "image_url",
          image_url: { url: scene.sourceImageUrl },
          frame_type: "first_frame",
        },
      ],
    }),
  });

  if (!response.ok) throw new Error(`OpenRouter video submit failed for ${scene.id}: ${response.status} ${await response.text()}`);
  return response.json();
}

async function pollOpenRouterVideoJob(job, settings) {
  let current = job;
  for (let attempt = 1; attempt <= settings.maxPollAttempts; attempt += 1) {
    if (current.status === "completed") return current;
    if (current.status === "failed" || current.status === "cancelled") {
      throw new Error(`OpenRouter video job ${current.id} failed: ${current.error ?? current.status}`);
    }

    await sleep(settings.pollIntervalMs);
    const response = await fetch(toOpenRouterUrl(current.polling_url ?? `/api/v1/videos/${current.id}`), {
      headers: { Authorization: `Bearer ${process.env.OPENROUTER_API_KEY}` },
    });
    if (!response.ok) throw new Error(`OpenRouter video poll failed for ${current.id}: ${response.status} ${await response.text()}`);
    current = await response.json();
  }

  throw new Error(`OpenRouter video job ${job.id} did not complete after ${settings.maxPollAttempts} polls.`);
}

async function downloadOpenRouterVideo(job, outputPath, apiKey) {
  const url = job.unsigned_urls?.[0] ?? toOpenRouterUrl(`/api/v1/videos/${job.id}/content`);
  const headers = job.unsigned_urls?.[0] ? {} : { Authorization: `Bearer ${apiKey}` };
  const response = await fetch(url, { headers });
  if (!response.ok) throw new Error(`OpenRouter video download failed for ${job.id}: ${response.status} ${await response.text()}`);
  await fs.writeFile(outputPath, Buffer.from(await response.arrayBuffer()));
}

async function assertPublicImageUrl(url) {
  if (!url.startsWith("https://")) throw new Error(`OpenRouter sourceImageUrl must be HTTPS: ${url}`);
  const response = await fetch(url, { method: "HEAD" });
  const contentType = response.headers.get("content-type") ?? "";
  if (!response.ok || !contentType.startsWith("image/")) {
    throw new Error(`OpenRouter sourceImageUrl must return an image response. Got ${response.status} ${contentType} for ${url}`);
  }
}

async function concatenateClips(state, clipPaths) {
  const concatPath = path.join(state.outputDir, "plans", "concat.txt");
  const assembledPath = path.join(state.outputDir, "walkthrough-muted.mp4");
  await fs.writeFile(concatPath, clipPaths.map((clipPath) => `file '${clipPath.replaceAll("'", "'\\''")}'`).join("\n"));
  await run("ffmpeg", [
    "-y",
    "-f",
    "concat",
    "-safe",
    "0",
    "-i",
    concatPath,
    "-r",
    String(state.config.clip.fps),
    "-c:v",
    "libx264",
    "-preset",
    "slow",
    "-crf",
    "18",
    "-pix_fmt",
    "yuv420p",
    "-movflags",
    "+faststart",
    assembledPath,
  ]);
  return assembledPath;
}

async function createVoiceover(state) {
  const provider = state.config.voiceover.provider;
  const outputName = provider === "silent" ? "voiceover-silent.m4a" : provider === "elevenlabs" ? "voiceover-timed.m4a" : "voiceover.mp3";
  const outputPath = path.join(state.outputDir, outputName);
  const duration = state.timeline.at(-1)?.endSeconds ?? 5;

  if (provider === "elevenlabs") {
    return createTimedElevenLabsVoiceover(state, outputPath);
  }

  if (provider === "macos-say") {
    const aiffPath = path.join(state.outputDir, "voiceover.aiff");
    const text = state.script.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
    await run("say", ["-o", aiffPath, text]);
    await run("ffmpeg", ["-y", "-i", aiffPath, "-c:a", "libmp3lame", outputPath]);
    return outputPath;
  }

  await run("ffmpeg", ["-y", "-f", "lavfi", "-i", "anullsrc=channel_layout=stereo:sample_rate=44100", "-t", String(duration), "-c:a", "aac", outputPath]);
  return outputPath;
}

async function createTimedElevenLabsVoiceover(state, outputPath) {
  const apiKey = process.env.ELEVENLABS_API_KEY;
  const voiceId = state.config.voiceover.elevenLabsVoiceId;
  if (!apiKey) throw new Error("ELEVENLABS_API_KEY is required when voiceover.provider is elevenlabs.");
  if (!voiceId) throw new Error("voiceover.elevenLabsVoiceId is required when voiceover.provider is elevenlabs.");

  const segmentsDir = path.join(state.outputDir, "voiceover-segments");
  await fs.rm(segmentsDir, { recursive: true, force: true });
  await fs.mkdir(segmentsDir, { recursive: true });

  const segments = buildVoiceoverSegments(state.timeline);
  const segmentPaths = [];
  for (const [index, segment] of segments.entries()) {
    const segmentPath = path.join(segmentsDir, `${String(index + 1).padStart(2, "0")}-${segment.sceneId}.mp3`);
    await createElevenLabsSpeech(state, segment.text, segmentPath);
    segmentPaths.push(segmentPath);
  }

  const duration = String(state.timeline.at(-1)?.endSeconds ?? 5);
  const args = [
    "-y",
    "-f",
    "lavfi",
    "-t",
    duration,
    "-i",
    "anullsrc=channel_layout=mono:sample_rate=44100",
  ];
  for (const segmentPath of segmentPaths) args.push("-i", segmentPath);

  const delayedLabels = segments.map((segment, index) => {
    const delayMs = Math.round(segment.startSeconds * 1000);
    return `[${index + 1}:a]adelay=${delayMs}:all=1,volume=1.0[a${index + 1}]`;
  });
  const mixInputs = ["[0:a]", ...segments.map((_, index) => `[a${index + 1}]`)].join("");
  const filter = `${delayedLabels.join(";")};${mixInputs}amix=inputs=${segments.length + 1}:duration=first:dropout_transition=0[aout]`;

  await run("ffmpeg", [
    ...args,
    "-filter_complex",
    filter,
    "-map",
    "[aout]",
    "-t",
    duration,
    "-c:a",
    "aac",
    outputPath,
  ]);

  await fs.writeFile(path.join(state.outputDir, "plans", "voiceover-segments.json"), JSON.stringify(segments, null, 2));
  return outputPath;
}

async function createElevenLabsSpeech(state, text, outputPath) {
  const url = new URL(`https://api.elevenlabs.io/v1/text-to-speech/${state.config.voiceover.elevenLabsVoiceId}`);
  url.searchParams.set("output_format", state.config.voiceover.outputFormat);
  const response = await fetch(url, {
    method: "POST",
    headers: {
      "xi-api-key": process.env.ELEVENLABS_API_KEY,
      "content-type": "application/json",
      accept: "audio/mpeg",
    },
    body: JSON.stringify({
      text,
      model_id: state.config.voiceover.modelId,
    }),
  });
  if (!response.ok) throw new Error(`ElevenLabs request failed: ${response.status} ${await response.text()}`);
  await fs.writeFile(outputPath, Buffer.from(await response.arrayBuffer()));
}

async function muxVoiceover(state, videoPath, audioPath) {
  const outputPath = path.join(state.outputDir, "walkthrough-with-voiceover.mp4");
  await run("ffmpeg", ["-y", "-i", videoPath, "-i", audioPath, "-map", "0:v:0", "-map", "1:a:0", "-c:v", "copy", "-c:a", "aac", outputPath]);
  return outputPath;
}

async function createAvatarIfConfigured(state, voiceoverAudio) {
  if (!state.config.avatar.enabled) return "";
  if (state.config.avatar.provider === "heygen") {
    try {
      return await createHeyGenAvatar(state, voiceoverAudio);
    } catch (error) {
      if (!state.config.avatar.localVideo) throw error;
      process.stderr.write(`HeyGen avatar unavailable; using local fallback. ${error.message}\n`);
      return path.resolve(state.inputDir, state.config.avatar.localVideo);
    }
  }
  if (state.config.avatar.localVideo) return path.resolve(state.inputDir, state.config.avatar.localVideo);
  return "";
}

async function createHeyGenAvatar(state, voiceoverAudio) {
  const apiKey = process.env.HEYGEN_API_KEY;
  const avatarId = state.config.avatar.heyGenAvatarId;
  if (!apiKey) throw new Error("HEYGEN_API_KEY is required when avatar.provider is heygen.");
  if (!avatarId) throw new Error("avatar.heyGenAvatarId is required when avatar.provider is heygen.");

  const audioSource = await resolveHeyGenAudioSource(state, voiceoverAudio);
  const body = {
    type: "avatar",
    avatar_id: avatarId,
    title: `${state.config.project.title} Prototype Avatar`,
    aspect_ratio: "16:9",
    resolution: "720p",
    fit: "contain",
    background: { type: "color", value: "#00FF00" },
    output_format: state.config.avatar.heyGenOutputFormat,
    engine: { type: state.config.avatar.heyGenEngine },
    ...audioSource,
  };

  const createResponse = await fetch("https://api.heygen.com/v3/videos", {
    method: "POST",
    headers: {
      "x-api-key": apiKey,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });
  if (!createResponse.ok) throw new Error(`HeyGen video create failed: ${createResponse.status} ${await createResponse.text()}`);

  const created = await createResponse.json();
  const videoId = created.data?.video_id ?? created.data?.id ?? created.video_id;
  if (!videoId) throw new Error(`HeyGen create response did not include a video id: ${JSON.stringify(created)}`);

  const completed = await pollHeyGenVideo(videoId, state.config.avatar);
  const videoUrl = completed.data?.video_url ?? completed.video_url;
  if (!videoUrl) throw new Error(`HeyGen video completed without video_url: ${JSON.stringify(completed)}`);

  const outputPath = path.join(state.outputDir, "avatar-heygen.mp4");
  const download = await fetch(videoUrl);
  if (!download.ok) throw new Error(`HeyGen avatar download failed: ${download.status} ${await download.text()}`);
  await fs.writeFile(outputPath, Buffer.from(await download.arrayBuffer()));
  return outputPath;
}

async function resolveHeyGenAudioSource(state, voiceoverAudio) {
  if (state.config.avatar.audioUrl) return { audio_url: state.config.avatar.audioUrl };
  if (state.config.avatar.audioAssetId) return { audio_asset_id: state.config.avatar.audioAssetId };
  if (!voiceoverAudio) throw new Error("HeyGen avatar generation needs voiceover audio, avatar.audioUrl, or avatar.audioAssetId.");

  const uploadPath = await ensureHeyGenUploadableAudio(state, voiceoverAudio);
  const response = await fetch("https://upload.heygen.com/v1/asset", {
    method: "POST",
    headers: {
      "x-api-key": process.env.HEYGEN_API_KEY,
      "Content-Type": "audio/mpeg",
    },
    body: await fs.readFile(uploadPath),
  });
  if (!response.ok) throw new Error(`HeyGen audio upload failed: ${response.status} ${await response.text()}`);

  const uploaded = await response.json();
  const data = uploaded.data ?? uploaded;
  const assetId = data.asset_id ?? data.id;
  if (!assetId) throw new Error(`HeyGen audio upload response did not include an asset id: ${JSON.stringify(uploaded)}`);
  await fs.writeFile(path.join(state.outputDir, "plans", "heygen-audio-upload.json"), JSON.stringify({ assetId }, null, 2));
  return { audio_asset_id: assetId };
}

async function ensureHeyGenUploadableAudio(state, audioPath) {
  if (path.extname(audioPath).toLowerCase() === ".mp3") return audioPath;
  const mp3Path = path.join(state.outputDir, "voiceover-timed-for-heygen.mp3");
  await run("ffmpeg", ["-y", "-i", audioPath, "-c:a", "libmp3lame", "-b:a", "128k", mp3Path]);
  return mp3Path;
}

async function pollHeyGenVideo(videoId, settings) {
  for (let attempt = 1; attempt <= settings.heyGenMaxPollAttempts; attempt += 1) {
    const response = await fetch(`https://api.heygen.com/v3/videos/${videoId}`, {
      headers: { "x-api-key": process.env.HEYGEN_API_KEY },
    });
    if (!response.ok) throw new Error(`HeyGen video poll failed for ${videoId}: ${response.status} ${await response.text()}`);
    const current = await response.json();
    const data = current.data ?? current;
    if (data.video_url) return current;
    if (data.failure_code || data.failure_message) {
      throw new Error(`HeyGen video ${videoId} failed: ${data.failure_code ?? ""} ${data.failure_message ?? ""}`.trim());
    }
    await sleep(settings.heyGenPollIntervalMs);
  }
  throw new Error(`HeyGen video ${videoId} did not complete after ${settings.heyGenMaxPollAttempts} polls.`);
}

async function overlayAvatarIfConfigured(state, videoPath, avatarVideo) {
  const outputPath = path.join(state.outputDir, "final-tour.mp4");
  if (!state.config.avatar.enabled || !avatarVideo) {
    await fs.copyFile(videoPath, outputPath);
    return outputPath;
  }

  const avatarWidth = Math.round(state.config.clip.width * 0.3);
  const keyFilter = state.config.avatar.chromaKey
    ? `,chromakey=${state.config.avatar.chromaKey}:0.22:0.08`
    : "";
  const filter = `[1:v]scale=${avatarWidth}:-1${keyFilter}[avatar];[0:v][avatar]overlay=W-w-54:H-h-80:format=auto[v]`;
  const duration = String(state.timeline.at(-1)?.endSeconds ?? state.config.clip.durationSeconds);
  await run("ffmpeg", ["-y", "-i", videoPath, "-i", avatarVideo, "-filter_complex", filter, "-map", "[v]", "-map", "0:a?", "-t", duration, "-c:v", "libx264", "-preset", "veryfast", "-c:a", "aac", outputPath]);
  return outputPath;
}

async function loadConfig(inputDir) {
  const configPath = path.join(inputDir, "config.json");
  const raw = await fs.readFile(configPath, "utf8").catch((error) => {
    if (error.code === "ENOENT") {
      throw new Error(`Missing config file: ${configPath}`);
    }
    throw error;
  });
  return JSON.parse(raw);
}

async function discoverImages(inputDir) {
  const scenesDir = path.join(inputDir, "scenes");
  const entries = await fs.readdir(scenesDir).catch(() => []);
  return entries
    .filter((entry) => IMAGE_EXTENSIONS.has(path.extname(entry).toLowerCase()))
    .sort()
    .map((entry) => path.join("scenes", entry));
}

async function ensureInputState(state) {
  const missing = [];
  for (const scene of state.config.scenes) {
    if (!scene.sourceImage) missing.push(`${scene.id}: missing sourceImage`);
    const imagePath = path.resolve(state.inputDir, scene.sourceImage ?? "");
    if (scene.sourceImage && !fsSync.existsSync(imagePath)) missing.push(`${scene.id}: ${scene.sourceImage}`);
  }
  if (state.config.avatar.enabled && state.config.avatar.localVideo && !fsSync.existsSync(path.resolve(state.inputDir, state.config.avatar.localVideo))) {
    missing.push(`avatar.localVideo: ${state.config.avatar.localVideo}`);
  }
  if (missing.length) throw new Error(`Prototype input is incomplete:\n${missing.map((item) => `- ${item}`).join("\n")}`);
}

async function assertFfmpeg() {
  await run("ffmpeg", ["-version"], { quiet: true });
}

function renderFrame(state) {
  console.clear();
  process.stdout.write(`${bold("Tours Video Pipeline Prototype")}\n`);
  process.stdout.write(`${dim("Question: does the state/data flow from ordered source images to script, voiceover, optional avatar, and final Reels MP4 feel right before production architecture is built?")}\n\n`);
  process.stdout.write(`${bold("State")}\n${JSON.stringify(summarizeState(state), null, 2)}\n\n`);
  process.stdout.write(`${bold("Keys")}  ${bold("a")} ${dim("approve all gates")}  ${bold("v")} ${dim("toggle avatar")}  ${bold("w")} ${dim("write plans only")}  ${bold("r")} ${dim("render local pipeline")}  ${bold("q")} ${dim("quit")}\n`);
}

function printSummary(state) {
  process.stdout.write(`${JSON.stringify(summarizeState(state), null, 2)}\n`);
}

function parseArgs(argv) {
  const args = {};
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === "--run") args.run = true;
    else if (arg === "--write-only") args["write-only"] = true;
    else if (arg === "--reuse-video") args["reuse-video"] = true;
    else if (arg.startsWith("--")) args[arg.slice(2)] = argv[index + 1];
  }
  return args;
}

function existingClipPaths(state) {
  return state.config.scenes.map((scene, index) => path.join(state.outputDir, "clips", `${String(index + 1).padStart(2, "0")}-${scene.id}.mp4`));
}

function loadEnvFile(envPath) {
  if (!fsSync.existsSync(envPath)) return;
  const lines = fsSync.readFileSync(envPath, "utf8").split(/\r?\n/);
  for (const line of lines) {
    const match = line.match(/^([A-Z0-9_]+)=(.*)$/);
    if (!match) continue;
    const [, key, rawValue] = match;
    if (process.env[key]) continue;
    process.env[key] = rawValue.replace(/^["']|["']$/g, "");
  }
}

function run(command, args, options = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { stdio: options.quiet ? "ignore" : "inherit" });
    child.on("error", reject);
    child.on("close", (code) => {
      if (code === 0) resolve();
      else reject(new Error(`${command} exited with ${code}`));
    });
  });
}

function toOpenRouterUrl(value) {
  if (value.startsWith("https://")) return value;
  return `https://openrouter.ai${value}`;
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function bold(value) {
  return `\x1b[1m${value}\x1b[0m`;
}

function dim(value) {
  return `\x1b[2m${value}\x1b[0m`;
}

main().catch((error) => {
  process.stderr.write(`${error.stack ?? error.message}\n`);
  process.exit(1);
});
