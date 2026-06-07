import { createClient, createServiceRoleClient } from "@/lib/supabase/server";
import { getImagePrompt } from "@/lib/blog-engine/prompts";
import { generateAndUploadImage } from "@/lib/blog-engine/image-generation";
import { NextRequest } from "next/server";
import { getProfileForBlogEngine } from "@/lib/profiles/effective-profile";
import type { ImageStyle } from "@/types/blog-engine";

export const dynamic = "force-dynamic";

/**
 * POST /api/apps/blog-engine/blogs/[blogId]/regenerate-image
 * Regenerate the featured image for a blog.
 */
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ blogId: string }> }
) {
  try {
    const { blogId } = await params;
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return Response.json({ error: "Unauthorized" }, { status: 401 });

    // Load blog
    const { data: blog } = await supabase
      .from("bofu_blogs")
      .select("*")
      .eq("id", blogId)
      .eq("user_id", user.id)
      .single();

    if (!blog) {
      return Response.json({ error: "Blog not found" }, { status: 404 });
    }

    // Check regeneration limit
    if (blog.image_regenerations_used >= blog.image_regenerations_limit) {
      return Response.json(
        {
          error: "regeneration_limit_reached",
          used: blog.image_regenerations_used,
          limit: blog.image_regenerations_limit,
        },
        { status: 429 }
      );
    }

    const body = await req.json().catch(() => ({}));
    const requestedStyle: ImageStyle =
      body.style || blog.featured_image_style || "location";

    // Load effective profile for image prompt (platform_profiles if active, else legacy)
    const serviceClient = createServiceRoleClient();
    const typedProfile = await getProfileForBlogEngine(user.id);
    if (!typedProfile) {
      return Response.json({ error: "Profile not found" }, { status: 404 });
    }
    const imagePromptText = getImagePrompt(
      typedProfile,
      blog.title,
      requestedStyle,
      blog.excerpt || undefined
    );

    // Generate image via OpenAI gpt-image-1 and upload to Supabase Storage
    const imageUrl = await generateAndUploadImage({
      userId: user.id,
      blogId,
      prompt: imagePromptText,
    });

    if (!imageUrl) {
      return Response.json(
        { error: "Image generation returned no result" },
        { status: 500 }
      );
    }

    // Only increment counter on success
    await serviceClient
      .from("bofu_blogs")
      .update({
        featured_image_url: imageUrl,
        featured_image_style: requestedStyle,
        image_regenerations_used: blog.image_regenerations_used + 1,
        updated_at: new Date().toISOString(),
      })
      .eq("id", blogId);

    return Response.json({
      success: true,
      imageUrl,
      style: requestedStyle,
      regenerationsRemaining:
        blog.image_regenerations_limit - blog.image_regenerations_used - 1,
    });
  } catch (error: unknown) {
    const message =
      error instanceof Error ? error.message : "Internal server error";
    return Response.json({ error: message }, { status: 500 });
  }
}
