import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { OptimizeClient } from "@/components/radar/optimize/OptimizeClient";
import type { RadarAudit, RadarAuditPage } from "@/types/radar";

export default async function RadarOptimizePage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect("/login");

  const { data: config } = await supabase
    .from("radar_config")
    .select("onboarding_completed")
    .eq("user_id", user.id)
    .maybeSingle();

  if (!config?.onboarding_completed) {
    redirect("/apps/radar/onboarding");
  }

  // Load latest audit with pages
  const { data: audit } = await supabase
    .from("radar_audits")
    .select("*")
    .eq("user_id", user.id)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  let pages: RadarAuditPage[] = [];
  if (audit) {
    const { data: pagesData } = await supabase
      .from("radar_audit_pages")
      .select("*")
      .eq("audit_id", audit.id)
      .eq("user_id", user.id)
      .order("score", { ascending: true });
    pages = (pagesData as RadarAuditPage[]) ?? [];
  }

  return (
    <OptimizeClient
      audit={(audit as RadarAudit) ?? null}
      pages={pages}
    />
  );
}
