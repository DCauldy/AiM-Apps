import { NextResponse, type NextRequest } from "next/server";
import { updateSession } from "@/lib/supabase/middleware";

const AIM_BASE_URL = process.env.NEXT_PUBLIC_AIM_BASE_URL ?? "https://aimarketingacademy.com";

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // Skip session check for public paths
  if (
    pathname === "/aim-auth/start" ||
    pathname === "/login" ||
    pathname.endsWith("/free") ||
    pathname.startsWith("/api/auth/") ||
    pathname.startsWith("/api/webhooks/") ||
    pathname.startsWith("/api/inngest") ||
    pathname.startsWith("/api/cron/") ||
    pathname.startsWith("/api/hyperlocal/unsubscribe") ||
    pathname.startsWith("/hyperlocal/unsubscribe")
  ) {
    return;
  }

  const { response, user } = await updateSession(request);

  // Protect all app routes — unauthenticated users go to /login
  if (!user && (pathname.startsWith("/apps") || pathname.startsWith("/admin") || pathname === "/")) {
    return NextResponse.redirect(new URL("/login", request.url));
  }

  // Admin route protection — non-admins redirected to app
  if (pathname.startsWith("/admin") && user) {
    if (user.app_metadata?.is_admin !== true) {
      return NextResponse.redirect(new URL("/apps", request.url));
    }
  }

  // Slot-overrun enforcement — after a downgrade past current active profile
  // count + grace period expiration, block every /apps/* path except
  // /apps/profile (so the user can archive) and /account (so they can re-upgrade).
  if (
    user &&
    pathname.startsWith("/apps/") &&
    !pathname.startsWith("/apps/profile") &&
    !pathname.startsWith("/account")
  ) {
    const blocked = await isSlotOverrunBlocked(user.id);
    if (blocked) {
      const url = new URL("/apps/profile", request.url);
      url.searchParams.set("slot_overrun", "1");
      return NextResponse.redirect(url);
    }
  }

  // Root redirect for authenticated users
  if (pathname === "/" && user) {
    return NextResponse.redirect(new URL("/apps", request.url));
  }

  return response;
}

/**
 * True when the user has more active profiles than slots AND the grace period
 * has expired. Reads via the service-role REST endpoint to avoid initializing
 * a full Supabase client in the Edge runtime middleware.
 */
async function isSlotOverrunBlocked(userId: string): Promise<boolean> {
  try {
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
    if (!url || !key) return false;

    const [profileRes, countRes] = await Promise.all([
      fetch(
        `${url}/rest/v1/profiles?id=eq.${userId}&select=profile_slot_count,slot_grace_period_ends_at`,
        { headers: { apikey: key, Authorization: `Bearer ${key}` }, cache: "no-store" }
      ),
      fetch(
        `${url}/rest/v1/platform_profiles?user_id=eq.${userId}&archived_at=is.null&select=id`,
        {
          headers: {
            apikey: key,
            Authorization: `Bearer ${key}`,
            Prefer: "count=exact",
          },
          cache: "no-store",
        }
      ),
    ]);
    if (!profileRes.ok || !countRes.ok) return false;

    const profile = (await profileRes.json())[0] as
      | { profile_slot_count: number; slot_grace_period_ends_at: string | null }
      | undefined;
    if (!profile) return false;

    const activeCount = Number(countRes.headers.get("content-range")?.split("/")[1] ?? "0");
    if (activeCount <= profile.profile_slot_count) return false;

    const graceEnd = profile.slot_grace_period_ends_at
      ? new Date(profile.slot_grace_period_ends_at).getTime()
      : 0;
    return !graceEnd || Date.now() > graceEnd;
  } catch {
    return false;
  }
}

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
};
