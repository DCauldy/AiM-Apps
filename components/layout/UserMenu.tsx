"use client";

import { useRouter } from "next/navigation";
import { useAuth } from "@/hooks/useAuth";
import { useOptionalProfile } from "@/components/profile/ProfileProvider";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { CreditCard, LogOut, Shield } from "lucide-react";

export function UserMenu() {
  const router = useRouter();
  const { user, signOut } = useAuth();
  // When the active profile has a headshot, show it instead of the initials.
  // useOptionalProfile so this still works in layouts without ProfileProvider.
  const headshotUrl = useOptionalProfile()?.activeProfile?.headshot_url ?? null;

  if (!user) return null;

  // Get user initials for avatar
  const getUserInitials = () => {
    const fullName = user.user_metadata?.full_name;
    if (fullName) {
      const names = fullName.trim().split(" ");
      if (names.length >= 2) {
        return (names[0][0] + names[names.length - 1][0]).toUpperCase();
      }
      return names[0][0].toUpperCase();
    }
    const email = user.email;
    if (email) {
      return email[0].toUpperCase();
    }
    return "U";
  };

  const handleSignOut = async () => {
    await signOut();
    router.push("/");
  };

  return (
    <DropdownMenu openOnHover>
      {/* flex centering on the trigger so the inner avatar (32px)
          sits dead-center in the 36px trigger box. Without it the
          avatar pinned top-left and the focus ring (which wraps the
          trigger) appeared visually offset from the avatar circle. */}
      <DropdownMenuTrigger className="h-9 w-9 rounded-full p-0 hover:bg-accent border-0 bg-transparent focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 flex items-center justify-center">
        {headshotUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={headshotUrl}
            alt="Profile"
            className="w-8 h-8 rounded-full object-cover border border-white/20"
          />
        ) : (
          <div className="w-8 h-8 rounded-full bg-gradient-to-r from-[#1C4C8A] to-[#31DBA5] flex items-center justify-center text-white text-sm font-semibold">
            {getUserInitials()}
          </div>
        )}
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-56">
        <DropdownMenuLabel>
          <div className="flex flex-col space-y-1">
            <p className="text-sm font-medium leading-none">
              {user.user_metadata?.full_name || "User"}
            </p>
            <p className="text-xs leading-none text-muted-foreground">
              {user.email}
            </p>
          </div>
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        <DropdownMenuItem onClick={() => router.push("/account")}>
          <CreditCard className="mr-2 h-4 w-4" />
          <span>Account &amp; Billing</span>
        </DropdownMenuItem>
        {user.app_metadata?.is_admin === true && (
          <>
            <DropdownMenuItem onClick={() => router.push("/admin")}>
              <Shield className="mr-2 h-4 w-4" />
              <span>Admin</span>
            </DropdownMenuItem>
          </>
        )}
        <DropdownMenuSeparator />
        <DropdownMenuItem onClick={handleSignOut}>
          <LogOut className="mr-2 h-4 w-4" />
          <span>Log out</span>
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
