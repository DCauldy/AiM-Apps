import { createServiceRoleClient } from "@/lib/supabase/server";
import { encrypt } from "@/lib/hyperlocal/encryption";
import {
  exchangeMicrosoftCode,
  getMicrosoftUserProfile,
} from "@/lib/hyperlocal/email/oauth/microsoft";
import { verifyOauthState } from "@/lib/hyperlocal/email/oauth/state";
import { NextRequest } from "next/server";

export const dynamic = "force-dynamic";

const APP_URL =
  process.env.NEXT_PUBLIC_APP_URL ?? "https://apps.aimarketingacademy.com";

function errorRedirect(message: string): Response {
  const url = new URL(
    "/apps/hyperlocal/settings?tab=email&oauth_error=" +
      encodeURIComponent(message),
    APP_URL
  );
  return Response.redirect(url.toString(), 302);
}

export async function GET(req: NextRequest) {
  const params = new URL(req.url).searchParams;
  const code = params.get("code");
  const state = params.get("state");
  const errorParam = params.get("error");

  if (errorParam) {
    return errorRedirect(errorParam);
  }
  if (!code || !state) {
    return errorRedirect("Missing code or state");
  }

  const verified = await verifyOauthState(state);
  if (!verified || verified.provider !== "microsoft") {
    return errorRedirect("Invalid state — please try again");
  }

  try {
    const tokens = await exchangeMicrosoftCode(code);
    const profile = await getMicrosoftUserProfile(tokens.access_token);
    if (!profile.email) {
      return errorRedirect("Could not read mailbox identity");
    }

    const service = createServiceRoleClient();

    // Upsert by (user_id, provider, email_address)
    const { data: existing } = await service
      .from("hl_email_connections")
      .select("id")
      .eq("user_id", verified.userId)
      .eq("provider", "microsoft")
      .eq("email_address", profile.email)
      .maybeSingle();

    const row = {
      user_id: verified.userId,
      provider: "microsoft",
      email_address: profile.email,
      display_name: profile.displayName || null,
      oauth_access_token_encrypted: encrypt(tokens.access_token),
      oauth_refresh_token_encrypted: tokens.refresh_token
        ? encrypt(tokens.refresh_token)
        : null,
      oauth_expires_at: new Date(
        Date.now() + tokens.expires_in * 1000
      ).toISOString(),
      oauth_scope: tokens.scope ?? null,
      is_active: true,
      last_error: null,
      updated_at: new Date().toISOString(),
    };

    if (existing) {
      await service
        .from("hl_email_connections")
        .update(row)
        .eq("id", existing.id);
    } else {
      // Check if this is the user's first connection — make it default
      const { count } = await service
        .from("hl_email_connections")
        .select("*", { count: "exact", head: true })
        .eq("user_id", verified.userId);

      await service.from("hl_email_connections").insert({
        ...row,
        is_default: (count ?? 0) === 0,
      });
    }

    const returnTo = verified.returnTo ?? "/apps/hyperlocal/settings?tab=email";
    return Response.redirect(new URL(returnTo, APP_URL).toString(), 302);
  } catch (e) {
    return errorRedirect(e instanceof Error ? e.message : "OAuth failed");
  }
}
