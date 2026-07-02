import { generateText } from "ai";
import { NextRequest } from "next/server";

import { getWritingModel } from "@/lib/openrouter";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/**
 * POST /api/apps/heat/share/draft
 *
 * Drafts a personalized share message. The Request-a-Showing link is added
 * at send time, so the model writes only the note (no link, no signature).
 */
export async function POST(req: NextRequest) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return Response.json({ error: "Unauthorized" }, { status: 401 });

  const body = (await req.json().catch(() => null)) as {
    listingLine?: string;
    audience?: "buyer" | "listing";
    channel?: "email" | "text";
    contactName?: string;
  } | null;
  if (!body?.listingLine) {
    return Response.json({ error: "Missing listing." }, { status: 400 });
  }

  const audience = body.audience === "listing" ? "listing" : "buyer";
  const channel = body.channel === "text" ? "text" : "email";
  const who = body.contactName?.trim() || "there";
  const guidance =
    audience === "buyer"
      ? "Note that the home is getting real attention (you may cite the view/save numbers) and warmly invite them to take a look if they're interested."
      : "Note there's genuine buyer interest in the area (you may cite the numbers) and gently open a low-pressure conversation about their home's value.";

  // Keep agents out of trouble: no predictions, no manufactured scarcity.
  const guardrails =
    "IMPORTANT: Stay factual and low-pressure. Do NOT predict or imply the home will sell fast, " +
    "receive multiple offers, start a bidding war, or go under contract. Do NOT guarantee or speculate " +
    "about future market behavior. Only state the real, observed numbers as given. No hype, no false urgency.";

  try {
    if (channel === "text") {
      const { text } = await generateText({
        model: getWritingModel(),
        prompt:
          `Write a short, warm SMS from a real estate agent to their client named ${who} about a listing. ` +
          `Max 2 sentences, ~200 characters, casual and personal. ${guidance} ` +
          `Do NOT include any link, URL, or sign-off — end with a light, no-pressure question. ` +
          `${guardrails} ` +
          `Listing: ${body.listingLine}.`,
      });
      return Response.json({ text: text.trim() });
    }

    const { text } = await generateText({
      model: getWritingModel(),
      prompt:
        `Write a brief, friendly real estate email from an agent to their client named ${who} about a listing. ` +
        `First line must be "SUBJECT: <subject>", then a blank line, then a 3–4 sentence body — a touch more detail and polish than a text. ${guidance} ` +
        `Do NOT include any link, URL, or signature. ${guardrails} Listing: ${body.listingLine}.`,
    });
    const trimmed = text.trim();
    const m = trimmed.match(/^SUBJECT:\s*(.+?)\n+([\s\S]+)$/i);
    return Response.json({
      subject: m ? m[1].trim() : `A hot listing I thought of you for`,
      body: m ? m[2].trim() : trimmed,
    });
  } catch (err) {
    console.error("heat share draft failed:", err);
    return Response.json({ error: "Couldn't draft the message." }, { status: 500 });
  }
}
