import type { HeyGenAvatarProjectPosition } from "./avatar-project-settings";
import type { TourProjectType } from "./project-types";
import type { TourProjectWorkspaceViewModel } from "./workspace";

export type OpenTourProject = {
  id: string;
  name: string;
  property_address: string;
  listing_url: string | null;
  tour_type: TourProjectType;
  status: "open" | "archived";
  created_at: string;
  updated_at: string;
  cover_photo_preview_url: string | null;
};

export type OpenTourProjectsResponse = {
  projects: OpenTourProject[];
};

export type CreateTourProjectResponse = {
  projectId: string;
};

export type TourProjectWorkspaceResponse = {
  workspace: TourProjectWorkspaceViewModel;
};

export type UpdatedTourProject = {
  id: string;
  name: string;
  property_address: string;
  listing_url: string | null;
  tour_type: TourProjectType;
  elevenlabs_voice_id: string | null;
  heygen_avatar_id: string | null;
  heygen_avatar_placement: HeyGenAvatarProjectPosition | null;
  status: "open" | "archived";
  updated_at: string;
};

export type UpdateTourProjectResponse = {
  project: UpdatedTourProject;
};
