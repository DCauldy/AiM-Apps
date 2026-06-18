export class TourSceneClipRenderError extends Error {
  constructor(
    message: string,
    readonly code:
      | "PROJECT_HAS_NO_INCLUDED_SCENES"
      | "SCENE_DURATION_MISSING"
      | "SOURCE_PHOTO_DOWNLOAD_FAILED"
      | "SIGNED_SOURCE_PHOTO_URL_MISSING"
      | "SCENE_CLIP_RENDER_FAILED"
      | "SCENE_CLIP_PROVIDER_FAILED"
      | "SCENE_CLIP_PROVIDER_OUTPUT_IMPORT_FAILED"
      | "SCENE_CLIP_UPLOAD_FAILED"
      | "SCENE_CLIP_ASSET_CREATE_FAILED"
  ) {
    super(message);
    this.name = "TourSceneClipRenderError";
  }
}
