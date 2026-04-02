"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useThreads } from "@/hooks/useThreads";
import { ChatWindow } from "@/components/chat/ChatWindow";
import { useToast } from "@/components/ui/toast";
import type { PromptType } from "@/types";

export default function ChatPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { loading, createThread } = useThreads();
  const { addToast } = useToast();

  const prefill = searchParams?.get("prefill") || "";

  const handleSend = async (content: string, promptType?: PromptType) => {
    try {
      const newThread = await createThread("New Conversation");

      if (newThread?.id) {
        const redirectUrl = `/apps/prompt-studio/chat/${newThread.id}?lazyPrompt=${encodeURIComponent(content)}&promptType=${encodeURIComponent(promptType ?? "auto")}`;
        router.push(redirectUrl);
      } else {
        throw new Error("Failed to create thread");
      }
    } catch (error: any) {
      addToast({
        title: "Error",
        description: error.message || "Failed to create conversation. Please try again.",
        variant: "destructive",
      });
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-full w-full bg-background">
        <div className="text-muted-foreground">Loading...</div>
      </div>
    );
  }

  return (
    <ChatWindow
      messages={[]}
      isLoading={false}
      onSend={handleSend}
      threadId={undefined}
      initialValue={prefill}
    />
  );
}
