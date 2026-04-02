import { NextRequest } from "next/server";
import { generateObject } from 'ai';
import { model } from '@/lib/openai';
import { z } from 'zod';

const metadataSchema = z.object({
  title: z.string(),
  description: z.string(),
  topic: z.string(),
});

const validTopics = ["marketing", "development", "content", "research", "business", "education", "creative", "analysis", "productivity", "other"];

export async function POST(req: NextRequest) {
  try {
    const { content } = await req.json();

    if (!content) {
      return new Response(JSON.stringify({ error: "Content is required" }), {
        status: 400,
        headers: { "Content-Type": "application/json" },
      });
    }

    // Extract the actual prompt from code blocks if present
    const codeBlockRegex = /```[\s\S]*?```/g;
    const codeMatches = content.match(codeBlockRegex);
    let promptText = content;
    
    if (codeMatches && codeMatches.length > 0) {
      // Use the first code block content as the prompt
      promptText = codeMatches[0].replace(/```[\w]*\n?/g, '').trim();
    }

    // Generate title, description, and topic using AI SDK
    const { object } = await generateObject({
      model,
      schema: metadataSchema,
      prompt: `You are a helpful assistant that generates concise, descriptive titles, descriptions, and topics for AI prompts. 
Given a prompt, generate:
1. A short, clear title (max 60 characters) that describes what the prompt does
2. A brief description (max 150 characters) that explains the prompt's purpose
3. A topic category that best fits the prompt

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

Generate a title, description, and topic for this prompt:

${promptText}`,
      temperature: 0.7,
    });

    // Validate and normalize topic
    let topic = (object.topic || "other").toLowerCase();
    if (!validTopics.includes(topic)) {
      topic = "other";
    }

    return new Response(
      JSON.stringify({
        title: object.title || "Untitled Prompt",
        description: object.description || "A useful AI prompt",
        topic: topic,
      }),
      {
        headers: { "Content-Type": "application/json" },
      }
    );
  } catch (error: any) {
    console.error("Generate metadata error:", error);
    return new Response(
      JSON.stringify({ error: error.message || "Internal server error" }),
      {
        status: 500,
        headers: { "Content-Type": "application/json" },
      }
    );
  }
}
