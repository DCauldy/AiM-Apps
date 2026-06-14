import { redirect } from "next/navigation";
import { getCachedUser } from "@/lib/auth/get-cached-user";
import { ToastProvider } from "@/components/ui/toast";
import { ProfileProvider } from "@/components/profile/ProfileProvider";

export default async function AppsLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const user = await getCachedUser();

  if (!user) {
    redirect((process.env.NEXT_PUBLIC_AIM_BASE_URL ?? "https://aimarketingacademy.com") + "/apps");
  }

  return (
    <ToastProvider>
      <ProfileProvider>{children}</ProfileProvider>
    </ToastProvider>
  );
}
