import { NextResponse, type NextRequest } from "next/server";
import { updateSession } from "@/lib/supabase/middleware";

const AIM_BASE_URL = process.env.NEXT_PUBLIC_AIM_BASE_URL ?? "https://aimarketingacademy.com";

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // Skip session check for the token entry point — it handles auth itself
  if (pathname === "/aim-auth/start") return;

  const { response, user } = await updateSession(request);

  // Protect all app routes — unauthenticated users go back to WP to get a token
  if (!user && (pathname.startsWith("/apps") || pathname === "/")) {
    return NextResponse.redirect(new URL("/apps", AIM_BASE_URL));
  }

  // Root redirect for authenticated users
  if (pathname === "/" && user) {
    return NextResponse.redirect(new URL("/apps/prompt-studio/chat", request.url));
  }

  return response;
}

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
};
