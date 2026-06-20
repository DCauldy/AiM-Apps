import type { resolveProfileIdForRender } from "@/lib/profiles/resolve-for-render";
import type { getProfileApiKey } from "@/lib/user-api-keys/service";
import type {
  HeyGenAvatarProvider,
  HeyGenAvatarStageOptions,
  HeyGenAvatarStageResult,
} from "../avatars/tour-avatar";
import type { FinalVideoRenderer } from "../final-render/final-render";
import type { preflightTourRender, TourRenderOptions } from "../preflight/preflight";
import type {
  TourRenderAsset,
  TourRenderRepository,
  TourRenderStep,
} from "../repositories/tour-render.repository";
import type {
  ImageToVideoProvider,
  SceneClipBatchItem,
  SceneClipBatchResult,
  SceneClipBatchRunner,
  SceneClipRenderer,
} from "../scenes/scene-clips";
import type { TourScriptPlanningProvider } from "./tour-script-planning";
import type { TransitionDetectionProvider } from "../transitions/tour-transitions";
import type { VoiceoverProvider } from "../voiceover/tour-voiceover";

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
