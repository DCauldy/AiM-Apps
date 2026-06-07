export type DeleteTourSceneSourcePhotoRpcArgs = {
  p_project_id: string;
  p_scene_id: string;
  p_source_photo_id: string | null;
};

export type DeleteTourSceneSourcePhotoError = {
  status: 404 | 409 | 500;
  error: string;
};

export function getDeleteAuthoritativeSourcePhotoRpcArgs({
  projectId,
  sceneId,
  sourcePhotoId = null,
}: {
  projectId: string;
  sceneId: string;
  sourcePhotoId?: string | null;
}): DeleteTourSceneSourcePhotoRpcArgs {
  return {
    p_project_id: projectId,
    p_scene_id: sceneId,
    p_source_photo_id: sourcePhotoId,
  };
}

export function mapDeleteAuthoritativeSourcePhotoError(message: string): DeleteTourSceneSourcePhotoError {
  if (message.includes("TourScene needs at least one listing photo")) {
    return { status: 409, error: "TourScene needs at least one listing photo." };
  }
  if (message.includes("TourScene listing photo was not found")) {
    return { status: 404, error: "TourScene listing photo was not found." };
  }
  return { status: 500, error: "Could not remove the listing photo." };
}
