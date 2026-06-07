export type DeleteAuthoritativeSourcePhotoRpcArgs = {
  p_project_id: string;
  p_scene_id: string;
  p_source_photo_id: null;
};

export type DeleteAuthoritativeSourcePhotoError = {
  status: 404 | 409 | 500;
  error: string;
};

export function getDeleteAuthoritativeSourcePhotoRpcArgs({
  projectId,
  sceneId,
}: {
  projectId: string;
  sceneId: string;
}): DeleteAuthoritativeSourcePhotoRpcArgs {
  return {
    p_project_id: projectId,
    p_scene_id: sceneId,
    // Current API contract: null asks the RPC to remove the priority-0/authoritative
    // source photo. Rail thumbnail selection is display-only until an endpoint accepts
    // a concrete source-photo id from the client.
    p_source_photo_id: null,
  };
}

export function mapDeleteAuthoritativeSourcePhotoError(message: string): DeleteAuthoritativeSourcePhotoError {
  if (message.includes("TourScene needs at least one listing photo")) {
    return { status: 409, error: "TourScene needs at least one primary listing photo." };
  }
  if (message.includes("TourScene listing photo was not found")) {
    return { status: 404, error: "Primary TourScene listing photo was not found." };
  }
  return { status: 500, error: "Could not remove the primary listing photo." };
}
