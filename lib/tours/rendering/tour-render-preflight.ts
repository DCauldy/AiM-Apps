import "server-only";

import { getUserApiKeyStatusMap } from "@/lib/user-api-keys/server";
import type { TourProjectType } from "../project-types";
import {
  createTourRenderRepository,
  type TourRenderPreflightProject,
  type TourRenderRepository,
} from "./tour-render.repository";

export type TourRenderMode = "ken_burns_ffmpeg" | "provider_image_to_video";

export type TourRenderOptions = {
  renderMode?: TourRenderMode;
  reuseExistingAssets?: boolean;
  fakeRenderRun?: boolean;
  tourType?: TourProjectType;
};

export type TourRenderPreflightIssueCode =
  | "project_not_found"
  | "project_archived"
  | "no_included_scenes"
  | "missing_authoritative_source_photo"
  | "missing_elevenlabs_key"
  | "missing_heygen_key"
  | "listing_media_unreadable"
  | "generated_media_unwritable";

export type TourRenderPreflightIssue = {
  code: TourRenderPreflightIssueCode;
  message: string;
  severity: "blocking";
  sceneId?: string;
};

export type TourRenderPreflightSummary = {
  projectId: string;
  tourType: TourProjectType;
  renderMode: TourRenderMode;
  includedSceneCount: number;
  sourcePhotoCount: number;
  proofedFactCount: number;
  requiredProviderKeys: Array<"elevenlabs" | "heygen">;
};

export type TourRenderPreflightResult =
  | { ok: true; summary: TourRenderPreflightSummary }
  | { ok: false; issues: TourRenderPreflightIssue[] };

type ProviderKeyStatusMap = Partial<Record<"elevenlabs" | "heygen", boolean>>;

type PreflightTourRenderServiceOptions = {
  repository?: TourRenderRepository;
  getProviderKeyStatusMap?: (
    userId: string,
    serviceKeys: readonly ("elevenlabs" | "heygen")[]
  ) => Promise<ProviderKeyStatusMap>;
};

const DEFAULT_RENDER_MODE: TourRenderMode = "ken_burns_ffmpeg";

function issue(
  code: TourRenderPreflightIssueCode,
  message: string,
  sceneId?: string
): TourRenderPreflightIssue {
  return {
    code,
    message,
    severity: "blocking",
    ...(sceneId ? { sceneId } : {}),
  };
}

function getRequiredProviderKeys(tourType: TourProjectType): Array<"elevenlabs" | "heygen"> {
  if (tourType === "tour_video_voice_over") {
    return ["elevenlabs"];
  }

  if (tourType === "tour_video_avatar") {
    return ["heygen"];
  }

  return [];
}

function summarizePreflightProject(
  project: TourRenderPreflightProject,
  options: TourRenderOptions,
  requiredProviderKeys: Array<"elevenlabs" | "heygen">
): TourRenderPreflightSummary {
  const includedScenes = project.scenes.filter((scene) => scene.included);

  return {
    projectId: project.project.id,
    tourType: project.project.tourType,
    renderMode: options.renderMode ?? DEFAULT_RENDER_MODE,
    includedSceneCount: includedScenes.length,
    sourcePhotoCount: includedScenes.filter((scene) => scene.authoritativePhoto).length,
    proofedFactCount: includedScenes.reduce((count, scene) => count + scene.proofedFacts.length, 0),
    requiredProviderKeys,
  };
}

export async function preflightTourRender(
  input: {
    projectId: string;
    userId: string;
    options?: TourRenderOptions;
  },
  serviceOptions: PreflightTourRenderServiceOptions = {}
): Promise<TourRenderPreflightResult> {
  const repository = serviceOptions.repository ?? (await createTourRenderRepository());
  const getStatusMap = serviceOptions.getProviderKeyStatusMap ?? getUserApiKeyStatusMap;
  const options = input.options ?? {};
  const issues: TourRenderPreflightIssue[] = [];

  const project = await repository.getTourRenderPreflightProject({
    projectId: input.projectId,
    userId: input.userId,
  });

  if (!project) {
    return {
      ok: false,
      issues: [
        issue(
          "project_not_found",
          "Tour Project was not found or is not available to this account."
        ),
      ],
    };
  }

  if (project.project.status !== "open") {
    issues.push(
      issue("project_archived", "Archived Tour Projects cannot be rendered.")
    );
  }

  const includedScenes = project.scenes.filter((scene) => scene.included);
  if (includedScenes.length === 0) {
    issues.push(
      issue("no_included_scenes", "Include at least one scene before rendering.")
    );
  }

  for (const scene of includedScenes) {
    if (!scene.authoritativePhoto) {
      issues.push(
        issue(
          "missing_authoritative_source_photo",
          "Every included scene needs an authoritative source photo before rendering.",
          scene.id
        )
      );
    }
  }

  const requiredProviderKeys = getRequiredProviderKeys(project.project.tourType);
  if (requiredProviderKeys.length > 0) {
    const keyStatus = await getStatusMap(input.userId, requiredProviderKeys);

    if (project.project.tourType === "tour_video_voice_over" && keyStatus.elevenlabs !== true) {
      issues.push(
        issue(
          "missing_elevenlabs_key",
          "Add an ElevenLabs API key before rendering a voice-over tour."
        )
      );
    }

    if (project.project.tourType === "tour_video_avatar" && keyStatus.heygen !== true) {
      issues.push(
        issue("missing_heygen_key", "Add a HeyGen API key before rendering an avatar tour.")
      );
    }
  }

  const readableSourcePaths = includedScenes
    .map((scene) => scene.authoritativePhoto?.storagePath)
    .filter((storagePath): storagePath is string => Boolean(storagePath));

  if (
    readableSourcePaths.length > 0 &&
    !(await repository.canReadListingMedia({ storagePaths: readableSourcePaths }))
  ) {
    issues.push(
      issue(
        "listing_media_unreadable",
        "Listing source media could not be read. Re-upload the scene photos and try again."
      )
    );
  }

  if (!(await repository.canWriteGeneratedMedia({ userId: input.userId, projectId: input.projectId }))) {
    issues.push(
      issue(
        "generated_media_unwritable",
        "Generated media storage is not writable. Try again after storage is available."
      )
    );
  }

  if (issues.length > 0) {
    return { ok: false, issues };
  }

  return {
    ok: true,
    summary: summarizePreflightProject(project, options, requiredProviderKeys),
  };
}
