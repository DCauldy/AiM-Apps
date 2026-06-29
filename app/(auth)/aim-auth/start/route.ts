import { verifyAimToken, loginWithAimPayload } from "@/lib/aim-auth";
import { NextRequest, NextResponse } from "next/server";

const AIM_BASE_URL = process.env.NEXT_PUBLIC_AIM_BASE_URL ?? "https://aimarketingacademy.com";

export async function GET(request: NextRequest) {
  const token       = request.nextUrl.searchParams.get("token");
  const redirectTo  = request.nextUrl.searchParams.get("redirect") ?? "/apps/prompt-studio/chat";
  const failUrl     = new URL("/apps", AIM_BASE_URL);

  if (!token) {
    return NextResponse.redirect(failUrl);
  }

  const payload = await verifyAimToken(token);
  if (!payload) {
    return NextResponse.redirect(failUrl);
  }

  // Build the redirect response first so cookies can be set directly on it
  const redirectResponse = NextResponse.redirect(new URL(redirectTo, request.url));

  const ok = await loginWithAimPayload(payload, request, redirectResponse);
  if (!ok) {
    return NextResponse.redirect(failUrl);
  }

  return redirectResponse;
}
