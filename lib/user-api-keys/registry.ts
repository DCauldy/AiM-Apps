export type UserApiKeyConfig = {
  key: string;
  name: string;
};

export const USER_APIKEY_REGISTRY = [
  { key: "elevenlabs", name: "ElevenLabs" },
  { key: "heygen", name: "HeyGen" },
] as const satisfies readonly UserApiKeyConfig[];

export type UserApiKeyServiceKey = (typeof USER_APIKEY_REGISTRY)[number]["key"];

const USER_APIKEY_SERVICE_KEYS = new Set<string>(
  USER_APIKEY_REGISTRY.map((config) => config.key)
);

export function isUserApiKeyServiceKey(value: string): value is UserApiKeyServiceKey {
  return USER_APIKEY_SERVICE_KEYS.has(value);
}
