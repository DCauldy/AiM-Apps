import { createClient, createServiceRoleClient } from "@/lib/supabase/server";
import { PROMPT_REFINEMENT_SYSTEM_PROMPT } from "@/lib/prompts";
import { getTrialStatus, incrementTrialUsage } from "@/lib/trial";
import { streamText } from "ai";
import { model } from "@/lib/openai";
import { NextRequest } from "next/server";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function POST(req: NextRequest) {
  try {
    const supabase = await createClient();
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

    const { lazyPrompt, answers, threadId, context, promptType = "standard" } = await req.json();

    if (!lazyPrompt || !threadId) {
      return new Response(
        JSON.stringify({ error: "lazyPrompt and threadId are required" }),
        { status: 400, headers: { "Content-Type": "application/json" } }
      );
    }

    // Verify thread belongs to user
    const { data: thread, error: threadError } = await supabase
      .from("threads")
      .select("id")
      .eq("id", threadId)
      .eq("user_id", user.id)
      .single();

    if (threadError || !thread) {
      return new Response(JSON.stringify({ error: "Thread not found" }), {
        status: 404,
        headers: { "Content-Type": "application/json" },
      });
    }

    // Monthly usage gate — applies to all subscribers
    const trialStatus = await getTrialStatus(user.id);
    if (trialStatus.remaining <= 0) {
      return new Response(
        JSON.stringify({
          error: "trial_limit_reached",
          usage: trialStatus.usage,
          limit: trialStatus.limit,
          resetDate: trialStatus.resetDate,
        }),
        { status: 429, headers: { "Content-Type": "application/json" } }
      );
    }

    // Build user message content
    const answersText =
      Array.isArray(answers) && answers.length > 0
        ? answers
            .map(
              (a: { questionId: string; question: string; answer: string }) =>
                `Q: ${a.question}\nA: ${a.answer}`
            )
            .join("\n\n")
        : "No specific answers provided.";

    const contextSection =
      context && context.trim()
        ? `\n\nAdditional context:\n${context.trim()}`
        : "";

    const typeSection = promptType && promptType !== "standard"
      ? `\n\nPrompt type: ${promptType}`
      : "";
    const userMessageContent = `Lazy prompt: ${lazyPrompt.trim()}${typeSection}\n\nAnswers to improvement questions:\n${answersText}${contextSection}`;

    // Save user message to DB
    const serviceClient = createServiceRoleClient();
    await serviceClient.from("messages").insert({
      thread_id: threadId,
      role: "user",
      content: userMessageContent,
    });

    // Create assistant message placeholder
    const { data: assistantMsg } = await serviceClient
      .from("messages")
      .insert({
        thread_id: threadId,
        role: "assistant",
        content: "",
      })
      .select()
      .single();

    const assistantMessageId = assistantMsg?.id || null;

    // Update thread timestamp
    await supabase
      .from("threads")
      .update({ updated_at: new Date().toISOString() })
      .eq("id", threadId);

    const result = streamText({
      model,
      messages: [
        { role: "system", content: PROMPT_REFINEMENT_SYSTEM_PROMPT },
        { role: "user", content: userMessageContent },
      ],
    });

    // Stream raw text to client, then save + increment after all chunks are sent
    // (keeping the stream open during post-stream work ensures the serverless
    // function isn't killed before the DB writes complete)
    const encoder = new TextEncoder();
    const readableStream = new ReadableStream({
      async start(controller) {
        let fullText = "";
        try {
          for await (const chunk of result.textStream) {
            fullText += chunk;
            controller.enqueue(encoder.encode(chunk));
          }

          // Save completed message text to DB
          if (fullText && assistantMessageId) {
            await serviceClient
              .from("messages")
              .update({ content: fullText })
              .eq("id", assistantMessageId);
          }

          // Increment monthly usage for all subscribers
          await incrementTrialUsage(user.id);
        } catch (err: any) {
          if (err.name !== "AbortError") controller.error(err);
        } finally {
          controller.close();
        }
      },
    });

    return new Response(readableStream, {
      headers: {
        "Content-Type": "text/plain; charset=utf-8",
        "Cache-Control": "no-cache, no-store, must-revalidate",
        "X-Accel-Buffering": "no",
        "X-Assistant-Message-Id": assistantMessageId || "",
        "X-Thread-Id": threadId,
      },
    });
  } catch (error: any) {
    console.error("refine-prompt error:", error);
    return new Response(
      JSON.stringify({ error: error.message || "Internal server error" }),
      { status: 500, headers: { "Content-Type": "application/json" } }
    );
  }
}
