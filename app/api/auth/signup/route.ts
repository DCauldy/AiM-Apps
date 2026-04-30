import { createServiceRoleClient } from "@/lib/supabase/server";
import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { NextRequest } from "next/server";

export async function POST(req: NextRequest) {
  try {
    const { email, password, fullName, turnstileToken } = await req.json();

    if (!email || !password || !fullName) {
      return Response.json(
        { error: "Email, password, and full name are required" },
        { status: 400 }
      );
    }

    // Validate Turnstile token if configured
    // Use Cloudflare's test secret key on localhost so the test site key tokens verify
    const isLocalhost = req.headers.get("host")?.startsWith("localhost");
    const turnstileSecret = isLocalhost
      ? "1x0000000000000000000000000000000AA"
      : process.env.TURNSTILE_SECRET_KEY;
    if (turnstileSecret) {
      if (!turnstileToken) {
        return Response.json(
          { error: "Verification is required" },
          { status: 400 }
        );
      }

      const verifyRes = await fetch(
        "https://challenges.cloudflare.com/turnstile/v0/siteverify",
        {
          method: "POST",
          headers: { "Content-Type": "application/x-www-form-urlencoded" },
          body: new URLSearchParams({
            secret: turnstileSecret,
            response: turnstileToken,
          }),
        }
      );

      const verifyData = await verifyRes.json();
      if (!verifyData.success) {
        return Response.json(
          { error: "Verification failed. Please try again." },
          { status: 400 }
        );
      }
    }

    const supabaseAdmin = createServiceRoleClient();

    // Create user with email confirmed (no email verification for standalone)
    const { data: createData, error: createError } =
      await supabaseAdmin.auth.admin.createUser({
        email,
        password,
        email_confirm: true,
        user_metadata: {
          full_name: fullName,
          account_type: "standalone",
        },
        app_metadata: {
          account_type: "standalone",
        },
      });

    if (createError) {
      if (createError.code === "email_exists") {
        return Response.json(
          { error: "An account with this email already exists. Please sign in instead." },
          { status: 409 }
        );
      }
      console.error("[signup] createUser failed:", createError);
      return Response.json(
        { error: "Failed to create account" },
        { status: 500 }
      );
    }

    // Generate a magic-link OTP to set session cookies
    const { data: linkData, error: linkError } =
      await supabaseAdmin.auth.admin.generateLink({
        type: "magiclink",
        email,
      });

    if (linkError || !linkData?.properties?.email_otp) {
      console.error("[signup] generateLink failed:", linkError);
      return Response.json(
        { error: "Account created but failed to sign in. Please try signing in." },
        { status: 500 }
      );
    }

    // Verify OTP to establish session cookies
    const cookieStore = await cookies();
    const supabase = createServerClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      {
        cookies: {
          getAll() {
            return cookieStore.getAll();
          },
          setAll(
            cookiesToSet: Array<{
              name: string;
              value: string;
              [key: string]: unknown;
            }>
          ) {
            cookiesToSet.forEach(({ name, value, ...options }) => {
              cookieStore.set(name, value, options as any);
            });
          },
        },
      }
    );

    const { error: otpError } = await supabase.auth.verifyOtp({
      type: "magiclink",
      email,
      token: linkData.properties.email_otp,
    });

    if (otpError) {
      console.error("[signup] verifyOtp failed:", otpError);
      return Response.json(
        { error: "Account created but failed to sign in. Please try signing in." },
        { status: 500 }
      );
    }

    return Response.json({ success: true });
  } catch (error: any) {
    console.error("[signup] unexpected error:", error);
    return Response.json(
      { error: error.message || "Internal server error" },
      { status: 500 }
    );
  }
}
