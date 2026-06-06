import "server-only";

import { createClient } from "@/lib/supabase/server";
import { LISTING_MEDIA_ACKNOWLEDGEMENT_COPY } from "@/lib/tours/listing-media-authorization";
import { getTourScenesForProject } from "@/lib/tours/scenes";
import { getTourSceneReadinessStatus } from "@/lib/tours/scenes.core";

export type TourScene = {
  id: string;
  title: string;
  sortOrder: number;
  included: boolean;
  cameraMotion: string;
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
  status: "ready" | "skipped";
};

export type TourProjectWorkspaceViewModel = {
  project: {
    id: string;
    name: string;
    lifecycleStatus: "open";
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
  status: "open" | "archived";
  listing_media_acknowledged_at: string | null;
  created_at: string;
  updated_at: string;
};

export async function getTourProjectWorkspaceViewModel(
  projectId: string
): Promise<TourProjectWorkspaceViewModel | null> {
  const supabase = await createClient();
  const { data: project } = await supabase
    .from("tours_projects")
    .select("id, name, property_address, listing_url, status, listing_media_acknowledged_at, created_at, updated_at")
    .eq("id", projectId)
    .eq("status", "open")
    .maybeSingle<TourProjectRow>();

  if (!project) {
    return null;
  }

  const tourScenes = await getTourScenesForProject(project.id);

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
      status: scene.included ? "ready" as const : "skipped" as const,
    };
  }));
  const sceneReadiness = getTourSceneReadinessStatus(workspaceScenes);

  return {
    project: {
      id: project.id,
      name: project.name,
      lifecycleStatus: "open",
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
