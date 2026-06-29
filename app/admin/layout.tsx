import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { isAdminUser } from "@/lib/admin";
import Link from "next/link";
import Image from "next/image";
import { UserMenu } from "@/components/layout/UserMenu";
import { ThemeToggle } from "@/components/theme/ThemeToggle";
import { ToastProvider } from "@/components/ui/toast";
import { ConfirmProvider } from "@/components/ui/confirm";

export default async function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user || !isAdminUser(user)) {
    redirect("/apps");
  }

  return (
    <ToastProvider>
      <ConfirmProvider>
        <div className="min-h-screen bg-background">
        <header className="border-b bg-background">
          <div className="flex h-14 items-center justify-between px-4 sm:px-6 gap-4">
            <div className="flex items-center gap-3">
              <Link href="/admin" className="flex items-center gap-3">
                <Image
                  src="/logo.svg"
                  alt="AiM Academy"
                  width={120}
                  height={34}
                  className="h-9 w-auto sm:h-10 dark:hidden"
                  priority
                />
                <Image
                  src="/logo-dark.svg"
                  alt="AiM Academy"
                  width={120}
                  height={34}
                  className="h-9 w-auto sm:h-10 hidden dark:block"
                  priority
                />
                <span className="text-lg sm:text-xl font-bold text-foreground font-sans">
                  Admin
                </span>
              </Link>
            </div>
            <div className="flex items-center gap-2">
              <Link
                href="/apps"
                className="text-sm text-muted-foreground hover:text-foreground transition-colors"
              >
                Back to Apps
              </Link>
              <ThemeToggle />
              <UserMenu />
            </div>
          </div>
        </header>
          <main className="max-w-6xl mx-auto px-6 py-8">{children}</main>
        </div>
      </ConfirmProvider>
    </ToastProvider>
  );
}
