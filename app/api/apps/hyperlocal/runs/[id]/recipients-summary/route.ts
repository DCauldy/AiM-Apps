import { createClient } from "@/lib/supabase/server";
import { NextRequest } from "next/server";

export const dynamic = "force-dynamic";

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return Response.json({ error: "Unauthorized" }, { status: 401 });

  const { data: run } = await supabase
    .from("hl_runs")
    .select("id")
    .eq("id", id)
    .eq("user_id", user.id)
    .maybeSingle();
  if (!run) return Response.json({ error: "Not found" }, { status: 404 });

  // Count by status using head-count queries. PostgREST defaults to a
  // 1000-row cap, so a single SELECT would silently undercount at scale.
  const statuses: Array<keyof typeof counts> = [
    "pending",
    "sent",
    "suppressed",
    "bounced",
    "complained",
    "failed",
  ];
  const counts = {
    pending: 0,
    sent: 0,
    suppressed: 0,
    bounced: 0,
    complained: 0,
    failed: 0,
  };
  await Promise.all(
    statuses.map(async (s) => {
      const { count } = await supabase
        .from("hl_recipients")
        .select("*, hl_emails!inner(run_id)", { count: "exact", head: true })
        .eq("hl_emails.run_id", id)
        .eq("send_status", s);
      counts[s] = count ?? 0;
    })
  );

  return Response.json({ counts });
}
