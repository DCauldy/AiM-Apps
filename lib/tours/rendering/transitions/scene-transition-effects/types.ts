import type {
  SceneClipHandlePlan,
  SceneTransitionEffectSettings,
} from "../scene-transition-effects";

export type BuildSceneTransitionJoinArgsInput = {
  sceneClipPaths: string[];
  handlePlans: SceneClipHandlePlan[];
  transitionSettings: SceneTransitionEffectSettings;
  width: number;
  height: number;
  fps: number;
  videoCodec: string;
  preset: string;
  crf: number;
  outputPath: string;
};

export type SceneTransitionEffectDefinition = {
  effect: string;
  outputExtension?: "mp4" | "mov";
  buildSceneJoinArgs(input: BuildSceneTransitionJoinArgsInput): string[];
};

export type SceneTransitionEffectDefinitionMap = Record<
  string,
  SceneTransitionEffectDefinition
>;
