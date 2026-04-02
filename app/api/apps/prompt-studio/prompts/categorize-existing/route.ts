import { createClient, createServiceRoleClient } from "@/lib/supabase/server";
import { generateObject } from 'ai';
import { model } from '@/lib/openai';
import { z } from 'zod';
import { NextRequest } from "next/server";

const validTopics = ["marketing", "development", "content", "research", "business", "education", "creative", "analysis", "productivity", "other"];

const topicSchema = z.object({
  topic: z.string(),
});

async function categorizePrompt(content: string): Promise<string> {
  try {
    // Extract the actual prompt from code blocks if present
    const codeBlockRegex = /```[\s\S]*?```/g;
    const codeMatches = content.match(codeBlockRegex);
    let promptText = content;
    
    if (codeMatches && codeMatches.length > 0) {
      // Use the first code block content as the prompt
      promptText = codeMatches[0].replace(/```[\w]*\n?/g, '').trim();
    }

    const { object } = await generateObject({
      model,
      schema: topicSchema,
      prompt: `You are a helpful assistant that categorizes AI prompts into topics.

Available topic categories:
- "marketing" - For marketing, advertising, social media, branding, campaigns
- "development" - For coding, software development, technical solutions, programming
- "content" - For writing, content creation, copywriting, blog posts, articles
- "research" - For research, analysis, data gathering, information synthesis
- "business" - For business strategy, planning, operations, management
- "education" - For learning, teaching, tutorials, educational content
- "creative" - For creative writing, storytelling, ideation, brainstorming
- "analysis" - For data analysis, reporting, insights, evaluation
- "productivity" - For productivity, task management, workflow optimization
- "other" - For prompts that don't fit the above categories

Categorize this prompt into one of the available topics:

${promptText}`,
      temperature: 0.7,
    });

    let topic = (object.topic || "other").toLowerCase();
    
    if (!validTopics.includes(topic)) {
      topic = "other";
    }

    return topic;
  } catch (error: any) {
    console.error("Error categorizing prompt:", error);
    return "other";
  }
}

export async function POST(req: NextRequest) {
  try {
    // This is an admin endpoint that uses service role to categorize existing prompts
    // For security, we can add an admin key check, but for now using service role is sufficient
    const adminKey = req.headers.get("x-admin-key");
    const expectedAdminKey = process.env.ADMIN_KEY || "categorize-prompts-2024";
    
    if (adminKey !== expectedAdminKey) {
      return new Response(JSON.stringify({ error: "Unauthorized - Admin key required" }), {
        status: 401,
        headers: { "Content-Type": "application/json" },
      });
    }

    // Get service role client to access all public prompts
    const serviceClient = createServiceRoleClient();

    // Get all public assistant messages that don't have a topic (null or empty)
    const { data: messages, error: messagesError } = await serviceClient
      .from("messages")
      .select("id, content, title, topic")
      .eq("is_public", true)
      .eq("role", "assistant")
      .or("topic.is.null,topic.eq.,topic.neq.other");
    
    // Filter to only those without topics (in case the query above doesn't work perfectly)
    const messagesWithoutTopics = (messages || []).filter(
      (msg: any) => !msg.topic || msg.topic === "" || msg.topic === null
    );

    if (messagesError) {
      console.error("Error fetching messages:", messagesError);
      return new Response(
        JSON.stringify({ error: "Failed to fetch messages", details: messagesError.message }),
        {
          status: 500,
          headers: { "Content-Type": "application/json" },
        }
      );
    }

    if (!messagesWithoutTopics || messagesWithoutTopics.length === 0) {
      return new Response(
        JSON.stringify({ message: "No prompts found without topics.", categorized: 0 }),
        {
          headers: { "Content-Type": "application/json" },
        }
      );
    }

    console.log(`Found ${messagesWithoutTopics.length} prompt(s) to categorize.`);

    const results = [];
    let successCount = 0;
    let errorCount = 0;

    for (const message of messagesWithoutTopics) {
      try {
        console.log(`Processing prompt: ${message.title || message.id}`);
        
        const topic = await categorizePrompt(message.content);
        console.log(`  → Categorized as: ${topic}`);

        const { error: updateError } = await serviceClient
          .from("messages")
          .update({ topic })
          .eq("id", message.id);

        if (updateError) {
          console.error(`  ✗ Error updating prompt ${message.id}:`, updateError);
          errorCount++;
          results.push({
            messageId: message.id,
            title: message.title,
            topic: null,
            error: updateError.message,
          });
        } else {
          console.log(`  ✓ Successfully updated prompt ${message.id}`);
          successCount++;
          results.push({
            messageId: message.id,
            title: message.title,
            topic: topic,
            success: true,
          });
        }

        // Small delay to avoid rate limiting
        await new Promise(resolve => setTimeout(resolve, 500));
      } catch (error: any) {
        console.error(`Error processing message ${message.id}:`, error);
        errorCount++;
        results.push({
          messageId: message.id,
          title: message.title,
          topic: null,
          error: error.message || "Unknown error",
        });
      }
    }

    return new Response(
      JSON.stringify({
        message: `Categorized ${successCount} prompt(s) successfully. ${errorCount} error(s).`,
        total: messages.length,
        successful: successCount,
        errors: errorCount,
        results,
      }),
      {
        headers: { "Content-Type": "application/json" },
      }
    );
  } catch (error: any) {
    console.error("Categorize existing prompts error:", error);
    return new Response(
      JSON.stringify({ error: error.message || "Internal server error" }),
      {
        status: 500,
        headers: { "Content-Type": "application/json" },
      }
    );
  }
}
