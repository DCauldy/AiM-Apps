"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { ChevronUp, ChevronDown, LogOut, User, BarChart3 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/hooks/useAuth";

interface ProfileSectionProps {
  /** Base path for settings/stats links (e.g., "/apps/prompt-studio" or "/apps/blog-engine") */
  appBasePath: string;
  onMobileClose?: () => void;
}

export function ProfileSection({ appBasePath, onMobileClose }: ProfileSectionProps) {
  const router = useRouter();
  const { user, signOut } = useAuth();
  const [isProfileExpanded, setIsProfileExpanded] = useState(false);

  const getUserInitials = () => {
    if (!user) return "U";
    const fullName = user.user_metadata?.full_name;
    if (fullName) {
      const names = fullName.trim().split(" ");
      if (names.length >= 2) {
        return (names[0][0] + names[names.length - 1][0]).toUpperCase();
      }
      return names[0][0].toUpperCase();
    }
    const email = user.email;
    if (email) return email[0].toUpperCase();
    return "U";
  };

  const navigate = (path: string) => {
    router.push(path);
    if (window.innerWidth < 1024) onMobileClose?.();
  };

  if (!user) return null;

  return (
    <div className="mt-auto border-t">
      <div className="p-3">
        <button
          onClick={() => setIsProfileExpanded(!isProfileExpanded)}
          className="w-full flex items-center gap-3 p-2 rounded-lg hover:bg-muted transition-colors"
        >
          <div className="flex-shrink-0 w-8 h-8 rounded-full bg-gradient-to-r from-[#1C4C8A] to-[#31DBA5] flex items-center justify-center text-white text-xs font-semibold">
            {getUserInitials()}
          </div>
          <div className="flex-1 min-w-0 text-left">
            <p className="text-sm font-medium truncate">
              {user.user_metadata?.full_name || user.email?.split("@")[0] || "User"}
            </p>
          </div>
          {isProfileExpanded ? (
            <ChevronUp className="h-4 w-4 text-muted-foreground shrink-0" />
          ) : (
            <ChevronDown className="h-4 w-4 text-muted-foreground shrink-0" />
          )}
        </button>

        {isProfileExpanded && (
          <div className="mt-2 pt-2 border-t space-y-1">
            <Button
              variant="ghost"
              className="w-full justify-start text-sm"
              onClick={() => navigate(`${appBasePath}/settings`)}
            >
              <User className="mr-2 h-4 w-4" />
              Settings
            </Button>
            <Button
              variant="ghost"
              className="w-full justify-start text-sm"
              onClick={signOut}
            >
              <LogOut className="mr-2 h-4 w-4" />
              Sign Out
            </Button>
          </div>
        )}
      </div>
    </div>
  );
}
