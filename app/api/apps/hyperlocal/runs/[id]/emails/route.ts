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

  // Confirm run belongs to user
  const { data: run } = await supabase
    .from("hl_runs")
    .select("id")
    .eq("id", id)
    .eq("user_id", user.id)
    .maybeSingle();
  if (!run) return Response.json({ error: "Not found" }, { status: 404 });

  const { data: emails, error } = await supabase
    .from("hl_emails")
    .select("*")
    .eq("run_id", id)
    .order("created_at", { ascending: true });

  if (error) return Response.json({ error: error.message }, { status: 500 });

  // Count recipients per email. Done with N small head-count queries
  // (cheap; uses an index on email_id) rather than one big SELECT — PostgREST
  // defaults to a 1000-row cap which silently undercounts at scale.
  const emailIds = (emails ?? []).map((e) => e.id);
  const counts: Record<string, number> = {};
  if (emailIds.length > 0) {
    await Promise.all(
      emailIds.map(async (id) => {
        const { count } = await supabase
          .from("hl_recipients")
          .select("*", { count: "exact", head: true })
          .eq("email_id", id);
        counts[id] = count ?? 0;
      })
    );
  }

  return Response.json({
    emails: (emails ?? []).map((e) => ({
      ...e,
      recipient_count: counts[e.id] ?? 0,
    })),
  });
}
