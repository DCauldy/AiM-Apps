import { createClient, createServiceRoleClient } from "@/lib/supabase/server";
import { NextRequest } from "next/server";

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
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

    const serviceClient = createServiceRoleClient();

    // Check user's account_type and prompt's access_tier
    const [profileRes, promptRes] = await Promise.all([
      serviceClient
        .from("profiles")
        .select("account_type")
        .eq("id", user.id)
        .single(),
      serviceClient
        .from("aim_prompts")
        .select("access_tier")
        .eq("id", id)
        .single(),
    ]);

    const accountType = profileRes.data?.account_type || "standalone";
    const accessTier = promptRes.data?.access_tier || "member";

    // Standalone users cannot save member-tier prompts
    if (accountType === "standalone" && accessTier === "member") {
      return new Response(
        JSON.stringify({ error: "Upgrade to AiM membership to save this prompt" }),
        { status: 403, headers: { "Content-Type": "application/json" } }
      );
    }

    // Check if already saved
    const { data: existing } = await supabase
      .from("aim_saved_prompts")
      .select("id")
      .eq("aim_prompt_id", id)
      .eq("user_id", user.id)
      .single();

    if (existing) {
      const { error: deleteError } = await supabase
        .from("aim_saved_prompts")
        .delete()
        .eq("aim_prompt_id", id)
        .eq("user_id", user.id);

      if (deleteError) throw deleteError;

      return new Response(JSON.stringify({ saved: false }), {
        headers: { "Content-Type": "application/json" },
      });
    } else {
      const { error: insertError } = await supabase
        .from("aim_saved_prompts")
        .insert({ aim_prompt_id: id, user_id: user.id });

      if (insertError) throw insertError;

      return new Response(JSON.stringify({ saved: true }), {
        headers: { "Content-Type": "application/json" },
      });
    }
  } catch (error: any) {
    console.error("AiM save POST error:", error);
    return new Response(
      JSON.stringify({ error: error.message || "Internal server error" }),
      { status: 500, headers: { "Content-Type": "application/json" } }
    );
  }
}
