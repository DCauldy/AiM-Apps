import { createClient } from "@/lib/supabase/server";
import { NextRequest, NextResponse } from "next/server";

export async function GET(
  req: NextRequest,
  context: { params: Promise<{ threadId: string }> }
) {
  try {
    const { threadId } = await context.params;
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

    const { data: thread, error } = await supabase
      .from("threads")
      .select("id, user_id, title, starred, created_at, updated_at")
      .eq("id", threadId)
      .eq("user_id", user.id)
      .single();

    if (error || !thread) {
      return new Response(JSON.stringify({ error: "Thread not found" }), {
        status: 404,
        headers: { "Content-Type": "application/json" },
      });
    }

    // Check for shared prompts in this thread
    const { data: sharedMessages } = await supabase
      .from("messages")
      .select("id")
      .eq("thread_id", threadId)
      .eq("is_public", true)
      .eq("role", "assistant");

    const sharedCount = sharedMessages?.length || 0;

    // Ensure starred field is a boolean (handle null/undefined as false)
    // Explicitly convert to boolean to avoid any type coercion issues
    const starredStatus = thread.starred === true;

    return new Response(
      JSON.stringify({
        ...thread,
        starred: starredStatus,
        sharedPromptsCount: sharedCount,
        hasSharedPrompts: sharedCount > 0,
      }),
      {
        headers: { "Content-Type": "application/json" },
      }
    );
  } catch (error: any) {
    console.error("Thread GET error:", error);
    return new Response(
      JSON.stringify({ error: error.message || "Internal server error" }),
      {
        status: 500,
        headers: { "Content-Type": "application/json" },
      }
    );
  }
}

export async function DELETE(
  req: NextRequest,
  context: { params: Promise<{ threadId: string }> }
) {
  const { threadId } = await context.params;
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

    const { error } = await supabase
      .from("threads")
      .delete()
      .eq("id", threadId);

    if (error) {
      throw error;
    }

    return new Response(JSON.stringify({ success: true }), {
      headers: { "Content-Type": "application/json" },
    });
  } catch (error: any) {
    console.error("Thread DELETE error:", error);
    return new Response(
      JSON.stringify({ error: error.message || "Internal server error" }),
      {
        status: 500,
        headers: { "Content-Type": "application/json" },
      }
    );
  }
}


export async function PATCH(
  req: NextRequest,
  context: { params: Promise<{ threadId: string }> }
) {
  const { threadId } = await context.params;
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

    // Validate that we have a threadId
    if (!threadId) {
      return new Response(JSON.stringify({ error: "Thread ID is required" }), {
        status: 400,
        headers: { "Content-Type": "application/json" },
      });
    }

    // Log the incoming request
    console.log("=== PATCH REQUEST DEBUG ===");
    console.log("Request body:", JSON.stringify(body, null, 2));
    console.log("Body.starred:", body.starred, "Type:", typeof body.starred);
    
    // Build update data - ensure false values are explicitly included
    const updateData: Record<string, any> = {
      updated_at: new Date().toISOString(),
    };
    
    if (body.title !== undefined) {
      updateData.title = body.title;
    }
    
    // CRITICAL: Handle starred explicitly - ensure false is properly set
    if (body.starred !== undefined) {
      // Explicitly convert to boolean - don't use Boolean() which might have issues
      // If it's explicitly false, set it to false. Otherwise, set to true.
      updateData.starred = body.starred === true || body.starred === "true" || body.starred === 1;
      
      console.log("Processing starred update:", {
        original: body.starred,
        originalType: typeof body.starred,
        converted: updateData.starred,
        isFalse: updateData.starred === false,
        isTrue: updateData.starred === true,
        jsonStringified: JSON.stringify({ starred: updateData.starred })
      });
    }

    // If no valid fields to update, return error
    if (Object.keys(updateData).length === 1) {
      return new Response(
        JSON.stringify({ error: "No valid fields to update. Allowed fields: title, starred" }),
        {
          status: 400,
          headers: { "Content-Type": "application/json" },
        }
      );
    }
    
    console.log("Final update data before sending to Supabase:", JSON.stringify(updateData, null, 2));
    console.log("Update data keys:", Object.keys(updateData));
    console.log("Starred value:", updateData.starred, "Type:", typeof updateData.starred);
    
    // Update the thread - send updateData directly
    console.log("Sending update to Supabase with data:", JSON.stringify(updateData, null, 2));
    const { error: updateError } = await supabase
      .from("threads")
      .update(updateData)
      .eq("id", threadId)
      .eq("user_id", user.id);
    
    console.log("Update error (without select):", updateError?.message);
    if (updateError) {
      console.error("Full update error:", JSON.stringify(updateError, null, 2));
    } else {
      console.log("✅ Update completed without error");
    }
    
    if (updateError) {
      // If update failed, return error
      if (updateError.code === "PGRST116" || updateError.message?.includes("No rows")) {
        return new Response(JSON.stringify({ 
          error: "Thread not found",
          details: "Thread does not exist or you don't have permission to update it",
          code: updateError.code
        }), {
          status: 404,
          headers: { "Content-Type": "application/json" },
        });
      }
      
      return new Response(JSON.stringify({ 
        error: "Failed to update thread",
        details: updateError.message,
        code: updateError.code 
      }), {
        status: 500,
        headers: { "Content-Type": "application/json" },
      });
    }
    
    // Now fetch the updated thread separately
    let { data: updatedThread, error: fetchError } = await supabase
      .from("threads")
      .select("id, user_id, title, starred, created_at, updated_at")
      .eq("id", threadId)
      .eq("user_id", user.id)
      .single();
    
    console.log("Fetch after update - Error:", fetchError?.message);
    console.log("Fetched thread starred value:", updatedThread?.starred, "Type:", typeof updatedThread?.starred);
    console.log("Expected starred value:", updateData.starred);
    console.log("Values match:", updatedThread?.starred === updateData.starred);
    
    // If the update didn't work (starred is still not the expected value), log a detailed error
    if (updatedThread && updateData.starred !== undefined && updatedThread.starred !== updateData.starred) {
      console.error("❌ CRITICAL ERROR: Starred value mismatch detected!");
      console.error("Expected:", updateData.starred, "Type:", typeof updateData.starred);
      console.error("Actual from DB:", updatedThread.starred, "Type:", typeof updatedThread.starred);
      console.error("This indicates Supabase is not persisting boolean false values correctly");
      
      // Try one more time with an even more explicit approach using a new object
      console.warn("Attempting retry with explicit false value...");
      const retryUpdate: any = {
        updated_at: new Date().toISOString(),
        starred: false  // Hard-code false to test
      };
      
      // Only retry if we're trying to set to false
      if (updateData.starred === false) {
        const { error: retryError, data: retryData } = await supabase
          .from("threads")
          .update(retryUpdate)
          .eq("id", threadId)
          .eq("user_id", user.id)
          .select("starred")
          .single();
        
        console.log("Retry update error:", retryError?.message);
        console.log("Retry update result:", retryData);
        
        // Re-fetch after retry
        const { data: retryThread } = await supabase
          .from("threads")
          .select("id, user_id, title, starred, created_at, updated_at")
          .eq("id", threadId)
          .eq("user_id", user.id)
          .single();
        
        if (retryThread) {
          console.log("After retry, starred is:", retryThread.starred);
          if (retryThread.starred === false) {
            console.log("✅ Retry succeeded! Starred is now false");
            updatedThread = retryThread;
          } else {
            console.error("❌ Retry failed - starred is still:", retryThread.starred);
          }
        }
      }
    }

    if (fetchError || !updatedThread) {
      return new Response(JSON.stringify({ error: "Thread not found after update" }), {
        status: 404,
        headers: { "Content-Type": "application/json" },
      });
    }
    
    // Get the starred value from the fetched thread
    const rawStarred = updatedThread.starred;
    const starredValue = rawStarred === true; // Only true if explicitly true
    
    console.log("Final starred value:", {
      raw: rawStarred,
      type: typeof rawStarred,
      isTrue: rawStarred === true,
      isFalse: rawStarred === false,
      isNull: rawStarred === null,
      converted: starredValue,
      expected: updateData.starred,
      matchesExpected: rawStarred === updateData.starred
    });
    
    // Build response with proper types - explicitly set starred as boolean
    const responseData: any = {
      id: updatedThread.id,
      user_id: updatedThread.user_id,
      title: updatedThread.title || "New Conversation",
      starred: starredValue, // Explicitly boolean - false if not true
      created_at: updatedThread.created_at,
      updated_at: updatedThread.updated_at,
    };
    
    // If there's a mismatch, include debug info in the response for browser console
    if (updateData.starred !== undefined && updatedThread.starred !== updateData.starred) {
      console.error("ERROR: Starred value was NOT updated correctly!");
      // Include debug info in response for browser console visibility
      responseData._debug = {
        error: "Starred value mismatch detected",
        expected: updateData.starred,
        actual: updatedThread.starred,
        rawFromDb: rawStarred,
        updateDataSent: updateData,
        requestBody: body,
        message: "Supabase may not be persisting boolean false values correctly. Consider using RPC function."
      };
    }
    
    console.log("Final response data:", JSON.stringify(responseData, null, 2));

    return new Response(JSON.stringify(responseData), {
      headers: { "Content-Type": "application/json" },
    });
  } catch (error: any) {
    console.error("Thread PATCH error:", error);
    return new Response(
      JSON.stringify({ 
        error: error.message || "Internal server error",
        details: error.stack 
      }),
      {
        status: 500,
        headers: { "Content-Type": "application/json" },
      }
    );
  }
}

