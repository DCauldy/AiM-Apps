"use client";

import { useState } from "react";
import { usePathname } from "next/navigation";
import { PanelLeft } from "lucide-react";
import Image from "next/image";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { ConversationHeader } from "@/components/chat/ConversationHeader";
import { HowToUseModal } from "@/components/ui/HowToUseModal";
import { ThemeToggle } from "@/components/theme/ThemeToggle";
import { UserMenu } from "./UserMenu";

interface HeaderProps {
  onSidebarToggle?: () => void;
  isSidebarOpen?: boolean;
  threadId?: string | null;
  threadTitle?: string;
  isStarred?: boolean;
  onRename?: (newTitle: string) => Promise<void>;
  onToggleStar?: () => Promise<void>;
  onDelete?: () => Promise<void>;
}

export function Header({
  onSidebarToggle,
  isSidebarOpen = true,
  threadId,
  threadTitle,
  isStarred,
  onRename,
  onToggleStar,
  onDelete,
}: HeaderProps) {
  const [isHelpModalOpen, setIsHelpModalOpen] = useState(false);
  const pathname = usePathname();
  
  const isInApp = pathname?.startsWith("/apps/prompt-studio");

  return (
    <>
      <header className="border-b bg-background">
        <div className="flex h-14 items-center justify-between px-4 sm:px-6 gap-4">
          <div className="flex items-center gap-2 sm:gap-3 flex-shrink-0">
            {/* Sidebar toggle button - works for both mobile and desktop */}
            {onSidebarToggle && (
              <Button
                variant="ghost"
                size="icon"
                onClick={onSidebarToggle}
                title={isSidebarOpen ? "Close sidebar" : "Open sidebar"}
              >
                <PanelLeft className="h-4 w-4 sm:h-5 w-5" />
              </Button>
            )}
            <Link href="/apps/prompt-studio" className="flex items-center gap-2 sm:gap-3">
              <Image
                src="/logo.svg"
                alt="AiM Academy"
                width={120}
                height={34}
                className="h-7 w-auto sm:h-8 dark:hidden"
                priority
              />
              <Image
                src="/logo-dark.svg"
                alt="AiM Academy"
                width={120}
                height={34}
                className="h-7 w-auto sm:h-8 hidden dark:block"
                priority
              />
              <span className="text-lg sm:text-xl font-bold text-foreground font-sans">
                Prompt Studio
              </span>
            </Link>
          </div>
          
          {/* Conversation header badge - centered */}
          {threadId && threadTitle && onRename && onToggleStar && onDelete ? (
            <div className="flex-1 flex justify-center">
              <ConversationHeader
                title={threadTitle}
                threadId={threadId}
                isStarred={isStarred}
                onRename={onRename}
                onToggleStar={onToggleStar}
                onDelete={onDelete}
              />
            </div>
          ) : (
            <div className="flex-1" />
          )}
          
          {/* Theme toggle, Help button, and User menu */}
          <div className="flex items-center gap-2 flex-shrink-0">
            <ThemeToggle />
            {/* Only show help button in prompt-studio app */}
            {isInApp && (
              <Button
                variant="ghost"
                size="icon"
                onClick={() => setIsHelpModalOpen(true)}
                title="How to use Prompt Studio"
                className="text-foreground hover:bg-accent relative"
              >
                <div className="help-icon-wrapper">
                  <svg
                    xmlns="http://www.w3.org/2000/svg"
                    viewBox="0 0 24 24"
                    fill="none"
                    strokeWidth="2.5"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    className="h-5 w-5 sm:h-6 sm:w-6"
                  >
                    <defs>
                      <linearGradient id="helpIconGradient" x1="0%" y1="0%" x2="0%" y2="100%" gradientUnits="userSpaceOnUse">
                        <stop offset="0%" stopColor="#31DBA5" />
                        <stop offset="50%" stopColor="#25B88A" />
                        <stop offset="100%" stopColor="#1C4C8A" />
                      </linearGradient>
                    </defs>
                    {/* HelpCircle icon paths with gradient */}
                    <circle cx="12" cy="12" r="10" stroke="url(#helpIconGradient)" />
                    <path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3" stroke="url(#helpIconGradient)" />
                    {/* Dot at bottom of question mark */}
                    <circle cx="12" cy="17" r="0.35" fill="#317196" />
                  </svg>
                </div>
              </Button>
            )}
            <UserMenu />
          </div>
        </div>
      </header>
      
      <HowToUseModal open={isHelpModalOpen} onOpenChange={setIsHelpModalOpen} />
    </>
  );
}

