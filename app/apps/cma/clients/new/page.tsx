import { redirect } from "next/navigation";
import { getCachedUser } from "@/lib/auth/get-cached-user";
import { NewClientForm } from "./new-client-form";

export const dynamic = "force-dynamic";

export default async function CmaClientsNewPage() {
  const user = await getCachedUser();
  if (!user) redirect("/login");
  return <NewClientForm />;
}
