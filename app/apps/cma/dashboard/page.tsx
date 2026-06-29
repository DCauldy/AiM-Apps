import { redirect } from "next/navigation";
import { getCachedUser } from "@/lib/auth/get-cached-user";
import { DashboardClient } from "./dashboard-client";

export const dynamic = "force-dynamic";

export default async function CmaDashboardPage() {
  const user = await getCachedUser();
  if (!user) redirect("/login");
  return <DashboardClient />;
}
