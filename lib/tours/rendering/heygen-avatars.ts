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

type HeyGenAvatarLooksResponse = {
  looks: unknown[];
  hasMore: boolean;
  nextToken: string | null;
};

type HeyGenAvatarLookResponse = {
  id?: unknown;
  name?: unknown;
  avatar_type?: unknown;
  group_id?: unknown;
  gender?: unknown;
  preview_image_url?: unknown;
  preview_video_url?: unknown;
  tags?: unknown;
  supported_api_engines?: unknown;
  status?: unknown;
};

const MAX_AVATAR_LOOK_PAGES = 10;

export class HeyGenAvatarsError extends Error {
  constructor(
    message: string,
    readonly code: "HEYGEN_AVATARS_FAILED" | "HEYGEN_AVATARS_RESPONSE_INVALID"
  ) {
    super(message);
    this.name = "HeyGenAvatarsError";
  }
}

export async function listHeyGenDigitalTwinAvatarLooks(input: {
  apiKey: string;
  fetch?: typeof fetch;
}): Promise<HeyGenAvatarLook[]> {
  const fetchImpl = input.fetch ?? fetch;
  const avatarsById = new Map<string, HeyGenAvatarLook>();
  let token: string | null = null;

  for (let page = 0; page < MAX_AVATAR_LOOK_PAGES; page += 1) {
    const payload = await fetchHeyGenAvatarLooksPage({
      apiKey: input.apiKey,
      fetch: fetchImpl,
      token,
    });

    for (const look of payload.looks) {
      const normalized = normalizeHeyGenAvatarLook(look);
      if (normalized) {
        avatarsById.set(normalized.id, normalized);
      }
    }

    if (!payload.hasMore || !payload.nextToken) {
      break;
    }
    token = payload.nextToken;
  }

  return [...avatarsById.values()].sort((a, b) => a.name.localeCompare(b.name));
}

async function fetchHeyGenAvatarLooksPage(input: {
  apiKey: string;
  fetch: typeof fetch;
  token: string | null;
}): Promise<HeyGenAvatarLooksResponse> {
  const url = new URL("https://api.heygen.com/v3/avatars/looks");
  url.searchParams.set("ownership", "private");
  url.searchParams.set("avatar_type", "digital_twin");
  url.searchParams.set("limit", "50");
  if (input.token) {
    url.searchParams.set("token", input.token);
  }

  let response: Response;
  try {
    response = await input.fetch(url, {
      headers: {
        "x-api-key": input.apiKey,
      },
    });
  } catch {
    throw new HeyGenAvatarsError(
      "Could not load HeyGen avatars.",
      "HEYGEN_AVATARS_FAILED"
    );
  }

  if (!response.ok) {
    throw new HeyGenAvatarsError(
      "Could not load HeyGen avatars.",
      "HEYGEN_AVATARS_FAILED"
    );
  }

  const payload = await response.json().catch(() => null);
  const normalized = normalizeAvatarLooksResponse(payload);
  if (!normalized) {
    throw new HeyGenAvatarsError(
      "HeyGen avatars response was invalid.",
      "HEYGEN_AVATARS_RESPONSE_INVALID"
    );
  }

  return normalized;
}

function normalizeAvatarLooksResponse(payload: unknown): HeyGenAvatarLooksResponse | null {
  if (!payload || typeof payload !== "object") return null;
  const response = payload as Record<string, unknown>;
  const data = response.data;
  const dataRecord =
    data && typeof data === "object" && !Array.isArray(data)
      ? data as Record<string, unknown>
      : null;
  const looks = Array.isArray(data)
    ? data
    : firstArray(
        dataRecord?.avatar_looks,
        dataRecord?.looks,
        dataRecord?.items,
        dataRecord?.avatars,
        response.avatar_looks,
        response.looks,
        response.items,
        response.avatars
      );
  if (!looks) return null;

  const hasMore = dataRecord?.has_more ?? response.has_more;
  const nextToken =
    dataRecord?.next_token ??
    dataRecord?.next_page_token ??
    dataRecord?.token ??
    response.next_token ??
    response.next_page_token ??
    response.token;
  return {
    looks,
    hasMore: typeof hasMore === "boolean" ? hasMore : false,
    nextToken: typeof nextToken === "string" && nextToken.trim() ? nextToken : null,
  };
}

function normalizeHeyGenAvatarLook(look: unknown): HeyGenAvatarLook | null {
  if (!look || typeof look !== "object") return null;
  const value = look as HeyGenAvatarLookResponse;
  if (typeof value.id !== "string" || !value.id.trim()) return null;
  if (typeof value.name !== "string" || !value.name.trim()) return null;
  const avatarType =
    typeof value.avatar_type === "string" && value.avatar_type.trim()
      ? value.avatar_type
      : "digital_twin";
  if (avatarType !== "digital_twin") return null;
  if (typeof value.status === "string" && value.status !== "completed") return null;

  return {
    id: value.id,
    name: value.name,
    avatarType,
    groupId: typeof value.group_id === "string" ? value.group_id : null,
    gender: typeof value.gender === "string" ? value.gender : null,
    previewImageUrl: typeof value.preview_image_url === "string" ? value.preview_image_url : null,
    previewVideoUrl: typeof value.preview_video_url === "string" ? value.preview_video_url : null,
    tags: normalizeStringArray(value.tags),
    supportedApiEngines: normalizeStringArray(value.supported_api_engines),
    status: typeof value.status === "string" ? value.status : null,
  };
}

function firstArray(...values: unknown[]): unknown[] | null {
  return values.find((value): value is unknown[] => Array.isArray(value)) ?? null;
}

function normalizeStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.filter((item): item is string => typeof item === "string");
}
