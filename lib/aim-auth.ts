import { jwtVerify } from "jose";
import { createServiceRoleClient } from "@/lib/supabase/server";
import { createServerClient } from "@supabase/ssr";
import type { NextRequest, NextResponse } from "next/server";

type AimJwtPayload = {
  email: string;
  name: string;
  memberstackId: string;
  planId: string;
  apps: {
    "prompt-studio"?: { monthlyLimit: number };
    [key: string]: { monthlyLimit: number } | undefined;
  };
};

/**
 * Verify the WordPress-signed JWT and return its payload.
 * Returns null if the token is missing, invalid, or expired.
 */
export async function verifyAimToken(token: string): Promise<AimJwtPayload | null> {
  const secret = process.env.AIM_APP_TOKEN_SECRET;
  if (!secret) {
    console.error("[aim-auth] AIM_APP_TOKEN_SECRET is not set");
    return null;
  }

  try {
    const { payload: raw } = await jwtVerify(
      token,
      new TextEncoder().encode(secret),
      { algorithms: ["HS256"] }
    );
    const payload = raw as unknown as AimJwtPayload;
    if (!payload.email) {
      console.error("[aim-auth] JWT payload missing email");
      return null;
    }
    return payload;
  } catch (err) {
    console.error("[aim-auth] JWT verification failed:", err);
    return null;
  }
}

/**
 * Create a Supabase session for the given AiM JWT payload.
 * Cookies are set directly on `redirectResponse` so they survive the redirect.
 * Also upserts the profile with monthly_limit, memberstack_id, and account_type.
 *
 * If a standalone user already exists with the same email, this silently
 * upgrades their account to aim_member while preserving their UUID and data.
 *
 * Returns true on success, false on any failure.
 */
export async function loginWithAimPayload(
  payload: AimJwtPayload,
  request: NextRequest,
  redirectResponse: NextResponse
): Promise<boolean> {
  const { email, name, memberstackId, apps } = payload;
  const monthlyLimit = apps?.["prompt-studio"]?.monthlyLimit ?? 15;

  const supabaseAdmin = createServiceRoleClient();

  // Create user if they don't exist yet — includes account_type metadata
  const createResult = await supabaseAdmin.auth.admin.createUser({
    email,
    email_confirm: true,
    user_metadata: { full_name: name, account_type: "aim_member" },
    app_metadata: { account_type: "aim_member" },
  });
  if (createResult.error && createResult.error.code !== "email_exists") {
    console.error("[aim-auth] createUser failed:", createResult.error);
    return false;
  }

  // Generate a magic-link OTP
  const { data, error: linkError } = await supabaseAdmin.auth.admin.generateLink({
    type: "magiclink",
    email,
  });
  if (linkError || !data?.properties?.email_otp) {
    console.error("[aim-auth] generateLink failed:", linkError);
    return false;
  }

  // Build a Supabase client that writes session cookies directly onto redirectResponse
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet: Array<{ name: string; value: string; [key: string]: unknown }>) {
          cookiesToSet.forEach(({ name, value, ...options }) => {
            redirectResponse.cookies.set(name, value, options as Parameters<typeof redirectResponse.cookies.set>[2]);
          });
        },
      },
    }
  );

  const { error: otpError } = await supabase.auth.verifyOtp({
    type: "magiclink",
    email,
    token: data.properties.email_otp,
  });
  if (otpError) {
    console.error("[aim-auth] verifyOtp failed:", otpError);
    return false;
  }

  // Upsert profile — upgrades standalone → aim_member on email match
  const { data: profileData } = await supabaseAdmin
    .from("profiles")
    .select("id")
    .eq("email", email)
    .maybeSingle();

  if (profileData?.id) {
    await supabaseAdmin
      .from("profiles")
      .update({
        monthly_limit: monthlyLimit,
        memberstack_id: memberstackId,
        account_type: "aim_member",
        full_name: name,
        linked_at: new Date().toISOString(),
      })
      .eq("id", profileData.id);

    // Update auth user metadata so client-side reads reflect the upgrade
    await supabaseAdmin.auth.admin.updateUserById(profileData.id, {
      app_metadata: { account_type: "aim_member" },
    });
  }

  return true;
}
