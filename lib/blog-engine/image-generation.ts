import OpenAI from "openai";
import { createServiceRoleClient } from "@/lib/supabase/server";

const BUCKET = "blog-images";

// OpenAI's newest image-only model (GPT Image 2), routed through OpenRouter so
// it uses the OPENROUTER_API_KEY that's already configured everywhere (incl.
// Trigger.dev) — no separate OPENAI_API_KEY needed in prod. Override with
// BLOG_IMAGE_MODEL (e.g. "openai/gpt-image-1" to fall back).
// (openai/gpt-5.4-image-2 / gpt-5-image are CHAT-multimodal models; the
// gpt-image-* slugs are the dedicated image-API models.)
const IMAGE_MODEL = process.env.BLOG_IMAGE_MODEL ?? "openai/gpt-image-2";
const SIZE = "1536x1024";
const QUALITY = "medium";

/**
 * Generate a featured image and upload it to Supabase Storage.
 *
 * Prefers OpenRouter's Unified Image API (Authorization: OPENROUTER_API_KEY),
 * falling back to the OpenAI SDK directly when only OPENAI_API_KEY is present
 * (e.g. local dev). Both return base64 image data.
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
  // 1. Generate image (base64)
  const b64 = await generateImageBase64(prompt);
  if (!b64) return null;

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

  // 4. Public URL with cache-buster (same path is reused on regeneration)
  const { data: urlData } = supabase.storage
    .from(BUCKET)
    .getPublicUrl(storagePath);

  return `${urlData.publicUrl}?v=${Date.now()}`;
}

/** Returns base64 PNG data for the prompt, or null when no provider is configured. */
async function generateImageBase64(prompt: string): Promise<string | null> {
  const openRouterKey = process.env.OPENROUTER_API_KEY;
  if (openRouterKey) {
    const res = await fetch("https://openrouter.ai/api/v1/images", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${openRouterKey}`,
        "Content-Type": "application/json",
        "X-Title": "AiM Blog Engine",
      },
      body: JSON.stringify({
        model: IMAGE_MODEL,
        prompt,
        n: 1,
        size: SIZE,
        quality: QUALITY,
        output_format: "png",
      }),
    });
    if (!res.ok) {
      const body = await res.text().catch(() => "");
      throw new Error(
        `OpenRouter image generation failed (${res.status}): ${body.slice(0, 300)}`,
      );
    }
    const json = (await res.json()) as { data?: { b64_json?: string }[] };
    const b64 = json.data?.[0]?.b64_json;
    if (!b64) throw new Error("No image data returned from OpenRouter");
    return b64;
  }

  // Fallback: direct OpenAI (local dev with OPENAI_API_KEY but no OpenRouter).
  const openaiKey = process.env.OPENAI_API_KEY;
  if (!openaiKey) {
    console.error("[ImageGen] No OPENROUTER_API_KEY or OPENAI_API_KEY set");
    return null;
  }
  const openai = new OpenAI({ apiKey: openaiKey });
  const response = await openai.images.generate({
    model: "gpt-image-1",
    prompt,
    n: 1,
    size: SIZE,
    quality: QUALITY,
  });
  const b64 = response.data?.[0]?.b64_json;
  if (!b64) throw new Error("No image data returned from OpenAI");
  return b64;
}
