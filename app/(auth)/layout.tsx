import { ToastProvider } from "@/components/ui/toast";

export default function AuthLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <ToastProvider>
      <div className="flex min-h-screen items-center justify-center bg-background p-4">
        {children}
      </div>
    </ToastProvider>
  );
}

