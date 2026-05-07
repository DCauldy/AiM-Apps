import OpenAI from "openai";
import { createServiceRoleClient } from "@/lib/supabase/server";

const BUCKET = "blog-images";

/**
 * Generate a featured image using OpenAI gpt-image-1 and upload to Supabase Storage.
 *
 * @returns The public URL of the uploaded image, or null if generation fails.
 */
export async function generateAndUploadImage({
  userId,
  blogId,
  prompt,
}: {
  userId: string;
  blogId: string;
  prompt: string;
}): Promise<string | null> {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    console.error("[ImageGen] OPENAI_API_KEY is not set");
    return null;
  }

  const openai = new OpenAI({ apiKey });

  // 1. Generate image
  const response = await openai.images.generate({
    model: "gpt-image-1",
    prompt,
    n: 1,
    size: "1536x1024",
    quality: "medium",
  });

  const b64 = response.data?.[0]?.b64_json;
  if (!b64) {
    throw new Error("No image data returned from OpenAI");
  }

  // 2. Decode base64 to buffer
  const buffer = Buffer.from(b64, "base64");

  // 3. Upload to Supabase Storage (upsert so regeneration overwrites)
  const storagePath = `${userId}/${blogId}/featured.png`;
  const supabase = createServiceRoleClient();

  const { error: uploadError } = await supabase.storage
    .from(BUCKET)
    .upload(storagePath, buffer, {
      contentType: "image/png",
      upsert: true,
    });

  if (uploadError) {
    throw new Error(`Storage upload failed: ${uploadError.message}`);
  }

  // 4. Get public URL with cache-buster (same path is reused on regeneration)
  const { data: urlData } = supabase.storage
    .from(BUCKET)
    .getPublicUrl(storagePath);

  return `${urlData.publicUrl}?v=${Date.now()}`;
}
