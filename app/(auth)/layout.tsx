import { ToastProvider } from "@/components/ui/toast";
import { ConfirmProvider } from "@/components/ui/confirm";

// Match the product apps' dark + neutral-grey theme. Without this
// the login inherits the root marketing-site palette (bright blue
// primary), which feels jarring stepping into the app from sign-in.
// `product-app-theme` (defined in app/globals.css:409) scopes the
// HSL overrides; `dark` flips Tailwind's `dark:` utilities on.
export default function AuthLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <ToastProvider>
      <ConfirmProvider>
        <div className="dark product-app-theme flex min-h-screen items-center justify-center bg-background p-4 text-foreground">
          {children}
        </div>
      </ConfirmProvider>
    </ToastProvider>
  );
}

