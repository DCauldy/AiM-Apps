export type ElevenLabsDigitalTwinVoice = {
  id: string;
  name: string;
  category: "cloned" | "professional";
  description: string | null;
  previewUrl: string | null;
  labels: Record<string, string>;
  fineTuningState: string | null;
};

export type HeyGenAvatarLook = {
  id: string;
  name: string;
  avatarType: string;
  groupId: string | null;
  gender: string | null;
  previewImageUrl: string | null;
  previewVideoUrl: string | null;
  tags: string[];
  supportedApiEngines: string[];
  status: string | null;
};

export type ElevenLabsVoicesResponse = {
  voices: ElevenLabsDigitalTwinVoice[];
};

export type HeyGenAvatarsResponse = {
  avatars: HeyGenAvatarLook[];
};
