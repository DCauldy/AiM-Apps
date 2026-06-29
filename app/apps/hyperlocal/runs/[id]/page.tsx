import { createClient } from "@/lib/supabase/server";
import { redirect, notFound } from "next/navigation";
import { RunClient } from "./run-client";
import { MagicRunExperience } from "@/components/hyperlocal/sphere/MagicRunExperience";

export const dynamic = "force-dynamic";

export default async function RunPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ magic?: string }>;
}) {
  const { id } = await params;
  const { magic } = await searchParams;
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

  // Magic launches drop into the streamlined one-click experience; everything
  // else (incl. Control mode) uses the classic phase-by-phase run client.
  if (magic === "1") {
    return <MagicRunExperience runId={id} initialRun={run} />;
  }

  return <RunClient runId={id} initialRun={run} />;
}
