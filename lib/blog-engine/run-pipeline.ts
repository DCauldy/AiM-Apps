import { createServiceRoleClient } from "@/lib/supabase/server";
import { publishToWordPress } from "@/lib/blog-engine/cms/wordpress";
import { publishToWebhook } from "@/lib/blog-engine/cms/webhook";
import type { BofuCmsConnection } from "@/types/blog-engine";
import {
  getResearchModel,
  getScoringModel,
  getWritingModel,
} from "@/lib/openrouter";
import {
  getResearchPrompt,
  getScoringPrompt,
  getWritingPrompt,
  getMetadataPrompt,
  getImagePrompt,
} from "@/lib/blog-engine/prompts";
import { incrementBofuUsage } from "@/lib/blog-engine/usage";
import { generateAndUploadImage } from "@/lib/blog-engine/image-generation";
import { generateText } from "ai";
import type { BofuProfile, BofuTopic, ImageStyle } from "@/types/blog-engine";

interface PipelineInput {
  userId: string;
  triggeredBy: "schedule" | "manual" | "first_run";
  topicId?: string;
  runId?: string; // Inngest event ID or generated ID
}

/**
 * Core blog pipeline logic, usable both from Inngest steps and direct execution.
 * Each step is an async function — in Inngest mode they're wrapped with step.run(),
 * in direct mode they're called sequentially.
 */
export async function runBlogPipeline({ userId, triggeredBy, topicId: requestedTopicId, runId }: PipelineInput) {
  const supabase = createServiceRoleClient();

  // Step 1: Load user profile
  console.log("[Pipeline] Step 1: Loading profile…");
  const { data: profileData, error: profileError } = await supabase
    .from("user_profiles")
    .select("*")
    .eq("user_id", userId)
    .single();

  if (profileError || !profileData) {
    throw new Error(`Profile not found for user ${userId}`);
  }
  const profile = profileData as BofuProfile;

  // Step 2: Check topic bank for unused topics
  console.log("[Pipeline] Step 2: Checking topic bank…");
  let topics: BofuTopic[] = [];

  if (requestedTopicId) {
    const { data } = await supabase
      .from("bofu_topics")
      .select("*")
      .eq("id", requestedTopicId)
      .eq("user_id", userId)
      .eq("status", "unused")
      .single();
    topics = data ? [data as BofuTopic] : [];
  } else {
    const { data } = await supabase
      .from("bofu_topics")
      .select("*")
      .eq("user_id", userId)
      .eq("status", "unused")
      .order("user_priority", { ascending: true, nullsFirst: false })
      .order("bofu_score", { ascending: false })
      .limit(5);
    topics = (data || []) as BofuTopic[];
  }

  // Step 3: Discover new topics (if needed)
  if (topics.length === 0) {
    console.log("[Pipeline] Step 3: Discovering topics…");
    const { data: run } = await supabase
      .from("bofu_discovery_runs")
      .insert({
        user_id: userId,
        status: "researching",
        started_at: new Date().toISOString(),
      })
      .select()
      .single();

    const discoveryRunId = run?.id;

    const researchPrompt = getResearchPrompt(profile);
    const { text: researchResult } = await generateText({
      model: getResearchModel(),
      prompt: researchPrompt,
      temperature: 0.7,
    });

    let rawTopics: Array<{
      title: string;
      description: string;
      inquiry_type: string;
      search_queries: string[];
      source: string;
    }> = [];

    try {
      const jsonMatch = researchResult.match(/\[[\s\S]*\]/);
      if (jsonMatch) {
        rawTopics = JSON.parse(jsonMatch[0]);
      }
    } catch {
      console.error("[Pipeline] Failed to parse research results");
    }

    if (discoveryRunId) {
      await supabase
        .from("bofu_discovery_runs")
        .update({
          status: rawTopics.length > 0 ? "scoring" : "failed",
          queries_generated: rawTopics.length,
          research_summary: { raw_count: rawTopics.length },
        })
        .eq("id", discoveryRunId);
    }

    // Step 4: Score topics
    if (rawTopics.length === 0) {
      throw new Error("No topics discovered — cannot proceed");
    }

    console.log("[Pipeline] Step 4: Scoring topics…");
    const scoringPrompt = getScoringPrompt(profile);
    const { text: scoringResult } = await generateText({
      model: getScoringModel(),
      messages: [
        { role: "system", content: scoringPrompt },
        {
          role: "user",
          content: `Score these topics:\n\n${JSON.stringify(rawTopics, null, 2)}`,
        },
      ],
      temperature: 0.3,
    });

    let scoredTopics: Array<{
      title: string;
      description: string;
      inquiry_type: string;
      search_queries: string[];
      bofu_score: number;
      scoring_breakdown: Record<string, number>;
      rank: number;
    }> = [];

    try {
      const jsonMatch = scoringResult.match(/\[[\s\S]*\]/);
      if (jsonMatch) {
        scoredTopics = JSON.parse(jsonMatch[0]);
      }
    } catch {
      console.error("[Pipeline] Failed to parse scoring results");
    }

    const topicsToSave: BofuTopic[] = [];

    for (const topic of scoredTopics) {
      const { data: similar } = await supabase
        .from("bofu_topics")
        .select("id, title")
        .eq("user_id", userId)
        .ilike("title", `%${topic.title.split(" ").slice(0, 3).join("%")}%`)
        .limit(1);

      if (similar && similar.length > 0) continue;

      const { data: savedTopic } = await supabase
        .from("bofu_topics")
        .insert({
          user_id: userId,
          discovery_run_id: discoveryRunId,
          title: topic.title,
          description: topic.description,
          search_queries: topic.search_queries || [],
          inquiry_type: topic.inquiry_type,
          bofu_score: topic.bofu_score,
          scoring_breakdown: topic.scoring_breakdown,
          rank: topic.rank,
          status: "unused",
        })
        .select()
        .single();

      if (savedTopic) topicsToSave.push(savedTopic as BofuTopic);
    }

    if (discoveryRunId) {
      await supabase
        .from("bofu_discovery_runs")
        .update({
          status: "completed",
          topics_scored: scoredTopics.length,
          topics_selected: topicsToSave.length,
          completed_at: new Date().toISOString(),
        })
        .eq("id", discoveryRunId);
    }

    topics = topicsToSave;
  }

  // Step 5: Select best topic
  console.log("[Pipeline] Step 5: Selecting topic…");
  if (topics.length === 0) {
    throw new Error("No available topics to write about");
  }

  const selectedTopic = topics[0];
  let placeholderBlogId: string | null = null;

  await supabase
    .from("bofu_topics")
    .update({ status: "writing" })
    .eq("id", selectedTopic.id);

  try {

  // Step 5b: Create placeholder blog
  console.log("[Pipeline] Step 5b: Creating placeholder blog…");
  const { data: placeholderData, error: placeholderError } = await supabase
    .from("bofu_blogs")
    .insert({
      user_id: userId,
      topic_id: selectedTopic.id,
      title: selectedTopic.title,
      slug: selectedTopic.title
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, "-")
        .replace(/^-|-$/g, ""),
      content_html: "",
      publish_status: "generating",
      pipeline_run_id: runId || null,
      wp_categories: [],
      wp_tags: [],
      internal_links: [],
      external_citations: [],
    })
    .select("id")
    .single();

  if (placeholderError || !placeholderData) {
    throw new Error(`Failed to create placeholder blog: ${placeholderError?.message}`);
  }
  placeholderBlogId = placeholderData.id;

  // Step 6: Write blog
  console.log("[Pipeline] Step 6: Writing blog…");
  const writingPrompt = getWritingPrompt(profile);
  const { text: blogResult } = await generateText({
    model: getWritingModel(),
    messages: [
      { role: "system", content: writingPrompt },
      {
        role: "user",
        content: `Write a blog post about: "${selectedTopic.title}"\n\nDescription: ${selectedTopic.description || ""}\nInquiry type: ${selectedTopic.inquiry_type || "process"}\nRelated search queries: ${(selectedTopic.search_queries || []).join(", ")}`,
      },
    ],
    temperature: 0.7,
    maxOutputTokens: 8000,
  });

  let blogContent: Record<string, unknown>;
  try {
    const jsonMatch = blogResult.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      blogContent = JSON.parse(jsonMatch[0]);
    } else {
      throw new Error("no match");
    }
  } catch {
    console.error("[Pipeline] Failed to parse blog content JSON, using raw text");
    blogContent = {
      title: selectedTopic.title,
      slug: selectedTopic.title
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, "-")
        .replace(/^-|-$/g, ""),
      content_html: `<article>${blogResult}</article>`,
      excerpt: blogResult.slice(0, 200),
      answer_capsule: "",
    };
  }

  // Step 7: Generate metadata
  console.log("[Pipeline] Step 7: Generating metadata…");
  let metadata: Record<string, unknown> = {};
  try {
    const metadataPrompt = getMetadataPrompt(profile);
    const { text: metadataResult } = await generateText({
      model: getScoringModel(),
      messages: [
        { role: "system", content: metadataPrompt },
        {
          role: "user",
          content: `Generate metadata for this blog:\n\nTitle: ${blogContent.title}\nExcerpt: ${blogContent.excerpt}\nContent preview: ${(blogContent.content_html as string)?.slice(0, 2000) || ""}`,
        },
      ],
      temperature: 0.3,
    });

    const jsonMatch = metadataResult.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      metadata = JSON.parse(jsonMatch[0]);
    }
  } catch {
    console.error("[Pipeline] Failed to generate/parse metadata");
  }

  // Step 8: Generate featured image
  console.log("[Pipeline] Step 8: Generating featured image…");
  const imageStyle: ImageStyle =
    selectedTopic.inquiry_type === "property" ? "location" : "branded";
  const imagePromptText = getImagePrompt(profile, blogContent.title as string, imageStyle, blogContent.excerpt as string | undefined);
  let featuredImageUrl: string | null = null;
  try {
    featuredImageUrl = await generateAndUploadImage({
      userId,
      blogId: placeholderBlogId!,
      prompt: imagePromptText,
    });
    console.log("[Pipeline] Image generated:", featuredImageUrl);
  } catch (imgError) {
    console.error("[Pipeline] Image generation failed (non-fatal):", imgError);
  }
  const imageResult = {
    featured_image_url: featuredImageUrl,
    featured_image_alt: `Featured image for ${blogContent.title}`,
    featured_image_style: imageStyle,
  };

  // Step 9: Save blog to database
  console.log("[Pipeline] Step 9: Saving blog…");
  const { data: savedBlog, error: saveError } = await supabase
    .from("bofu_blogs")
    .update({
      title: blogContent.title,
      slug: blogContent.slug,
      content_html: blogContent.content_html,
      content_markdown: (blogContent.content_markdown as string) || null,
      excerpt: blogContent.excerpt,
      answer_capsule: (blogContent.answer_capsule as string) || null,
      meta_title: (metadata.og_title as string) || (blogContent.meta_title as string) || null,
      meta_description: (metadata.og_description as string) || (blogContent.meta_description as string) || null,
      og_title: (metadata.og_title as string) || null,
      og_description: (metadata.og_description as string) || null,
      schema_article: metadata.schema_article || null,
      schema_faq: metadata.schema_faq || null,
      schema_local_business: metadata.schema_local_business || null,
      schema_breadcrumb: metadata.schema_breadcrumb || null,
      featured_image_url: imageResult.featured_image_url,
      featured_image_alt: imageResult.featured_image_alt,
      featured_image_style: imageResult.featured_image_style,
      wp_categories: (blogContent.wp_categories as string[]) || [],
      wp_tags: (blogContent.wp_tags as string[]) || [],
      seo_plugin_fields: metadata.seo_plugin_fields || null,
      internal_links: (blogContent.internal_links as unknown[]) || [],
      external_citations: (blogContent.external_citations as unknown[]) || [],

      publish_status: "draft",
    })
    .eq("id", placeholderBlogId)
    .select()
    .single();

  if (saveError || !savedBlog) {
    throw new Error(`Failed to save blog: ${saveError?.message}`);
  }

  // Create initial version
  await supabase.from("bofu_blog_versions").insert({
    blog_id: savedBlog.id,
    version_number: 1,
    content_html: blogContent.content_html,
    content_markdown: (blogContent.content_markdown as string) || null,
    change_description: "Initial generation",
  });

  // Mark topic as written
  const expiresAt = new Date();
  expiresAt.setDate(expiresAt.getDate() + 90);

  await supabase
    .from("bofu_topics")
    .update({
      status: "written",
      written_at: new Date().toISOString(),
      expires_at: expiresAt.toISOString(),
    })
    .eq("id", selectedTopic.id);

  // Increment usage
  await incrementBofuUsage(userId);

  // Step 10: Publish to CMS (if configured)
  console.log("[Pipeline] Step 10: Publishing to CMS…");
  const { data: connection } = await supabase
    .from("bofu_cms_connections")
    .select("*")
    .eq("user_id", userId)
    .eq("is_active", true)
    .maybeSingle();

  if (connection) {
    const typedConnection = connection as BofuCmsConnection;

    // Re-fetch the full saved blog for the CMS connector
    const { data: fullBlog } = await supabase
      .from("bofu_blogs")
      .select("*")
      .eq("id", savedBlog.id)
      .single();

    if (fullBlog) {
      let result: { success: boolean; postId?: string; postUrl?: string; error?: string };

      switch (typedConnection.platform) {
        case "wordpress":
          result = await publishToWordPress(fullBlog, typedConnection);
          break;
        case "webhook":
          result = await publishToWebhook(fullBlog, typedConnection);
          break;
        default:
          result = { success: false, error: `Unknown platform: ${typedConnection.platform}` };
      }

      if (result.success) {
        console.log(`[Pipeline] Published to ${typedConnection.platform}: ${result.postUrl}`);
        await supabase
          .from("bofu_blogs")
          .update({
            publish_status: "published",
            cms_connection_id: typedConnection.id,
            cms_post_id: result.postId || null,
            cms_post_url: result.postUrl || null,
            published_at: new Date().toISOString(),
          })
          .eq("id", savedBlog.id);

        await supabase
          .from("bofu_cms_connections")
          .update({ last_publish_at: new Date().toISOString(), last_error: null })
          .eq("id", typedConnection.id);
      } else {
        console.error(`[Pipeline] CMS publish failed: ${result.error}`);
        await supabase
          .from("bofu_blogs")
          .update({ cms_connection_id: typedConnection.id })
          .eq("id", savedBlog.id);

        await supabase
          .from("bofu_cms_connections")
          .update({ last_error: result.error })
          .eq("id", typedConnection.id);
      }
    }
  } else {
    console.log("[Pipeline] No active CMS connection — blog stays as draft");
  }

  // Step 11: Notify
  console.log(`[Pipeline] Done! Blog generated: "${savedBlog.title}"`);

  return {
    success: true,
    blogId: savedBlog.id,
    topicId: selectedTopic.id,
    title: savedBlog.title,
    triggeredBy,
  };

  } catch (pipelineError) {
    // Reset topic back to "unused" so it can be retried
    console.error("[Pipeline] Cleaning up after failure…");
    await supabase
      .from("bofu_topics")
      .update({ status: "unused" })
      .eq("id", selectedTopic.id);

    // Mark placeholder blog as failed if it was created
    if (placeholderBlogId) {
      await supabase
        .from("bofu_blogs")
        .update({ publish_status: "failed" })
        .eq("id", placeholderBlogId);
    }

    throw pipelineError;
  }
}
