import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getCachedUser } from "@/lib/auth/get-cached-user";
import { getBofuUsage } from "@/lib/blog-engine/usage";
import { DashboardClient } from "./dashboard-client";

export default async function DashboardPage() {
  const user = await getCachedUser();
  if (!user) redirect("/login");
  const supabase = await createClient();

  // Check onboarding (now lives on bofu_schedules alongside the rest of
  // per-profile Blog Engine config)
  const { data: schedule } = await supabase
    .from("bofu_schedules")
    .select("onboarding_completed")
    .eq("user_id", user.id)
    .maybeSingle();

  if (!schedule?.onboarding_completed) {
    redirect("/apps/blog-engine/onboarding");
  }

  // Load initial data in parallel
  const [usageResult, blogsResult, topicsResult, scheduleResult, cmsResult] =
    await Promise.all([
      getBofuUsage(user.id),
      supabase
        .from("bofu_blogs")
        .select("*", { count: "exact" })
        .eq("user_id", user.id)
        .order("created_at", { ascending: false })
        .limit(20),
      supabase
        .from("bofu_topics")
        .select("id", { count: "exact" })
        .eq("user_id", user.id)
        .eq("status", "unused"),
      supabase
        .from("bofu_schedules")
        .select("next_run_at")
        .eq("user_id", user.id)
        .eq("is_active", true)
        .maybeSingle(),
      supabase
        .from("bofu_cms_connections")
        .select("id, platform, last_publish_at, last_error, is_active")
        .eq("user_id", user.id)
        .order("is_active", { ascending: false }),
    ]);

  const blogs = blogsResult.data || [];
  const publishedCount = blogs.filter(
    (b) => b.publish_status === "published"
  ).length;
  // Count blogs with a pipeline_error so the health rail can surface
  // "1 failed run" — cheap server-side aggregation, no extra round-trip.
  const failedBlogsCount = blogs.filter(
    (b) => b.publish_status === "failed" || b.pipeline_error,
  ).length;

  const cmsConnections = cmsResult.data ?? [];
  const activeCms = cmsConnections.find((c) => c.is_active);

  return (
    <DashboardClient
      usage={usageResult}
      blogs={blogs}
      totalBlogs={blogsResult.count || 0}
      publishedBlogs={publishedCount}
      topicBankSize={topicsResult.count || 0}
      nextRunAt={scheduleResult.data?.next_run_at || undefined}
      cmsConnected={!!activeCms}
      cmsHealth={{
        activeConnections: cmsConnections.filter((c) => c.is_active).length,
        platform: activeCms?.platform ?? null,
        lastPublishAt: activeCms?.last_publish_at ?? null,
        lastError: activeCms?.last_error ?? null,
      }}
      failedBlogsCount={failedBlogsCount}
    />
  );
}
