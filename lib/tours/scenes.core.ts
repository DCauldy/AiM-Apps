export const TOUR_SCENE_CAMERA_MOTIONS = ["slow_push", "slow_pan", "static_hold"] as const;

export type TourSceneCameraMotion = (typeof TOUR_SCENE_CAMERA_MOTIONS)[number];

export type TourSceneSourcePhoto = {
  id: string;
  projectId: string;
  sceneId: string;
  storagePath: string;
  fileName: string;
  contentType: "image/jpeg" | "image/png" | "image/webp";
  byteSize: number;
  width: number | null;
  height: number | null;
  priority: number;
  createdAt: string;
};

export type TourSceneModel = {
  id: string;
  projectId: string;
  title: string;
  sortOrder: number;
  included: boolean;
  cameraMotion: TourSceneCameraMotion;
  createdAt: string;
  updatedAt: string;
  authoritativePhoto: TourSceneSourcePhoto;
};

export type TourSceneRow = {
  id: string;
  project_id: string;
  title: string;
  sort_order: number;
  included: boolean;
  camera_motion: TourSceneCameraMotion;
  created_at: string;
  updated_at: string;
};

export type TourSceneSourcePhotoRow = {
  id: string;
  project_id: string;
  scene_id: string;
  storage_path: string;
  file_name: string;
  content_type: "image/jpeg" | "image/png" | "image/webp";
  byte_size: number;
  width: number | null;
  height: number | null;
  priority: number;
  created_at: string;
};

export type NewTourSceneSourcePhoto = {
  storagePath: string;
  fileName: string;
  contentType: TourSceneSourcePhoto["contentType"];
  byteSize: number;
  width?: number | null;
  height?: number | null;
};

export type CreateTourSceneInput = {
  projectId: string;
  title: string;
  sourcePhoto: NewTourSceneSourcePhoto;
};

export type CreateTourSceneResult =
  | { ok: true; scene: TourSceneModel }
  | { ok: false; error: string };

export type ReorderTourScenesResult =
  | { ok: true; scenes: TourSceneModel[] }
  | { ok: false; error: string };

export type ToggleTourSceneInclusionResult =
  | { ok: true; scene: TourSceneModel }
  | { ok: false; error: string };

export type TourSceneReadinessStatus = "not_started" | "ready" | "skipped";

export type TourSceneReorderProjectAccess =
  | { ok: true }
  | { ok: false; status: 404 | 409; error: string };

export function validateTourSceneReorderProjectAccess(
  project: { status: "open" | "archived" } | null
): TourSceneReorderProjectAccess {
  if (!project) {
    return { ok: false, status: 404, error: "Tour Project was not found." };
  }

  if (project.status !== "open") {
    return { ok: false, status: 409, error: "Archived Tour Projects cannot reorder TourScenes." };
  }

  return { ok: true };
}

export type TourScenesRepository = {
  getNextSceneSortOrder(projectId: string): Promise<number>;
  createSceneWithSourcePhoto(input: {
    projectId: string;
    title: string;
    sortOrder: number;
    included: true;
    cameraMotion: TourSceneCameraMotion;
    authoritativePhoto: NewTourSceneSourcePhoto & { priority: 0 };
  }): Promise<{ scene: TourSceneRow; sourcePhotos: TourSceneSourcePhotoRow[] } | null>;
  listSceneRowsWithSourcePhotos(projectId: string): Promise<
    Array<{ scene: TourSceneRow; sourcePhotos: TourSceneSourcePhotoRow[] }>
  >;
  listSceneRowsForProject(projectId: string): Promise<TourSceneRow[]>;
  listSceneRowsByIds(sceneIds: string[]): Promise<TourSceneRow[]>;
  persistSceneOrder(projectId: string, orderedSceneIds: string[]): Promise<boolean>;
  updateSceneInclusion(projectId: string, sceneId: string, included: boolean): Promise<{
    scene: TourSceneRow;
    sourcePhotos: TourSceneSourcePhotoRow[];
  } | null>;
};

export function getInitialTourSceneCameraMotion(sortOrder: number): TourSceneCameraMotion {
  return TOUR_SCENE_CAMERA_MOTIONS[sortOrder % TOUR_SCENE_CAMERA_MOTIONS.length];
}

export function mapSourcePhoto(row: TourSceneSourcePhotoRow): TourSceneSourcePhoto {
  return {
    id: row.id,
    projectId: row.project_id,
    sceneId: row.scene_id,
    storagePath: row.storage_path,
    fileName: row.file_name,
    contentType: row.content_type,
    byteSize: row.byte_size,
    width: row.width,
    height: row.height,
    priority: row.priority,
    createdAt: row.created_at,
  };
}

export function getAuthoritativeSourcePhoto(
  sourcePhotos: TourSceneSourcePhotoRow[]
): TourSceneSourcePhoto | null {
  const [authoritativePhoto] = [...sourcePhotos].sort((a, b) => {
    if (a.priority !== b.priority) {
      return a.priority - b.priority;
    }
    return a.created_at.localeCompare(b.created_at);
  });

  return authoritativePhoto ? mapSourcePhoto(authoritativePhoto) : null;
}

export function mapTourScene(
  scene: TourSceneRow,
  sourcePhotos: TourSceneSourcePhotoRow[]
): TourSceneModel | null {
  const authoritativePhoto = getAuthoritativeSourcePhoto(sourcePhotos);
  if (scene.included && !authoritativePhoto) {
    return null;
  }

  if (!authoritativePhoto) {
    return null;
  }

  return {
    id: scene.id,
    projectId: scene.project_id,
    title: scene.title,
    sortOrder: scene.sort_order,
    included: scene.included,
    cameraMotion: scene.camera_motion,
    createdAt: scene.created_at,
    updatedAt: scene.updated_at,
    authoritativePhoto,
  };
}

export async function createTourSceneFromAuthoritativePhoto(
  input: CreateTourSceneInput,
  repository: TourScenesRepository
): Promise<CreateTourSceneResult> {
  const title = input.title.trim();
  if (!title) {
    return { ok: false, error: "Enter a TourScene title." };
  }

  if (!input.sourcePhoto.storagePath || !input.sourcePhoto.fileName || input.sourcePhoto.byteSize <= 0) {
    return { ok: false, error: "Add an authoritative listing photo for this TourScene." };
  }

  const sortOrder = await repository.getNextSceneSortOrder(input.projectId);
  const created = await repository.createSceneWithSourcePhoto({
    projectId: input.projectId,
    title,
    sortOrder,
    included: true,
    cameraMotion: getInitialTourSceneCameraMotion(sortOrder),
    authoritativePhoto: {
      ...input.sourcePhoto,
      priority: 0,
    },
  });

  if (!created) {
    return { ok: false, error: "Could not create the TourScene." };
  }

  const scene = mapTourScene(created.scene, created.sourcePhotos);
  if (!scene) {
    return { ok: false, error: "TourScene requires an authoritative listing photo." };
  }

  return { ok: true, scene };
}

export async function listTourScenesForProject(
  projectId: string,
  repository: TourScenesRepository
): Promise<TourSceneModel[]> {
  const rows = await repository.listSceneRowsWithSourcePhotos(projectId);
  return rows
    .sort((a, b) => a.scene.sort_order - b.scene.sort_order)
    .map(({ scene, sourcePhotos }) => mapTourScene(scene, sourcePhotos))
    .filter((scene): scene is TourSceneModel => Boolean(scene));
}

export function getTourSceneReadinessStatus(scenes: Array<{ included: boolean }>): TourSceneReadinessStatus {
  if (scenes.some((scene) => scene.included)) {
    return "ready";
  }

  if (scenes.length > 0) {
    return "skipped";
  }

  return "not_started";
}

export async function reorderTourScenesForProject(
  projectId: string,
  orderedSceneIds: string[],
  repository: TourScenesRepository
): Promise<ReorderTourScenesResult> {
  if (orderedSceneIds.length === 0) {
    return { ok: false, error: "Choose at least one TourScene to reorder." };
  }

  if (new Set(orderedSceneIds).size !== orderedSceneIds.length) {
    return { ok: false, error: "TourScene order contains duplicate scenes." };
  }

  const sceneRows = await repository.listSceneRowsByIds(orderedSceneIds);
  if (sceneRows.length !== orderedSceneIds.length) {
    return { ok: false, error: "TourScene order includes missing scenes." };
  }

  if (sceneRows.some((scene) => scene.project_id !== projectId)) {
    return { ok: false, error: "TourScenes can only be reordered within the same Tour Project." };
  }

  const projectSceneRows = await repository.listSceneRowsForProject(projectId);
  const projectSceneIds = new Set(projectSceneRows.map((scene) => scene.id));
  if (
    projectSceneRows.length !== orderedSceneIds.length ||
    orderedSceneIds.some((sceneId) => !projectSceneIds.has(sceneId))
  ) {
    return { ok: false, error: "TourScene order must include every scene in this Tour Project." };
  }

  const persisted = await repository.persistSceneOrder(projectId, orderedSceneIds);
  if (!persisted) {
    return { ok: false, error: "Could not save the TourScene order." };
  }

  return { ok: true, scenes: await listTourScenesForProject(projectId, repository) };
}

export async function toggleTourSceneInclusionForProject(
  projectId: string,
  sceneId: string,
  included: boolean,
  repository: TourScenesRepository
): Promise<ToggleTourSceneInclusionResult> {
  if (!sceneId) {
    return { ok: false, error: "Choose a TourScene to update." };
  }

  const sceneRows = await repository.listSceneRowsByIds([sceneId]);
  const [sceneRow] = sceneRows;
  if (!sceneRow) {
    return { ok: false, error: "TourScene was not found." };
  }

  if (sceneRow.project_id !== projectId) {
    return { ok: false, error: "TourScenes can only be updated within the same Tour Project." };
  }

  const updated = await repository.updateSceneInclusion(projectId, sceneId, included);
  if (!updated) {
    return { ok: false, error: "Could not update TourScene inclusion." };
  }

  const scene = mapTourScene(updated.scene, updated.sourcePhotos);
  if (!scene) {
    return { ok: false, error: "TourScene requires an authoritative listing photo." };
  }

  return { ok: true, scene };
}
