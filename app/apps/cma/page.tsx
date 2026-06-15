import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { requireActiveProfileOrRedirect } from "@/lib/profiles/require-active";

export default async function CmaIndexPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  await requireActiveProfileOrRedirect(user.id, "/apps/cma");
  redirect("/apps/cma/dashboard");
}
