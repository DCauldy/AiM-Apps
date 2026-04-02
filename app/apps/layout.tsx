import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { Header } from "@/components/layout/Header";

export default async function AppsLayout({
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

  // Only show header for the /apps route itself, not nested routes
  // Nested routes (like /apps/prompt-studio) will use their own layouts
  return (
    <>
      {children}
    </>
  );
}
