import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { PromptStudioLayoutClient } from "./layout-client";

export default async function PromptStudioLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect((process.env.NEXT_PUBLIC_AIM_BASE_URL ?? "https://aimarketingacademy.com") + "/apps");
  }

  return <PromptStudioLayoutClient>{children}</PromptStudioLayoutClient>;
}
