export const TOUR_PROJECT_TYPES = [
  "tour_video",
  "tour_video_voice_over",
  "tour_video_avatar",
] as const;

export type TourProjectType = (typeof TOUR_PROJECT_TYPES)[number];

export const DEFAULT_TOUR_PROJECT_TYPE: TourProjectType = "tour_video";

export const TOUR_PROJECT_TYPE_LABELS: Record<TourProjectType, string> = {
  tour_video: "Tour Video",
  tour_video_voice_over: "Voice Over Tour",
  tour_video_avatar: "Avatar Tour",
};
