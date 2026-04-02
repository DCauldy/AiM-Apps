"use client";

import { useEffect, useState } from "react";
import { useParams, useSearchParams, useRouter } from "next/navigation";
import { PromptStudioShell } from "@/components/prompt-studio/PromptStudioShell";
import { useConversation } from "../../layout-client";
import type { PromptType } from "@/types";

export default function ThreadChatPage() {
  const params = useParams();
  const searchParams = useSearchParams();
  const router = useRouter();
  const threadId = params?.threadId as string | undefined;
  const conversation = useConversation();

  // Extract lazy prompt and prompt type from URL
  const [initialLazyPrompt] = useState(() => searchParams?.get("lazyPrompt") || "");
  const [promptType] = useState<PromptType>(
    () => (searchParams?.get("promptType") as PromptType) || "auto"
  );

  // Set up conversation context handlers for rename/star/delete in header
  useEffect(() => {
    if (!threadId || !conversation) return;

    const handleRename = async (newTitle: string) => {
      const response = await fetch(
        `/api/apps/prompt-studio/threads/${threadId}`,
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ title: newTitle }),
        }
      );
      if (!response.ok) throw new Error("Failed to rename");
      conversation.setThreadData({
        threadId,
        threadTitle: newTitle,
        isStarred: conversation.isStarred,
      });
      window.dispatchEvent(new CustomEvent("threads-refresh"));
    };

    const handleDelete = async () => {
      const response = await fetch(
        `/api/apps/prompt-studio/threads/${threadId}`,
        { method: "DELETE" }
      );
      if (!response.ok) throw new Error("Failed to delete");
      router.replace("/apps/prompt-studio/chat");
    };

    conversation.setHandlers({ onRename: handleRename, onDelete: handleDelete });

    // Load thread title
    fetch(`/api/apps/prompt-studio/threads/${threadId}`)
      .then((r) => r.ok ? r.json() : null)
      .then((data) => {
        if (data) {
          conversation.setThreadData({
            threadId,
            threadTitle: data.title || "New Conversation",
            isStarred: data.starred === true,
          });
        }
      })
      .catch(() => {});
  }, [threadId]);

  // Clear lazyPrompt from URL after reading it
  useEffect(() => {
    if (searchParams?.get("lazyPrompt")) {
      const url = new URL(window.location.href);
      url.searchParams.delete("lazyPrompt");
      window.history.replaceState({}, "", url.toString());
    }
  }, []);

  if (!threadId) {
    return (
      <div className="flex items-center justify-center h-full">
        <div className="text-muted-foreground text-sm">Loading...</div>
      </div>
    );
  }

  return (
    <PromptStudioShell
      threadId={threadId}
      initialLazyPrompt={initialLazyPrompt}
      promptType={promptType}
    />
  );
}
