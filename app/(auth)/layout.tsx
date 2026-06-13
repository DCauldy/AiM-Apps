import { ToastProvider } from "@/components/ui/toast";
import { ConfirmProvider } from "@/components/ui/confirm";

export default function AuthLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <ToastProvider>
      <ConfirmProvider>
        <div className="flex min-h-screen items-center justify-center bg-background p-4">
          {children}
        </div>
      </ConfirmProvider>
    </ToastProvider>
  );
}

