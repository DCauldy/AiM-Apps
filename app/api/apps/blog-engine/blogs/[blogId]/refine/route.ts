import { createClient, createServiceRoleClient } from "@/lib/supabase/server";
import { getRefinementModel } from "@/lib/openrouter";
import { getRefinementPrompt } from "@/lib/blog-engine/prompts";
import { streamText } from "ai";
import { NextRequest } from "next/server";
import type { BofuProfile } from "@/types/blog-engine";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/**
 * POST /api/apps/blog-engine/blogs/[blogId]/refine
 * Streaming refinement chat for a specific blog.
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

    // Verify blog ownership
    const { data: blog } = await supabase
      .from("bofu_blogs")
      .select("*")
      .eq("id", blogId)
      .eq("user_id", user.id)
      .single();

    if (!blog) {
      return Response.json({ error: "Blog not found" }, { status: 404 });
    }

    // Check refinement limit
    if (blog.refinements_used >= blog.refinements_limit) {
      return Response.json(
        {
          error: "refinement_limit_reached",
          used: blog.refinements_used,
          limit: blog.refinements_limit,
        },
        { status: 429 }
      );
    }

    const body = await req.json();
    const { messages } = body;

    if (!messages || !Array.isArray(messages) || messages.length === 0) {
      return Response.json({ error: "No messages provided" }, { status: 400 });
    }

    // Load profile for context
    const serviceClient = createServiceRoleClient();
    const { data: profile } = await serviceClient
      .from("user_profiles")
      .select("*")
      .eq("user_id", user.id)
      .single();

    if (!profile) {
      return Response.json({ error: "Profile not found" }, { status: 404 });
    }

    const typedProfile = profile as BofuProfile;

    // Extract text content from a message (supports both `content` string and `parts` array formats)
    function extractText(m: { content?: string; parts?: Array<{ type: string; text?: string }> }): string {
      if (typeof m.content === "string") return m.content;
      if (Array.isArray(m.parts)) {
        return m.parts
          .filter((p) => p.type === "text" && typeof p.text === "string")
          .map((p) => p.text)
          .join("");
      }
      return "";
    }

    // Save user message to chat history
    const lastUserMessage = messages[messages.length - 1];
    const userContent = extractText(lastUserMessage);

    if (userContent && lastUserMessage?.role === "user") {
      await serviceClient.from("bofu_blog_chats").insert({
        blog_id: blogId,
        role: "user",
        content: userContent,
      });
    }

    // Build system prompt with full blog context
    const refinementPrompt = getRefinementPrompt(typedProfile);
    const systemMessage = `${refinementPrompt}\n\n## Current Blog Content\n\nTitle: ${blog.title}\n\n${blog.content_html}`;

    const modelMessages = messages
      .map((m: { role: string; content?: string; parts?: Array<{ type: string; text?: string }> }) => ({
        role: m.role as "user" | "assistant",
        content: extractText(m),
      }))
      .filter((m) => m.content.length > 0);

    const result = streamText({
      model: getRefinementModel(),
      system: systemMessage,
      messages: modelMessages,
      temperature: 0.5,
      onFinish: async ({ text }) => {
        if (text) {
          // Save assistant message
          await serviceClient.from("bofu_blog_chats").insert({
            blog_id: blogId,
            role: "assistant",
            content: text,
          });

          // Try to extract updated blog content from the response
          try {
            const jsonMatch = text.match(/\{[\s\S]*"content_html"[\s\S]*\}/);
            if (jsonMatch) {
              const updatedBlog = JSON.parse(jsonMatch[0]);

              // Save new version
              await serviceClient.from("bofu_blog_versions").insert({
                blog_id: blogId,
                version_number: blog.refinements_used + 2, // +1 for initial, +1 for this
                content_html: updatedBlog.content_html,
                content_markdown: updatedBlog.content_markdown || null,
                change_description: userContent,
              });

              // Update blog content
              await serviceClient
                .from("bofu_blogs")
                .update({
                  content_html: updatedBlog.content_html,
                  content_markdown:
                    updatedBlog.content_markdown || blog.content_markdown,
                  title: updatedBlog.title || blog.title,
                  excerpt: updatedBlog.excerpt || blog.excerpt,
                  answer_capsule:
                    updatedBlog.answer_capsule || blog.answer_capsule,
                  refinements_used: blog.refinements_used + 1,
                  updated_at: new Date().toISOString(),
                })
                .eq("id", blogId);
            } else {
              // No JSON — just increment the counter
              await serviceClient
                .from("bofu_blogs")
                .update({
                  refinements_used: blog.refinements_used + 1,
                  updated_at: new Date().toISOString(),
                })
                .eq("id", blogId);
            }
          } catch {
            // Update refinement count even if parsing fails
            await serviceClient
              .from("bofu_blogs")
              .update({
                refinements_used: blog.refinements_used + 1,
                updated_at: new Date().toISOString(),
              })
              .eq("id", blogId);
          }
        }
      },
    });

    return result.toTextStreamResponse({
      headers: {
        "Cache-Control": "no-cache, no-store, must-revalidate, max-age=0",
        "X-Accel-Buffering": "no",
      },
    });
  } catch (error: unknown) {
    console.error("Refinement API error:", error);
    const message =
      error instanceof Error ? error.message : "Internal server error";
    return Response.json({ error: message }, { status: 500 });
  }
}
