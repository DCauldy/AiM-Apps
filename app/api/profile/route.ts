import { createClient } from "@/lib/supabase/server";
import { NextRequest } from "next/server";

export async function GET(req: NextRequest) {
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

    // Get profile from profiles table
    const { data: profile, error } = await supabase
      .from("profiles")
      .select("id, email, full_name, created_at, updated_at")
      .eq("id", user.id)
      .single();

    if (error) {
      throw error;
    }

    return new Response(JSON.stringify(profile), {
      headers: { "Content-Type": "application/json" },
    });
  } catch (error: any) {
    console.error("Profile GET error:", error);
    return new Response(
      JSON.stringify({ error: error.message || "Internal server error" }),
      {
        status: 500,
        headers: { "Content-Type": "application/json" },
      }
    );
  }
}

export async function PATCH(req: NextRequest) {
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

    const body = await req.json();
    const { full_name, email } = body;

    const updateData: any = {};
    if (full_name !== undefined) updateData.full_name = full_name;
    if (email !== undefined) updateData.email = email;
    updateData.updated_at = new Date().toISOString();

    const { data: updatedProfile, error } = await supabase
      .from("profiles")
      .update(updateData)
      .eq("id", user.id)
      .select()
      .single();

    if (error) {
      throw error;
    }

    // Also update auth user metadata if full_name changed
    if (full_name !== undefined) {
      await supabase.auth.updateUser({
        data: { full_name },
      });
    }

    return new Response(JSON.stringify(updatedProfile), {
      headers: { "Content-Type": "application/json" },
    });
  } catch (error: any) {
    console.error("Profile PATCH error:", error);
    return new Response(
      JSON.stringify({ error: error.message || "Internal server error" }),
      {
        status: 500,
        headers: { "Content-Type": "application/json" },
      }
    );
  }
}

