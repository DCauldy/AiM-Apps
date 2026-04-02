import { createClient, createServiceRoleClient } from "@/lib/supabase/server";
import { NextRequest } from "next/server";
import OpenAI from "openai";

// NOTE: We use the OpenAI client directly for audio transcription because
// the Vercel AI SDK doesn't support audio transcription yet.
// Once AI SDK adds audio support, we should migrate this to use AI SDK.

export async function POST(req: NextRequest) {
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
        .upsert(
          {
            id: user.id,
            email: user.email,
            full_name: user.user_metadata?.full_name || null,
          },
          {
            onConflict: "id",
          }
        );

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

    // Get the audio file from FormData
    const formData = await req.formData();
    const audioFile = formData.get("audio") as File;

    if (!audioFile) {
      return new Response(
        JSON.stringify({ error: "Audio file is required" }),
        {
          status: 400,
          headers: { "Content-Type": "application/json" },
        }
      );
    }

    // Create OpenAI client and transcribe
    // NOTE: Using OpenAI client directly because AI SDK doesn't support audio transcription
    try {
      const apiKey = process.env.OPENAI_API_KEY;
      if (!apiKey) {
        throw new Error("OPENAI_API_KEY is not set");
      }
      const openai = new OpenAI({ apiKey });

      // OpenAI SDK accepts File objects from FormData directly
      const transcription = await openai.audio.transcriptions.create({
        file: audioFile,
        model: "whisper-1",
        language: "en", // Optional: specify language for better accuracy
      });

      return new Response(
        JSON.stringify({ text: transcription.text }),
        {
          status: 200,
          headers: { "Content-Type": "application/json" },
        }
      );
    } catch (openaiError: any) {
      console.error("OpenAI transcription error:", openaiError);
      const errorMessage =
        openaiError?.message ||
        openaiError?.error?.message ||
        "Transcription failed";
      return new Response(
        JSON.stringify({
          error: errorMessage,
          details:
            openaiError?.error?.code || openaiError?.code || "Unknown error",
        }),
        {
          status: 500,
          headers: { "Content-Type": "application/json" },
        }
      );
    }
  } catch (error: any) {
    console.error("Transcription API error:", error);
    return new Response(
      JSON.stringify({ error: error.message || "Internal server error" }),
      {
        status: 500,
        headers: { "Content-Type": "application/json" },
      }
    );
  }
}

