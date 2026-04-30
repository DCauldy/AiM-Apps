import { createServiceRoleClient } from "@/lib/supabase/server";
import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { NextRequest } from "next/server";

export async function POST(req: NextRequest) {
  try {
    const { memberstackId, email, name, planConnections } = await req.json();

    if (!email || !memberstackId) {
      return Response.json(
        { error: "Invalid member data" },
        { status: 400 }
      );
    }

    // Derive monthly limit from plan connections (default 15 for AiM members)
    const monthlyLimit = 15;

    const supabaseAdmin = createServiceRoleClient();

    // Create user if they don't exist — includes aim_member metadata
    const createResult = await supabaseAdmin.auth.admin.createUser({
      email,
      email_confirm: true,
      user_metadata: { full_name: name, account_type: "aim_member" },
      app_metadata: { account_type: "aim_member" },
    });

    if (createResult.error && createResult.error.code !== "email_exists") {
      console.error("[memberstack-auth] createUser failed:", createResult.error);
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
      console.error("[memberstack-auth] generateLink failed:", linkError);
      return Response.json(
        { error: "Failed to sign in" },
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
      console.error("[memberstack-auth] verifyOtp failed:", otpError);
      return Response.json(
        { error: "Failed to sign in" },
        { status: 500 }
      );
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

    return Response.json({ success: true });
  } catch (error: any) {
    console.error("[memberstack-auth] unexpected error:", error);
    return Response.json(
      { error: error.message || "Internal server error" },
      { status: 500 }
    );
  }
}
