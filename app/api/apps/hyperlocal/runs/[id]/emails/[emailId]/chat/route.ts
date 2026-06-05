import { createClient, createServiceRoleClient } from "@/lib/supabase/server";
import { getHyperlocalEmailWriterModel } from "@/lib/openrouter";
import { rerenderEmail, snapshotBlocks } from "@/lib/hyperlocal/email/rerender";
import { generateObject } from "ai";
import { z } from "zod";
import { NextRequest } from "next/server";

export const dynamic = "force-dynamic";

const EditSchema = z.object({
  explanation: z.string().describe(
    "One-line explanation of what you changed and why, shown to the user."
  ),
  subject: z
    .string()
    .nullable()
    .describe("New subject line, or null to leave unchanged."),
  preheader: z
    .string()
    .nullable()
    .describe("New preheader, or null to leave unchanged."),
  seller_perspective_html: z
    .string()
    .nullable()
    .describe(
      "New HTML for the For-Homeowners section, or null to leave unchanged. Same constraints as the original prompt: <p>/<strong>/<em>/<ul>, no emojis, no <html>/<body> wrapper."
    ),
  buyer_perspective_html: z
    .string()
    .nullable()
    .describe(
      "New HTML for the For-Buyers section, or null to leave unchanged. Same constraints."
    ),
});

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string; emailId: string }> }
) {
  const { id, emailId } = await params;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return Response.json({ error: "Unauthorized" }, { status: 401 });

  // Ownership
  const { data: run } = await supabase
    .from("hl_runs")
    .select("id")
    .eq("id", id)
    .eq("user_id", user.id)
    .maybeSingle();
  if (!run) return Response.json({ error: "Not found" }, { status: 404 });

  const { data: messages } = await supabase
    .from("hl_email_chats")
    .select("id, role, content, applied_changes, created_at")
    .eq("email_id", emailId)
    .order("created_at", { ascending: true });

  return Response.json({ messages: messages ?? [] });
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string; emailId: string }> }
) {
  const { id, emailId } = await params;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return Response.json({ error: "Unauthorized" }, { status: 401 });

  const body = await req.json();
  const userMessage = String(body.message ?? "").trim();
  if (!userMessage) {
    return Response.json({ error: "message is required" }, { status: 400 });
  }

  const service = createServiceRoleClient();

  // Verify ownership + load email
  const { data: run } = await service
    .from("hl_runs")
    .select("id, phase")
    .eq("id", id)
    .eq("user_id", user.id)
    .maybeSingle();
  if (!run) return Response.json({ error: "Run not found" }, { status: 404 });
  if (run.phase !== "review") {
    return Response.json(
      { error: `Cannot edit in ${run.phase} phase` },
      { status: 400 }
    );
  }

  const { data: email } = await service
    .from("hl_emails")
    .select(
      "id, subject, preheader, seller_perspective_html, buyer_perspective_html, refinements_used, refinements_limit, segment_id"
    )
    .eq("id", emailId)
    .eq("run_id", id)
    .single();
  if (!email) {
    return Response.json({ error: "Email not found" }, { status: 404 });
  }
  if (email.refinements_used >= email.refinements_limit) {
    return Response.json(
      {
        error: `Refinement limit reached (${email.refinements_limit}). Edit blocks manually if you need more changes.`,
      },
      { status: 429 }
    );
  }

  // Load context: segment for metrics + sender for tone
  const { data: segment } = await service
    .from("hl_segments")
    .select("geo_key, geo_label, mls_metrics")
    .eq("id", email.segment_id)
    .single();

  // Prior chat history (for context)
  const { data: priorChats } = await service
    .from("hl_email_chats")
    .select("role, content")
    .eq("email_id", emailId)
    .order("created_at", { ascending: true })
    .limit(20);

  // Persist the user turn first (so we have it even if the LLM call fails)
  await service.from("hl_email_chats").insert({
    email_id: emailId,
    role: "user",
    content: userMessage,
  });

  // Build the prompt
  const currentState = {
    subject: email.subject ?? "",
    preheader: email.preheader ?? "",
    seller_perspective_html: email.seller_perspective_html ?? "(empty)",
    buyer_perspective_html: email.buyer_perspective_html ?? "(empty)",
  };

  const systemPrompt = `You are editing a hyperlocal real-estate market-report email for the ${segment?.geo_label || segment?.geo_key} area. The user has asked you to make a change.

CURRENT DRAFT:
Subject: ${currentState.subject}
Preheader: ${currentState.preheader}

For-Homeowners section:
${currentState.seller_perspective_html}

For-Buyers section:
${currentState.buyer_perspective_html}

MARKET DATA you can cite (do not invent numbers beyond these):
${segment?.mls_metrics ? JSON.stringify(segment.mls_metrics, null, 2) : "(no MLS metrics — this segment was sub-threshold, write without specific numbers)"}

RULES:
- Only change what the user asked you to change. Leave other fields as null.
- Section HTML uses <p>, <strong>, <em>, and <ul> only. No <html>/<body> wrapper. No emojis.
- Tone: knowledgeable agent texting a neighbor, not a brochure.
- Subject: 45 chars or fewer. Preheader: 60–90 chars.
- Sections: 120–180 words each.
- Return the explanation field with one short sentence describing what you changed.`;

  const priorHistory = (priorChats ?? [])
    .filter((c) => c.role === "user" || c.role === "assistant")
    .map((c) => `${c.role.toUpperCase()}: ${c.content}`)
    .join("\n\n");

  let result;
  try {
    result = await generateObject({
      model: getHyperlocalEmailWriterModel(),
      schema: EditSchema,
      system: systemPrompt,
      prompt: `${
        priorHistory ? `Previous turns:\n${priorHistory}\n\n` : ""
      }USER: ${userMessage}`,
      maxOutputTokens: 2000,
    });
  } catch (e) {
    const errMsg = e instanceof Error ? e.message : String(e);
    await service.from("hl_email_chats").insert({
      email_id: emailId,
      role: "assistant",
      content: `(error) ${errMsg}`,
    });
    return Response.json(
      { error: `LLM call failed: ${errMsg}` },
      { status: 500 }
    );
  }

  const edit = result.object;

  // Snapshot the pre-edit state for one-step undo
  const snapshot = snapshotBlocks(email);

  // Apply only the fields the LLM filled
  const update: Record<string, unknown> = {
    updated_at: new Date().toISOString(),
    refinements_used: email.refinements_used + 1,
    last_edit_snapshot: snapshot,
  };
  const changedFields: string[] = [];
  if (edit.subject !== null) {
    update.subject = edit.subject;
    changedFields.push("subject");
  }
  if (edit.preheader !== null) {
    update.preheader = edit.preheader;
    changedFields.push("preheader");
  }
  if (edit.seller_perspective_html !== null) {
    update.seller_perspective_html = edit.seller_perspective_html;
    changedFields.push("seller_perspective_html");
  }
  if (edit.buyer_perspective_html !== null) {
    update.buyer_perspective_html = edit.buyer_perspective_html;
    changedFields.push("buyer_perspective_html");
  }

  if (changedFields.length === 0) {
    await service.from("hl_email_chats").insert({
      email_id: emailId,
      role: "assistant",
      content: edit.explanation || "I didn't change anything.",
    });
    return Response.json({
      explanation: edit.explanation,
      changed: [],
    });
  }

  // Apply + re-render
  await service.from("hl_emails").update(update).eq("id", emailId);
  let html = "";
  let plain_text = "";
  try {
    const r = await rerenderEmail(emailId);
    html = r.html;
    plain_text = r.plain_text;
    await service
      .from("hl_emails")
      .update({ html, plain_text })
      .eq("id", emailId);
  } catch (e) {
    return Response.json(
      {
        error: `Edit applied but re-render failed: ${
          e instanceof Error ? e.message : String(e)
        }`,
      },
      { status: 500 }
    );
  }

  // Persist the assistant turn with applied_changes for the UI to show
  await service.from("hl_email_chats").insert({
    email_id: emailId,
    role: "assistant",
    content: edit.explanation,
    applied_changes: { changed: changedFields },
  });

  return Response.json({
    explanation: edit.explanation,
    changed: changedFields,
    refinements_remaining: email.refinements_limit - (email.refinements_used + 1),
  });
}
