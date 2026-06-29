/**
 * One-time script to categorize existing public prompts with topics
 * Run this with: npx tsx scripts/categorize-existing-prompts.ts
 * 
 * Note: This requires environment variables to be set (OPENAI_API_KEY, SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY)
 */

import { createClient } from '@supabase/supabase-js';
import OpenAI from 'openai';

// Get environment variables
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const openaiApiKey = process.env.OPENAI_API_KEY;

if (!supabaseUrl || !supabaseServiceKey) {
  console.error('Error: SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be set');
  process.exit(1);
}

if (!openaiApiKey) {
  console.error('Error: OPENAI_API_KEY must be set');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseServiceKey);
const openai = new OpenAI({ apiKey: openaiApiKey });

const validTopics = ["marketing", "development", "content", "research", "business", "education", "creative", "analysis", "productivity", "other"];

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

    const completion = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [
        {
          role: "system",
          content: `You are a helpful assistant that categorizes AI prompts into topics.

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

Return your response as JSON with only a "topic" field. The topic must be exactly one of the categories listed above (lowercase).`,
        },
        {
          role: "user",
          content: `Categorize this prompt into one of the available topics:\n\n${promptText}`,
        },
      ],
      response_format: { type: "json_object" },
      temperature: 0.7,
    });

    const result = JSON.parse(completion.choices[0].message.content || "{}");
    let topic = (result.topic || "other").toLowerCase();
    
    if (!validTopics.includes(topic)) {
      topic = "other";
    }

    return topic;
  } catch (error: any) {
    console.error("Error categorizing prompt:", error);
    return "other";
  }
}

async function main() {
  console.log("Fetching public prompts without topics...");

  // Get all public assistant messages that don't have a topic
  const { data: messages, error } = await supabase
    .from("messages")
    .select("id, content, title, topic")
    .eq("is_public", true)
    .eq("role", "assistant")
    .is("topic", null);

  if (error) {
    console.error("Error fetching messages:", error);
    process.exit(1);
  }

  if (!messages || messages.length === 0) {
    console.log("No prompts found without topics.");
    return;
  }

  console.log(`Found ${messages.length} prompt(s) to categorize.\n`);

  for (let i = 0; i < messages.length; i++) {
    const message = messages[i];
    console.log(`[${i + 1}/${messages.length}] Processing prompt: ${message.title || message.id}`);
    
    const topic = await categorizePrompt(message.content);
    console.log(`  → Categorized as: ${topic}`);

    const { error: updateError } = await supabase
      .from("messages")
      .update({ topic })
      .eq("id", message.id);

    if (updateError) {
      console.error(`  ✗ Error updating prompt ${message.id}:`, updateError);
    } else {
      console.log(`  ✓ Successfully updated prompt ${message.id}\n`);
    }

    // Small delay to avoid rate limiting
    await new Promise(resolve => setTimeout(resolve, 500));
  }

  console.log("\n✓ Completed categorizing all prompts!");
}

main().catch(console.error);




