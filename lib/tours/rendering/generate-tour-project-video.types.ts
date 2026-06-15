import type { resolveProfileIdForRender } from "@/lib/profiles/resolve-for-render";
import type { getProfileApiKey } from "@/lib/user-api-keys/service";
import type {
  HeyGenAvatarProvider,
  HeyGenAvatarStageOptions,
  HeyGenAvatarStageResult,
} from "./tour-avatar";
import type { FinalVideoRenderer } from "./tour-final-render";
import type { preflightTourRender, TourRenderOptions } from "./tour-render-preflight";
import type {
  TourRenderAsset,
  TourRenderRepository,
  TourRenderStep,
} from "./tour-render.repository";
import type {
  ImageToVideoProvider,
  SceneClipBatchItem,
  SceneClipBatchResult,
  SceneClipBatchRunner,
  SceneClipRenderer,
} from "./tour-scene-clips";
import type { TourScriptPlanningProvider } from "./tour-script-planning";
import type { TransitionDetectionProvider } from "./tour-transitions";
import type { VoiceoverProvider } from "./tour-voiceover";

export type TourRenderProgressUpdate = {
  step: TourRenderStep;
  label: string;
  progressPercent: number;
  sceneClipCompletedCount?: number;
  sceneClipTotalCount?: number;
  message?: string;
  metadata?: Record<string, unknown>;
};

export type GenerateTourProjectVideoInput = {
  projectId: string;
  userId: string;
  renderRunId: string;
  options?: TourRenderOptions;
  progress?: (update: TourRenderProgressUpdate) => Promise<void> | void;
};

export type GenerateTourProjectVideoOptions = {
  repository?: TourRenderRepository;
  preflight?: typeof preflightTourRender;
  scriptPlanningProvider?: TourScriptPlanningProvider;
  voiceoverProvider?: VoiceoverProvider;
  transitionDetectionProvider?: TransitionDetectionProvider;
  sceneClipRenderer?: SceneClipRenderer;
  sceneClipBatchRunner?: SceneClipBatchRunner;
  mediaBatchRunner?: TourMediaBatchRunner;
  finalVideoRenderer?: FinalVideoRenderer;
  imageToVideoProvider?: ImageToVideoProvider;
  avatarProvider?: HeyGenAvatarProvider;
  getApiKey?: typeof getProfileApiKey;
  /** Override the project→profile_id resolver in tests. */
  resolveProfileId?: typeof resolveProfileIdForRender;
};

export type TourAvatarBatchItem = {
  projectId: string;
  runId: string;
  userId: string;
  profileId: string;
  projectName: string;
  signedVoiceoverAudioUrl: string;
  voiceoverAudioAsset: TourRenderAsset;
  options: HeyGenAvatarStageOptions;
};

export type TourAvatarBatchResult = HeyGenAvatarStageResult;

export type TourMediaBatchRunner = (input: {
  sceneClipItems: SceneClipBatchItem[];
  avatarItem: TourAvatarBatchItem | null;
}) => Promise<{
  sceneClips: SceneClipBatchResult[];
  avatar: TourAvatarBatchResult | null;
}>;
