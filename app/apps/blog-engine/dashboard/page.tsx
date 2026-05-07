import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getBofuUsage } from "@/lib/blog-engine/usage";
import { DashboardClient } from "./dashboard-client";

export default async function DashboardPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect("/login");

  // Check onboarding
  const { data: profile } = await supabase
    .from("user_profiles")
    .select("onboarding_completed")
    .eq("user_id", user.id)
    .maybeSingle();

  if (!profile?.onboarding_completed) {
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
        .select("id")
        .eq("user_id", user.id)
        .eq("is_active", true)
        .maybeSingle(),
    ]);

  const blogs = blogsResult.data || [];
  const publishedCount = blogs.filter(
    (b) => b.publish_status === "published"
  ).length;

  return (
    <DashboardClient
      usage={usageResult}
      blogs={blogs}
      totalBlogs={blogsResult.count || 0}
      publishedBlogs={publishedCount}
      topicBankSize={topicsResult.count || 0}
      nextRunAt={scheduleResult.data?.next_run_at || undefined}
      cmsConnected={!!cmsResult.data}
    />
  );
}
