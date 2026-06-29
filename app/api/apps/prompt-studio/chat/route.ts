import { createClient, createServiceRoleClient } from "@/lib/supabase/server";
import { getSystemPrompt } from "@/lib/prompts";
import { getTrialStatus, incrementTrialUsage } from "@/lib/trial";
import { streamText, convertToModelMessages, generateText } from 'ai';
import { openai } from '@ai-sdk/openai';
import { getModel, model } from "@/lib/openai";
import { NextRequest } from "next/server";
import type { PromptType } from "@/types";

// Force dynamic rendering to prevent caching of streaming responses
export const dynamic = 'force-dynamic';
export const runtime = 'nodejs'; // Use Node.js runtime for streaming

export async function POST(req: NextRequest) {
  // CRITICAL: Log all incoming requests to debug duplicate thread creation
  const requestUrl = new URL(req.url);
  console.log('[API] 📥 Incoming chat request:', {
    url: req.url,
    pathname: requestUrl.pathname,
    searchParams: Object.fromEntries(requestUrl.searchParams.entries()),
    timestamp: new Date().toISOString(),
  });
  
  try {
    const supabase = await createClient();

    // Verify authentication
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();

    if (authError || !user) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { "Content-Type": "application/json" },
      });
    }

    // Ensure profile exists (safeguard in case trigger didn't fire)
    const serviceClient = createServiceRoleClient();
    const { data: existingProfile } = await serviceClient
      .from("profiles")
      .select("id")
      .eq("id", user.id)
      .single();

    if (!existingProfile) {
      const { error: createProfileError } = await serviceClient
        .from("profiles")
        .upsert({
          id: user.id,
          email: user.email,
          full_name: user.user_metadata?.full_name || null,
        }, {
          onConflict: "id"
        });

      if (createProfileError) {
        console.error("Failed to create profile:", createProfileError);
        return new Response(
          JSON.stringify({ error: "Failed to initialize user profile" }),
          {
            status: 500,
            headers: { "Content-Type": "application/json" },
          }
        );
      }
    }

    // Monthly usage gate — applies to all subscribers
    const trialStatus = await getTrialStatus(user.id);
    if (trialStatus.effectiveRemaining <= 0) {
      return new Response(
        JSON.stringify({
          error: "trial_limit_reached",
          usage: trialStatus.usage,
          limit: trialStatus.limit,
          resetDate: trialStatus.resetDate,
          accountType: trialStatus.accountType,
        }),
        { status: 429, headers: { "Content-Type": "application/json" } }
      );
    }

    // BEST PRACTICE: Extract threadId from request body as primary source
    // The AI SDK's useChat merges body prop with {id, messages, trigger}
    // URL query params in POST requests from useChat are NOT reliably preserved
    // Fall back to URL params only if body doesn't have threadId
    const body = await req.json();
    const { messages: uiMessages, threadId: threadIdFromBody, promptType: promptTypeFromBody } = body;
    
    // Try URL params as fallback (may not work for POST requests from useChat)
    const threadIdFromUrl = req.nextUrl.searchParams.get('threadId') || undefined;
    const promptTypeFromUrl = req.nextUrl.searchParams.get('promptType') as PromptType | null;
    const isWaitingForThread = req.nextUrl.searchParams.get('_waiting_for_thread') === 'true';
    
    // CRITICAL: If request has waiting flag, reject it to prevent duplicate thread creation
    // This happens when useChat initializes before threadId is available
    if (isWaitingForThread && !threadIdFromBody && !threadIdFromUrl) {
      console.warn('[API] ⚠️ Rejecting request waiting for threadId to prevent duplicate thread creation');
      return new Response(
        JSON.stringify({ 
          error: "Thread ID not available yet. Please wait and try again.",
          code: "THREAD_ID_PENDING"
        }),
        {
          status: 400,
          headers: { "Content-Type": "application/json" },
        }
      );
    }
    
    // BEST PRACTICE: Use body prop as primary source of truth for threadId
    // The AI SDK's useChat merges body prop with {id, messages, trigger}
    // URL query params in POST requests from useChat are NOT reliably preserved
    // Fall back to URL params only if body doesn't have threadId
    const threadId = threadIdFromBody || threadIdFromUrl;
    const selectedPromptType: PromptType = promptTypeFromBody || promptTypeFromUrl || "standard";

    // Convert UI messages to model messages (AI SDK format)
    let modelMessages;
    try {
      if (!uiMessages || !Array.isArray(uiMessages) || uiMessages.length === 0) {
        return new Response(
          JSON.stringify({ error: "No messages provided" }),
          {
            status: 400,
            headers: { "Content-Type": "application/json" },
          }
        );
      }
      modelMessages = await convertToModelMessages(uiMessages);
    } catch (error: any) {
      console.error("Error converting messages:", error);
      console.error("UI Messages received:", JSON.stringify(uiMessages, null, 2));
      return new Response(
        JSON.stringify({ 
          error: "Invalid message format",
          details: error?.message || "Unknown error"
        }),
        {
          status: 400,
          headers: { "Content-Type": "application/json" },
        }
      );
    }
    
    // Extract the last user message for saving to database
    const lastUserMessage = uiMessages[uiMessages.length - 1];
    const userMessageContent = lastUserMessage?.parts?.find((p: any) => p.type === 'text')?.text || 
                               (typeof lastUserMessage?.content === 'string' ? lastUserMessage.content : '') ||
                               '';

    let currentThreadId = threadId;

    // CRITICAL: Log threadId extraction for debugging
    console.log('[API] ThreadId extraction (body prop as primary source):', {
      threadIdFromBody,
      threadIdFromUrl,
      finalThreadId: currentThreadId,
      hasThreadId: !!currentThreadId,
      url: req.url,
      nextUrl: req.nextUrl.toString(),
      searchParams: Object.fromEntries(req.nextUrl.searchParams.entries())
    });

    // CRITICAL: ThreadId is now required - threads must be created explicitly via /api/threads
    // This prevents duplicate thread creation when /api/chat is called without a threadId
    if (!currentThreadId) {
      console.error('[API] ❌ No threadId provided - threadId is required. Create thread via /api/threads first.', {
        hasMessages: !!uiMessages && uiMessages.length > 0,
        messageCount: uiMessages?.length || 0,
        isWaitingForThread,
        url: req.url,
        timestamp: new Date().toISOString()
      });
      return new Response(
        JSON.stringify({ 
          error: "Thread ID is required. Please create a thread first via /api/threads.",
          code: "THREAD_ID_REQUIRED"
        }),
        {
          status: 400,
          headers: { "Content-Type": "application/json" },
        }
      );
    } else {
      console.log('[API] ✅ Using existing threadId:', currentThreadId);
      // Verify thread belongs to user
      const { data: thread, error: threadError } = await supabase
        .from("threads")
        .select("id")
        .eq("id", currentThreadId)
        .eq("user_id", user.id)
        .single();

      if (threadError || !thread) {
        console.error('[API] ❌ Thread not found or access denied:', {
          threadId: currentThreadId,
          error: threadError?.message
        });
        return new Response(JSON.stringify({ error: "Thread not found" }), {
          status: 404,
          headers: { "Content-Type": "application/json" },
        });
      }
      console.log('[API] ✅ Thread verified:', currentThreadId);
    }

    // Save user message to database
    let userMessageId: string | null = null;
    if (lastUserMessage && lastUserMessage.role === "user" && userMessageContent) {
      const { data: insertedUserMessage, error: messageError } = await supabase
        .from("messages")
        .insert({
          thread_id: currentThreadId,
          role: "user",
          content: userMessageContent,
        })
        .select()
        .single();

      if (messageError) {
        console.error("Failed to save user message:", messageError);
        return new Response(
          JSON.stringify({ 
            error: "Failed to save message",
            details: messageError.message
          }),
          {
            status: 500,
            headers: { "Content-Type": "application/json" },
          }
        );
      }

      userMessageId = insertedUserMessage?.id || null;

      // Update thread timestamp
      await supabase
        .from("threads")
        .update({ updated_at: new Date().toISOString() })
        .eq("id", currentThreadId);
    }

    // Prepare messages for OpenAI (include system prompt based on prompt type)
    const systemPrompt = getSystemPrompt(selectedPromptType);
    const openaiMessages = [
      { role: "system" as const, content: systemPrompt },
      ...modelMessages,
    ];

    // Create assistant message record immediately when streaming starts
    let messageId: string | null = null;
    const { data: insertedMessage, error: insertError } = await supabase
      .from("messages")
      .insert({
        thread_id: currentThreadId,
        role: "assistant",
        content: "", // Empty initially, will be updated after streaming
      })
      .select()
      .single();

    if (insertError) {
      console.error("Failed to create assistant message:", insertError);
    } else {
      messageId = insertedMessage.id;
    }

    console.log("Using OpenAI model:", getModel());

    // Use Vercel AI SDK streamText
    const result = streamText({
      model,
      messages: openaiMessages,
      onFinish: async ({ text }) => {
        // Increment monthly usage for all subscribers
        await incrementTrialUsage(user.id);

        // Update assistant message with final content after streaming completes
        if (text && messageId) {
          const { error: updateError } = await supabase
            .from("messages")
            .update({ content: text })
            .eq("id", messageId);

          if (updateError) {
            console.error("Failed to update assistant message:", updateError);
          }

          // Generate smart title after first exchange
          try {
            const { data: threadMessages, count } = await supabase
              .from("messages")
              .select("role, content", { count: "exact" })
              .eq("thread_id", currentThreadId)
              .order("created_at", { ascending: true });

            if (count === 2 && threadMessages && threadMessages.length === 2) {
              const userMsg = threadMessages.find((m) => m.role === "user");
              const assistantMsg = threadMessages.find((m) => m.role === "assistant");

              if (userMsg && assistantMsg) {
                const { text: generatedTitle } = await generateText({
                  model,
                  prompt: `Generate a concise, descriptive title (max 60 characters) for this conversation. The title should capture the main topic or goal. Return ONLY the title, no quotes or extra text.

User: ${userMsg.content}

Assistant: ${assistantMsg.content}`,
                  temperature: 0.7,
                });

                const finalTitle = generatedTitle?.trim() || userMsg.content.slice(0, 50) + "...";

                await supabase
                  .from("threads")
                  .update({ title: finalTitle })
                  .eq("id", currentThreadId);
              }
            }
          } catch (titleError) {
            console.error("Error generating title:", titleError);
          }
        }
      },
    });

    // Return AI SDK text stream response (compatible with useChat)
    const response = result.toTextStreamResponse({
      headers: {
        "Cache-Control": "no-cache, no-store, must-revalidate, max-age=0",
        "X-Accel-Buffering": "no",
        "X-Assistant-Message-Id": messageId || "",
        "X-Thread-Id": currentThreadId || "",
      },
    });
    return response;
  } catch (error: any) {
    console.error("Chat API error:", error);
    return new Response(
      JSON.stringify({ error: error.message || "Internal server error" }),
      {
        status: 500,
        headers: { "Content-Type": "application/json" },
      }
    );
  }
}
