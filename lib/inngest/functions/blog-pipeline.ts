import { inngest } from "@/lib/inngest/client";
import { createServiceRoleClient } from "@/lib/supabase/server";
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
import {
  reserveBlogSlot,
  refundBlogSlot,
  type BlogSlotReservation,
} from "@/lib/blog-engine/usage";
import { checkTopicDuplicate } from "@/lib/blog-engine/dedup";
import { generateAndUploadImage } from "@/lib/blog-engine/image-generation";
import { publishToWordPress } from "@/lib/blog-engine/cms/wordpress";
import { publishToWebhook } from "@/lib/blog-engine/cms/webhook";
import { getProfileForBlogEngine } from "@/lib/profiles/effective-profile";
import { generateText } from "ai";
import type { BofuTopic, BofuCmsConnection, ImageStyle } from "@/types/blog-engine";

// ---------------------------------------------------------------------------
// Event type
// ---------------------------------------------------------------------------

type BlogRunEvent = {
  name: "blog-engine/run.requested";
  data: {
    userId: string;
    triggeredBy: "schedule" | "manual" | "first_run";
    topicId?: string; // optional: write a specific topic
    /** True when /api/apps/blog-engine/runs already reserved the slot for
     *  this run. Cron-triggered runs don't pre-reserve and need the
     *  function to do it. */
    slotPreReserved?: boolean;
    /** Which bucket the pre-reserved slot came from (weekly quota vs
     *  bonus). Used by the catch path to refund the right one. */
    usedBonus?: boolean;
  };
};

// ---------------------------------------------------------------------------
// Blog Pipeline — Inngest function
// ---------------------------------------------------------------------------

export const blogPipeline = inngest.createFunction(
  {
    id: "blog-pipeline",
    name: "Blog Engine Pipeline",
    retries: 2,
    concurrency: [{ limit: 5 }],
    triggers: [{ event: "blog-engine/run.requested" }],
  },
  async ({ event, step }: { event: { data: BlogRunEvent["data"]; id?: string }; step: any }) => {
    const {
      userId,
      triggeredBy,
      topicId: requestedTopicId,
      slotPreReserved,
      usedBonus: preReservedUsedBonus,
    } = event.data;
    const supabase = createServiceRoleClient();

    // -----------------------------------------------------------------------
    // Step 0: Reserve a slot (skip if /runs route already did)
    //
    // Cron-triggered runs land here without a pre-reservation. Atomic
    // check-and-increment via the try_reserve_blog_slot RPC. If the cap
    // is hit we bail before doing any AI work.
    // -----------------------------------------------------------------------
    let usedBonus = !!preReservedUsedBonus;
    if (!slotPreReserved) {
      const reservation: BlogSlotReservation = await step.run(
        "reserve-slot",
        async () => reserveBlogSlot(userId),
      );
      if (!reservation.reserved) {
        console.log(
          `[blog-pipeline] cap reached for user ${userId} — skipping run (${reservation.blogs_generated}/${reservation.blogs_limit}, bonus=${reservation.bonus_blogs})`,
        );
        return { skipped: true, reason: "usage_limit_reached" };
      }
      usedBonus = !!reservation.used_bonus;
    }

    // From here, any thrown error must refund the slot. We wrap in a
    // try/finally — Inngest's own retry policy still applies but the
    // refund only fires when we exit the function for good (not on a
    // retry attempt). For simplicity we refund on the last try only by
    // checking the step.attempt counter at the catch site.
    try {

    // -----------------------------------------------------------------------
    // Step 1: Load effective profile (platform_profiles if active, else legacy)
    // -----------------------------------------------------------------------
    const profile = await step.run("load-profile", async () => {
      const data = await getProfileForBlogEngine(userId);
      if (!data) throw new Error(`Profile not found for user ${userId}`);
      return data;
    });

    // -----------------------------------------------------------------------
    // Step 2: Check topic bank for unused topics
    // -----------------------------------------------------------------------
    const existingTopics = await step.run("check-topic-bank", async () => {
      if (requestedTopicId) {
        // Specific topic requested — fetch it
        const { data } = await supabase
          .from("bofu_topics")
          .select("*")
          .eq("id", requestedTopicId)
          .eq("user_id", userId)
          .eq("status", "unused")
          .single();

        return data ? [data as BofuTopic] : [];
      }

      // Check for unused topics in the bank
      const { data } = await supabase
        .from("bofu_topics")
        .select("*")
        .eq("user_id", userId)
        .eq("status", "unused")
        .order("bofu_score", { ascending: false })
        .limit(5);

      return (data || []) as BofuTopic[];
    });

    // -----------------------------------------------------------------------
    // Step 3: Discover new topics (if needed)
    // -----------------------------------------------------------------------
    let topics = existingTopics;

    if (topics.length === 0) {
      const discoveredTopics = await step.run("discover-topics", async () => {
        // Create a discovery run record
        const { data: run } = await supabase
          .from("bofu_discovery_runs")
          .insert({
            user_id: userId,
            status: "researching",
            started_at: new Date().toISOString(),
          })
          .select()
          .single();

        const runId = run?.id;

        const researchPrompt = getResearchPrompt(profile);
        const { text: researchResult } = await generateText({
          model: getResearchModel(),
          prompt: researchPrompt,
          temperature: 0.7,
        });

        // Parse the JSON array from research results
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
          console.error("Failed to parse research results");
        }

        // Update discovery run
        if (runId) {
          await supabase
            .from("bofu_discovery_runs")
            .update({
              status: rawTopics.length > 0 ? "scoring" : "failed",
              queries_generated: rawTopics.length,
              research_summary: { raw_count: rawTopics.length },
            })
            .eq("id", runId);
        }

        return { rawTopics, runId };
      });

      // -----------------------------------------------------------------------
      // Step 4: Score topics
      // -----------------------------------------------------------------------
      topics = await step.run("score-topics", async () => {
        const { rawTopics, runId } = discoveredTopics;

        if (rawTopics.length === 0) {
          throw new Error("No topics discovered — cannot proceed");
        }

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
          console.error("Failed to parse scoring results");
        }

        // Deduplicate and save topics
        const topicsToSave: BofuTopic[] = [];

        for (const topic of scoredTopics) {
          const dedupResult = await checkTopicDuplicate(userId, topic.title);

          if (dedupResult.isDuplicate) {
            const best = dedupResult.matches[0];
            console.log(
              `[Blog Engine] Skipping duplicate: "${topic.title}" ≈ "${best.title}" (${best.matchType}, ${best.similarity.toFixed(3)})`
            );
            continue;
          }

          // Save topic with embedding for future dedup
          const { data: savedTopic } = await supabase
            .from("bofu_topics")
            .insert({
              user_id: userId,
              discovery_run_id: runId,
              title: topic.title,
              description: topic.description,
              search_queries: topic.search_queries || [],
              inquiry_type: topic.inquiry_type,
              bofu_score: topic.bofu_score,
              scoring_breakdown: topic.scoring_breakdown,
              rank: topic.rank,
              status: "unused",
              ...(dedupResult.embedding
                ? { embedding: `[${dedupResult.embedding.join(",")}]` }
                : {}),
            })
            .select()
            .single();

          if (savedTopic) {
            topicsToSave.push(savedTopic as BofuTopic);
          }
        }

        // Update discovery run
        if (runId) {
          await supabase
            .from("bofu_discovery_runs")
            .update({
              status: "completed",
              topics_scored: scoredTopics.length,
              topics_selected: topicsToSave.length,
              completed_at: new Date().toISOString(),
            })
            .eq("id", runId);
        }

        return topicsToSave;
      });
    }

    // -----------------------------------------------------------------------
    // Step 5: Select best topic
    // -----------------------------------------------------------------------
    const selectedTopic = await step.run("select-topic", async () => {
      if (topics.length === 0) {
        throw new Error("No available topics to write about");
      }

      // Pick the highest-scored unused topic
      const topic = topics[0];

      // Mark as writing
      await supabase
        .from("bofu_topics")
        .update({ status: "writing" })
        .eq("id", topic.id);

      return topic;
    });

    // -----------------------------------------------------------------------
    // Step 5b: Create placeholder blog (so the dashboard can detect generation)
    // -----------------------------------------------------------------------
    const placeholderBlog = await step.run("create-placeholder", async () => {
      const { data: blog, error } = await supabase
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
          pipeline_run_id: event.id || null,
          wp_categories: [],
          wp_tags: [],
          internal_links: [],
          external_citations: [],

        })
        .select("id")
        .single();

      if (error || !blog) {
        throw new Error(`Failed to create placeholder blog: ${error?.message}`);
      }
      return blog;
    });

    // -----------------------------------------------------------------------
    // Step 6: Write blog
    // -----------------------------------------------------------------------
    const blogContent = await step.run("write-blog", async () => {
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

      // Parse the JSON response
      try {
        const jsonMatch = blogResult.match(/\{[\s\S]*\}/);
        if (jsonMatch) {
          return JSON.parse(jsonMatch[0]);
        }
      } catch {
        console.error("Failed to parse blog content JSON");
      }

      // Fallback: use raw text as content
      return {
        title: selectedTopic.title,
        slug: selectedTopic.title
          .toLowerCase()
          .replace(/[^a-z0-9]+/g, "-")
          .replace(/^-|-$/g, ""),
        content_html: `<article>${blogResult}</article>`,
        excerpt: blogResult.slice(0, 200),
        answer_capsule: "",
      };
    });

    // -----------------------------------------------------------------------
    // Step 7: Generate metadata
    // -----------------------------------------------------------------------
    const metadata = await step.run("generate-metadata", async () => {
      const metadataPrompt = getMetadataPrompt(profile);
      const { text: metadataResult } = await generateText({
        model: getScoringModel(), // GPT-4o for metadata
        messages: [
          { role: "system", content: metadataPrompt },
          {
            role: "user",
            content: `Generate metadata for this blog:\n\nTitle: ${blogContent.title}\nExcerpt: ${blogContent.excerpt}\nContent preview: ${blogContent.content_html?.slice(0, 2000) || ""}`,
          },
        ],
        temperature: 0.3,
      });

      try {
        const jsonMatch = metadataResult.match(/\{[\s\S]*\}/);
        if (jsonMatch) {
          return JSON.parse(jsonMatch[0]);
        }
      } catch {
        console.error("Failed to parse metadata JSON");
      }

      return {};
    });

    // -----------------------------------------------------------------------
    // Step 8: Generate featured image
    // -----------------------------------------------------------------------
    const imageResult = await step.run("generate-image", async () => {
      const imageStyle: ImageStyle = "location";

      const prompt = getImagePrompt(profile, blogContent.title, imageStyle, blogContent.excerpt);

      let featuredImageUrl: string | null = null;
      try {
        featuredImageUrl = await generateAndUploadImage({
          userId,
          blogId: placeholderBlog.id,
          prompt,
        });
        console.log("[Blog Engine] Image generated:", featuredImageUrl);
      } catch (imgError) {
        console.error("[Blog Engine] Image generation failed (non-fatal):", imgError);
      }

      return {
        featured_image_url: featuredImageUrl,
        featured_image_alt: `Featured image for ${blogContent.title}`,
        featured_image_style: imageStyle,
      };
    });

    // -----------------------------------------------------------------------
    // Step 9: Save blog to database
    // -----------------------------------------------------------------------
    const savedBlog = await step.run("save-blog", async () => {
      const { data: blog, error } = await supabase
        .from("bofu_blogs")
        .update({
          title: blogContent.title,
          slug: blogContent.slug,
          content_html: blogContent.content_html,
          content_markdown: blogContent.content_markdown || null,
          excerpt: blogContent.excerpt,
          answer_capsule: blogContent.answer_capsule || null,
          meta_title: metadata.og_title || blogContent.meta_title || null,
          meta_description:
            metadata.og_description || blogContent.meta_description || null,
          og_title: metadata.og_title || null,
          og_description: metadata.og_description || null,
          schema_article: metadata.schema_article || null,
          schema_faq: metadata.schema_faq || null,
          schema_local_business: metadata.schema_local_business || null,
          schema_breadcrumb: metadata.schema_breadcrumb || null,
          featured_image_url: imageResult.featured_image_url,
          featured_image_alt: imageResult.featured_image_alt,
          featured_image_style: imageResult.featured_image_style,
          wp_categories: blogContent.wp_categories || [],
          wp_tags: blogContent.wp_tags || [],
          seo_plugin_fields: metadata.seo_plugin_fields || null,
          internal_links: blogContent.internal_links || [],
          external_citations: blogContent.external_citations || [],

          publish_status: "draft",
        })
        .eq("id", placeholderBlog.id)
        .select()
        .single();

      if (error || !blog) {
        throw new Error(`Failed to save blog: ${error?.message}`);
      }

      // Create initial version
      await supabase.from("bofu_blog_versions").insert({
        blog_id: blog.id,
        version_number: 1,
        content_html: blogContent.content_html,
        content_markdown: blogContent.content_markdown || null,
        change_description: "Initial generation",
      });

      // Mark topic as written with 90-day expiry
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

      // Slot was already reserved at function entry (see Step 0); nothing
      // to increment here. If anything below throws, the catch at the end
      // of the function refunds.
      return blog;
    });

    // -----------------------------------------------------------------------
    // Step 10: Publish to CMS (if configured)
    // -----------------------------------------------------------------------
    await step.run("publish-cms", async () => {
      const { data: connection } = await supabase
        .from("bofu_cms_connections")
        .select("*")
        .eq("user_id", userId)
        .eq("is_active", true)
        .maybeSingle();

      if (!connection) {
        return { published: false, reason: "no_cms_connection" };
      }

      const typedConnection = connection as BofuCmsConnection;

      // Re-fetch the full saved blog for the CMS connector
      const { data: fullBlog } = await supabase
        .from("bofu_blogs")
        .select("*")
        .eq("id", savedBlog.id)
        .single();

      if (!fullBlog) {
        return { published: false, reason: "blog_not_found" };
      }

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

        return { published: true, postUrl: result.postUrl };
      } else {
        await supabase
          .from("bofu_cms_connections")
          .update({ last_error: result.error })
          .eq("id", typedConnection.id);

        return { published: false, reason: result.error };
      }
    });

    // -----------------------------------------------------------------------
    // Step 11: Notify user
    // -----------------------------------------------------------------------
    await step.run("notify-user", async () => {
      // Notifications will be implemented in Phase 10
      // For now, just log
      console.log(
        `[Blog Engine] Blog generated for user ${userId}: "${savedBlog.title}"`
      );

      return { notified: true, blogId: savedBlog.id };
    });

    return {
      success: true,
      blogId: savedBlog.id,
      topicId: selectedTopic.id,
      title: savedBlog.title,
      triggeredBy,
    };
    } catch (err) {
      // Pipeline blew up after we reserved a slot. Refund so the user
      // doesn't lose this week's quota to a transient Claude/Perplexity
      // error. Then re-throw so Inngest marks the run failed + retries
      // per the function's retry policy.
      await refundBlogSlot(userId, usedBonus).catch(() => {});

      // Best-effort: tag the most recent in-progress blog row for this
      // user so the dashboard can surface what failed. If no blog row
      // exists yet (failure before save-blog step), there's nothing to
      // tag — the discovery_runs error is the source of truth instead.
      const message = err instanceof Error ? err.message : String(err);
      await supabase
        .from("bofu_blogs")
        .update({
          publish_status: "failed",
          pipeline_error: message.slice(0, 500),
          updated_at: new Date().toISOString(),
        })
        .eq("user_id", userId)
        .in("publish_status", ["draft", "scheduled"])
        .order("created_at", { ascending: false })
        .limit(1);

      throw err;
    }
  }
);
