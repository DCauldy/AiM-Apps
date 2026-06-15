import "server-only";

import { createClient } from "@/lib/supabase/server";
import type { HeyGenAvatarProjectPosition } from "@/lib/tours/avatar-project-settings";
import { LISTING_MEDIA_ACKNOWLEDGEMENT_COPY } from "@/lib/tours/listing-media-authorization";
import { listTourSceneFactsForProject } from "@/lib/tours/facts";
import type { TourProjectType } from "@/lib/tours/project-types";
import { getTourScenesForProject, type TourSceneCameraMotion } from "@/lib/tours/scenes";
import { getTourSceneReadinessStatus } from "@/lib/tours/scenes.core";

export type TourSceneFact = {
  id: string;
  text: string;
  sourceType: "human" | "ai_suggestion";
  sourceLabel: string | null;
  sourcePhotoId: string | null;
  proofStatus: "proofed" | "suggested" | "rejected";
  sortOrder: number;
};

export type TourScene = {
  id: string;
  title: string;
  sortOrder: number;
  included: boolean;
  cameraMotion: TourSceneCameraMotion;
  authoritativePhoto: {
    id: string;
    fileName: string;
    storagePath: string;
    contentType: string;
    previewUrl: string | null;
  };
  sourcePhotos: Array<{
    id: string;
    fileName: string;
    storagePath: string;
    contentType: string;
    previewUrl: string | null;
  }>;
  facts: TourSceneFact[];
  hasProofedContext: boolean;
  status: "ready" | "skipped";
};

export type TourProjectWorkspaceViewModel = {
  project: {
    id: string;
    name: string;
    lifecycleStatus: "open";
    tourType: TourProjectType;
    elevenLabsVoiceId: string | null;
    heyGenAvatarId: string | null;
    heyGenAvatarPlacement: HeyGenAvatarProjectPosition | null;
    createdAt: string;
    updatedAt: string;
  };
  listing: {
    address: string;
    listingUrl: string | null;
  };
  ownership: {
    canEdit: boolean;
  };
  listingMediaAuthorization: {
    acknowledgementCopy: string;
    hasAcknowledged: boolean;
    acknowledgedAt: string | null;
  };
  tourScenes: TourScene[];
  readiness: {
    media: "not_started" | "ready" | "skipped";
    scenePlan: "not_started" | "ready" | "skipped";
    approvals: "not_started";
    narration: "not_started";
    export: "not_started";
  };
};

type TourProjectRow = {
  id: string;
  name: string;
  property_address: string;
  listing_url: string | null;
  tour_type: TourProjectType;
  status: "open" | "archived";
  listing_media_acknowledged_at: string | null;
  elevenlabs_voice_id: string | null;
  heygen_avatar_id: string | null;
  heygen_avatar_placement: HeyGenAvatarProjectPosition | null;
  created_at: string;
  updated_at: string;
};

export async function getTourProjectWorkspaceViewModel(
  projectId: string
): Promise<TourProjectWorkspaceViewModel | null> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return null;
  }

  const { data: project } = await supabase
    .from("tours_projects")
    .select("id, name, property_address, listing_url, tour_type, status, listing_media_acknowledged_at, elevenlabs_voice_id, heygen_avatar_id, heygen_avatar_placement, created_at, updated_at")
    .eq("id", projectId)
    .eq("user_id", user.id)
    .eq("status", "open")
    .maybeSingle<TourProjectRow>();

  if (!project) {
    return null;
  }

  const [tourScenes, sceneFacts] = await Promise.all([
    getTourScenesForProject(project.id),
    listTourSceneFactsForProject(project.id),
  ]);
  const factsBySceneId = new Map<string, TourSceneFact[]>();
  for (const fact of sceneFacts) {
    const sceneFactsForScene = factsBySceneId.get(fact.sceneId) ?? [];
    sceneFactsForScene.push({
      id: fact.id,
      text: fact.text,
      sourceType: fact.sourceType,
      sourceLabel: fact.sourceLabel,
      sourcePhotoId: fact.sourcePhotoId,
      proofStatus: fact.proofStatus,
      sortOrder: fact.sortOrder,
    });
    factsBySceneId.set(fact.sceneId, sceneFactsForScene);
  }

  const workspaceScenes = await Promise.all(tourScenes.map(async (scene) => {
    const signedSourcePhotos = await Promise.all(scene.sourcePhotos.map(async (photo) => {
      const { data: signedPhoto } = await supabase.storage
        .from("tours-listing-media")
        .createSignedUrl(photo.storagePath, 60 * 60);

      return {
        id: photo.id,
        fileName: photo.fileName,
        storagePath: photo.storagePath,
        contentType: photo.contentType,
        previewUrl: signedPhoto?.signedUrl ?? null,
      };
    }));
    const authoritativePhoto =
      signedSourcePhotos.find((photo) => photo.id === scene.authoritativePhoto.id) ??
      signedSourcePhotos[0] ?? {
        id: scene.authoritativePhoto.id,
        fileName: scene.authoritativePhoto.fileName,
        storagePath: scene.authoritativePhoto.storagePath,
        contentType: scene.authoritativePhoto.contentType,
        previewUrl: null,
      };

    return {
      id: scene.id,
      title: scene.title,
      sortOrder: scene.sortOrder,
      included: scene.included,
      cameraMotion: scene.cameraMotion,
      authoritativePhoto,
      sourcePhotos: signedSourcePhotos,
      facts: factsBySceneId.get(scene.id) ?? [],
      hasProofedContext: (factsBySceneId.get(scene.id) ?? []).some((fact) => fact.proofStatus === "proofed"),
      status: scene.included ? "ready" as const : "skipped" as const,
    };
  }));
  const sceneReadiness = getTourSceneReadinessStatus(workspaceScenes);

  return {
    project: {
      id: project.id,
      name: project.name,
      lifecycleStatus: "open",
      tourType: project.tour_type,
      elevenLabsVoiceId: project.elevenlabs_voice_id,
      heyGenAvatarId: project.heygen_avatar_id,
      heyGenAvatarPlacement: project.heygen_avatar_placement,
      createdAt: project.created_at,
      updatedAt: project.updated_at,
    },
    listing: {
      address: project.property_address,
      listingUrl: project.listing_url,
    },
    ownership: {
      canEdit: true,
    },
    listingMediaAuthorization: {
      acknowledgementCopy: LISTING_MEDIA_ACKNOWLEDGEMENT_COPY,
      hasAcknowledged: Boolean(project.listing_media_acknowledged_at),
      acknowledgedAt: project.listing_media_acknowledged_at,
    },
    tourScenes: workspaceScenes,
    readiness: {
      media: sceneReadiness,
      scenePlan: sceneReadiness,
      approvals: "not_started",
      narration: "not_started",
      export: "not_started",
    },
  };
}
