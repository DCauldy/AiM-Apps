import { randomUUID } from "node:crypto";
import type {
  SignedGeneratedMediaUrl,
  SignedSourcePhotoUrl,
  SupabaseClient,
  TourRenderRepository,
  UploadedRenderAsset,
} from "./tour-render.repository.types";

export function createTourRenderStorageRepository(
  supabase: SupabaseClient
): Pick<
  TourRenderRepository,
  | "canReadListingMedia"
  | "canWriteGeneratedMedia"
  | "createSignedSourcePhotoUrls"
  | "downloadListingMedia"
  | "uploadRenderAssetJson"
  | "uploadRenderAssetBytes"
  | "downloadRenderAssetJson"
  | "downloadRenderAssetBytes"
  | "createSignedGeneratedMediaUrl"
> {
  return {
    async canReadListingMedia(input) {
      for (const storagePath of input.storagePaths) {
        const { data, error } = await supabase.storage
          .from("tours-listing-media")
          .createSignedUrl(storagePath, 60);

        if (error || !data?.signedUrl) {
          return false;
        }
      }

      return true;
    },

    async canWriteGeneratedMedia(input) {
      const storagePath = `${input.userId}/${input.projectId}/preflight/${randomUUID()}.json`;
      const bucket = supabase.storage.from("tours-generated-media");
      const { error: uploadError } = await bucket.upload(
        storagePath,
        new Blob([JSON.stringify({ ok: true })], { type: "application/json" }),
        {
          contentType: "application/json",
          upsert: false,
        }
      );

      if (uploadError) {
        return false;
      }

      const { error: removeError } = await bucket.remove([storagePath]);
      return !removeError;
    },

    async createSignedSourcePhotoUrls(input): Promise<SignedSourcePhotoUrl[]> {
      const bucket = supabase.storage.from("tours-listing-media");
      const signedUrls: SignedSourcePhotoUrl[] = [];

      for (const storagePath of input.storagePaths) {
        const { data, error } = await bucket.createSignedUrl(
          storagePath,
          input.expiresInSeconds ?? 5 * 60
        );

        if (error || !data?.signedUrl) {
          return [];
        }

        signedUrls.push({
          storagePath,
          signedUrl: rewriteProviderUrlOrigin(data.signedUrl),
        });
      }

      return signedUrls;
    },

    async downloadListingMedia(input) {
      const { data, error } = await supabase.storage
        .from("tours-listing-media")
        .download(input.storagePath);

      if (error || !data) {
        return null;
      }

      return Buffer.from(await data.arrayBuffer());
    },

    async uploadRenderAssetJson(input): Promise<UploadedRenderAsset | null> {
      const storagePath = `${input.userId}/${input.projectId}/${input.runId}/${input.kind}-${randomUUID()}.json`;
      const content = JSON.stringify(input.value, null, 2);
      const contentType = "application/json";
      const { error } = await supabase.storage
        .from("tours-generated-media")
        .upload(storagePath, new Blob([content], { type: contentType }), {
          contentType,
          upsert: false,
        });

      if (error) {
        return null;
      }

      return {
        storageBucket: "tours-generated-media",
        storagePath,
        contentType,
      };
    },

    async uploadRenderAssetBytes(input): Promise<UploadedRenderAsset | null> {
      const safeExtension = input.extension.replace(/^\./, "").replace(/[^a-z0-9]/gi, "");
      const storagePath = `${input.userId}/${input.projectId}/${input.runId}/${input.kind}-${randomUUID()}.${safeExtension || "bin"}`;
      const { error } = await supabase.storage
        .from("tours-generated-media")
        .upload(storagePath, input.content, {
          contentType: input.contentType,
          upsert: false,
        });

      if (error) {
        return null;
      }

      return {
        storageBucket: "tours-generated-media",
        storagePath,
        contentType: input.contentType,
      };
    },

    async downloadRenderAssetJson(input) {
      const { data, error } = await supabase.storage
        .from(input.storageBucket)
        .download(input.storagePath);

      if (error || !data) {
        return null;
      }

      try {
        return JSON.parse(await data.text());
      } catch {
        return null;
      }
    },

    async downloadRenderAssetBytes(input) {
      const { data, error } = await supabase.storage
        .from(input.storageBucket)
        .download(input.storagePath);

      if (error || !data) {
        return null;
      }

      return Buffer.from(await data.arrayBuffer());
    },

    async createSignedGeneratedMediaUrl(input): Promise<SignedGeneratedMediaUrl | null> {
      const { data, error } = await supabase.storage
        .from(input.storageBucket)
        .createSignedUrl(
          input.storagePath,
          input.expiresInSeconds ?? 60 * 60,
          input.downloadTitle ? { download: input.downloadTitle } : undefined
        );

      if (error || !data?.signedUrl) {
        return null;
      }

      return {
        storageBucket: input.storageBucket,
        storagePath: input.storagePath,
        signedUrl: rewriteProviderUrlOrigin(data.signedUrl),
      };
    },
  };
}

function rewriteProviderUrlOrigin(signedUrl: string): string {
  const providerOrigin = process.env.PROVIDER_VISIBLE_SUPABASE_URL?.trim();
  if (!providerOrigin) {
    return signedUrl;
  }

  try {
    const source = new URL(signedUrl);
    const target = new URL(providerOrigin);
    source.protocol = target.protocol;
    source.hostname = target.hostname;
    source.port = target.port;
    return source.toString();
  } catch {
    return signedUrl;
  }
}
