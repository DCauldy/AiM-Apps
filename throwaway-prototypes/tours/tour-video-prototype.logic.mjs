// PROTOTYPE - throwaway logic for validating the Tours image-to-final-video pipeline.

import path from "node:path";

export const CAMERA_MOTIONS = {
  slow_push_in: {
    label: "Slow push-in",
    prompt: "Use a slow, calm push-in with physically plausible gimbal movement.",
    startZoom: 1.0,
    endZoom: 1.07,
    startX: 0.5,
    endX: 0.5,
    startY: 0.5,
    endY: 0.5,
  },
  subtle_glide: {
    label: "Subtle glide",
    prompt: "Use a subtle lateral glide while staying anchored to the provided image.",
    startZoom: 1.04,
    endZoom: 1.06,
    startX: 0.47,
    endX: 0.53,
    startY: 0.5,
    endY: 0.5,
  },
  gentle_pan: {
    label: "Gentle pan",
    prompt: "Use a gentle pan with no invented adjacent space.",
    startZoom: 1.06,
    endZoom: 1.06,
    startX: 0.43,
    endX: 0.57,
    startY: 0.5,
    endY: 0.5,
  },
  static_slight_motion: {
    label: "Static with slight motion",
    prompt: "Use an almost-static locked shot with only a slight natural camera float.",
    startZoom: 1.02,
    endZoom: 1.035,
    startX: 0.5,
    endX: 0.5,
    startY: 0.49,
    endY: 0.51,
  },
};

export const PRESERVATION_PROMPT =
  "Generate a video walkthrough based strictly on the provided reference photo. Use a realistic filming style while keeping all motion physically plausible and limited to what the image shows. Preserve every object, color, material, and lighting detail exactly as it appears in the reference image, and do not add, remove, or alter anything. Do not invent or imply any unseen elements, including windows, doors, railings, openings, adjacent spaces, closets, or light sources. If something is not clearly visible in the photo, it must not appear in the video. The camera should move smoothly and calmly, staying fully anchored to the visual information in the reference image.";

export function normalizeConfig(rawConfig, discoveredImages = []) {
  const clip = rawConfig.clip ?? {};
  const project = rawConfig.project ?? {};
  const configuredScenes = Array.isArray(rawConfig.scenes) ? rawConfig.scenes : [];
  const durationSeconds = Number(clip.durationSeconds ?? 5);

  const scenes =
    configuredScenes.length > 0
      ? configuredScenes
      : discoveredImages.map((imagePath, index) => ({
          id: `scene-${String(index + 1).padStart(2, "0")}`,
          label: titleFromFilename(imagePath),
          sourceImage: imagePath,
        }));

  return {
    project: {
      title: project.title ?? "Prototype Tour",
      propertyAddress: project.propertyAddress ?? "",
      facts: Array.isArray(project.facts) ? project.facts : [],
      tone: project.tone ?? "warm, concise, and factual",
    },
    clip: {
      provider: clip.provider ?? "local-ffmpeg",
      durationSeconds: Number.isFinite(durationSeconds) && durationSeconds > 0 ? durationSeconds : 5,
      aspectRatio: clip.aspectRatio ?? "9:16",
      width: Number(clip.width ?? 1080),
      height: Number(clip.height ?? 1920),
      fps: Number(clip.fps ?? 30),
      openRouter: {
        model: clip.openRouter?.model ?? "google/veo-3.1-lite",
        resolution: clip.openRouter?.resolution ?? "720p",
        pollIntervalMs: Number(clip.openRouter?.pollIntervalMs ?? 10000),
        maxPollAttempts: Number(clip.openRouter?.maxPollAttempts ?? 90),
        generateAudio: clip.openRouter?.generateAudio === true,
      },
    },
    voiceover: {
      provider: rawConfig.voiceover?.provider ?? "silent",
      elevenLabsVoiceId: rawConfig.voiceover?.elevenLabsVoiceId ?? "",
      modelId: rawConfig.voiceover?.modelId ?? "eleven_multilingual_v2",
      outputFormat: rawConfig.voiceover?.outputFormat ?? "mp3_44100_128",
    },
    avatar: {
      enabled: rawConfig.avatar?.enabled === true,
      provider: rawConfig.avatar?.provider ?? "local",
      localVideo: rawConfig.avatar?.localVideo ?? "",
      chromaKey: rawConfig.avatar?.chromaKey ?? "",
      heyGenAvatarId: rawConfig.avatar?.heyGenAvatarId ?? "",
      heyGenVoiceId: rawConfig.avatar?.heyGenVoiceId ?? "",
      heyGenEngine: rawConfig.avatar?.heyGenEngine ?? "avatar_iv",
      heyGenOutputFormat: rawConfig.avatar?.heyGenOutputFormat ?? "mp4",
      heyGenPollIntervalMs: Number(rawConfig.avatar?.heyGenPollIntervalMs ?? 10000),
      heyGenMaxPollAttempts: Number(rawConfig.avatar?.heyGenMaxPollAttempts ?? 90),
      audioUrl: rawConfig.avatar?.audioUrl ?? "",
      audioAssetId: rawConfig.avatar?.audioAssetId ?? "",
    },
    scenes: scenes.map((scene, index) => normalizeScene(scene, index, durationSeconds)),
  };
}

export function createInitialState(config, inputDir, outputDir) {
  const timeline = buildTimeline(config.scenes, config.clip.durationSeconds);
  const script = buildScript(config, timeline);
  const scenePrompts = config.scenes.map((scene) => ({
    sceneId: scene.id,
    prompt: buildScenePrompt(scene),
  }));

  return {
    status: "ready",
    inputDir,
    outputDir,
    config,
    approvals: {
      listingMediaAuthorization: false,
      sceneAccuracy: Object.fromEntries(config.scenes.map((scene) => [scene.id, false])),
      scriptFacts: false,
      voiceover: false,
      avatar: config.avatar.enabled ? false : "skipped",
    },
    timeline,
    script,
    scenePrompts,
    artifacts: {
      sceneClips: [],
      assembledWalkthrough: "",
      voiceoverAudio: "",
      avatarVideo: "",
      finalExport: "",
      manifest: "",
    },
    events: [],
  };
}

export function approveAll(state) {
  return {
    ...state,
    approvals: {
      listingMediaAuthorization: true,
      sceneAccuracy: Object.fromEntries(state.config.scenes.map((scene) => [scene.id, true])),
      scriptFacts: true,
      voiceover: true,
      avatar: state.config.avatar.enabled ? true : "skipped",
    },
    events: [...state.events, event("Approved all prototype gates")],
  };
}

export function toggleAvatar(state) {
  const enabled = !state.config.avatar.enabled;
  return {
    ...state,
    config: {
      ...state.config,
      avatar: { ...state.config.avatar, enabled },
    },
    approvals: {
      ...state.approvals,
      avatar: enabled ? false : "skipped",
    },
    events: [...state.events, event(`${enabled ? "Enabled" : "Skipped"} avatar overlay`)],
  };
}

export function recordArtifacts(state, artifacts) {
  return {
    ...state,
    status: "rendered",
    artifacts: {
      ...state.artifacts,
      ...artifacts,
    },
    events: [...state.events, event("Rendered prototype pipeline")],
  };
}

export function buildScenePrompt(scene) {
  const motion = CAMERA_MOTIONS[scene.motion] ?? CAMERA_MOTIONS.slow_push_in;
  return `${PRESERVATION_PROMPT}\n\nCamera motion: ${motion.prompt}`;
}

export function buildTimeline(scenes, durationSeconds) {
  let cursor = 0;
  return scenes.map((scene, index) => {
    const start = cursor;
    const duration = scene.durationSeconds ?? durationSeconds;
    cursor += duration;
    return {
      sceneId: scene.id,
      label: scene.label,
      order: index + 1,
      startSeconds: start,
      endSeconds: cursor,
      durationSeconds: duration,
    };
  });
}

export function buildScript(config, timeline) {
  const sceneLines = timeline.map((item) => {
    return `<scene id="${item.sceneId}" start="${item.startSeconds}s" end="${item.endSeconds}s"><voice tone="${escapeXml(config.project.tone)}">${escapeXml(shortSceneLine(item.label))}</voice></scene>`;
  });

  return `<tour title="${escapeXml(config.project.title)}" targetDuration="${totalDuration(timeline)}s"><voiceover><intro><voice tone="${escapeXml(config.project.tone)}">Welcome inside.</voice></intro>${sceneLines.join("")}<outro><voice tone="${escapeXml(config.project.tone)}">Reach out to schedule a private tour.</voice></outro></voiceover></tour>`;
}

export function buildVoiceoverSegments(timeline) {
  return timeline.map((item) => ({
    sceneId: item.sceneId,
    label: item.label,
    startSeconds: item.startSeconds,
    endSeconds: item.endSeconds,
    text: shortSceneLine(item.label),
  }));
}

export function buildRenderPlan(state) {
  const sceneClips = state.config.scenes.map((scene, index) => ({
    sceneId: scene.id,
    order: index + 1,
    clipPath: path.join(state.outputDir, "clips", `${String(index + 1).padStart(2, "0")}-${scene.id}.mp4`),
    durationSeconds: scene.durationSeconds,
    selected: true,
    approved: state.approvals.sceneAccuracy[scene.id] === true,
  }));

  return {
    preset: "instagram_reels_vertical_v1",
    width: state.config.clip.width,
    height: state.config.clip.height,
    fps: state.config.clip.fps,
    videoCodec: "h264",
    audioCodec: "aac",
    totalDurationSeconds: totalDuration(state.timeline),
    sceneClips,
    voiceoverRequired: true,
    avatarOverlay: state.config.avatar.enabled
      ? {
          enabled: true,
          position: "lower-right",
          widthPixels: Math.round(state.config.clip.width * 0.3),
        }
      : { enabled: false },
  };
}

export function totalDuration(timeline) {
  return timeline.reduce((sum, item) => sum + item.durationSeconds, 0);
}

export function summarizeState(state) {
  return {
    status: state.status,
    inputDir: state.inputDir,
    outputDir: state.outputDir,
    project: state.config.project,
    clipProvider: state.config.clip.provider,
    openRouterModel: state.config.clip.provider === "openrouter" ? state.config.clip.openRouter.model : undefined,
    scenes: state.config.scenes.map((scene) => ({
      id: scene.id,
      label: scene.label,
      image: scene.sourceImage,
      imageUrl: scene.sourceImageUrl || undefined,
      motion: scene.motion,
      durationSeconds: scene.durationSeconds,
    })),
    approvals: state.approvals,
    timeline: state.timeline,
    artifacts: state.artifacts,
    lastEvents: state.events.slice(-5),
  };
}

function normalizeScene(scene, index, defaultDurationSeconds) {
  const motionKeys = Object.keys(CAMERA_MOTIONS);
  const motion = motionKeys.includes(scene.motion) ? scene.motion : motionKeys[index % motionKeys.length];

  return {
    id: scene.id ?? `scene-${String(index + 1).padStart(2, "0")}`,
    label: scene.label ?? titleFromFilename(scene.sourceImage ?? `Scene ${index + 1}`),
    sourceImage: scene.sourceImage,
    sourceImageUrl: scene.sourceImageUrl ?? "",
    notes: Array.isArray(scene.notes) ? scene.notes : [],
    motion,
    durationSeconds: Number(scene.durationSeconds ?? defaultDurationSeconds),
  };
}

function titleFromFilename(filePath) {
  return path
    .basename(filePath, path.extname(filePath))
    .replace(/^\d+[-_\s]*/, "")
    .replace(/[-_]+/g, " ")
    .replace(/\b\w/g, (match) => match.toUpperCase());
}

function shortSceneLine(label) {
  const lines = {
    "Dining Entry": "From the entry, the home opens into a bright dining area with clean sight lines.",
    "Formal Dining Or Office": "This flexible front room can serve as formal dining, an office, or a quiet sitting space.",
    "Kitchen Island": "The kitchen centers on the island, with open counter space and an easy working layout.",
    "Kitchen Wide": "A wider angle shows the cabinetry, appliances, and the main cooking zone in context.",
    "Living Room Transition": "The living area connects directly from the kitchen, keeping the main spaces open and easy to follow.",
    "Living Room Fireplace": "The fireplace anchors the seating area, giving this room a clear and comfortable focal point.",
    "Covered Deck": "Outside, the covered deck extends the living space.",
  };
  return lines[label] ?? `Now viewing ${label}.`;
}

function escapeXml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&apos;");
}

function event(message) {
  return { at: new Date().toISOString(), message };
}
