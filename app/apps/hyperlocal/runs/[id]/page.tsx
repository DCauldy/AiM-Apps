import { createClient } from "@/lib/supabase/server";
import { redirect, notFound } from "next/navigation";
import { RunClient } from "./run-client";

export const dynamic = "force-dynamic";

export default async function RunPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: run } = await supabase
    .from("hl_runs")
    .select("*")
    .eq("id", id)
    .eq("user_id", user.id)
    .maybeSingle();

  if (!run) notFound();

  return <RunClient runId={id} initialRun={run} />;
}
