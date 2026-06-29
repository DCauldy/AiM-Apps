import { Skeleton } from "@/components/ui/skeleton";
import { ChatMessageSkeleton } from "./skeletons";

// Mirrors the chat conversation surface during navigation /
// thread-fetch. Drawn with an alternating user/assistant pattern so
// the eye reads it as "scrollback loading" instead of "spinner."
// The input area at the bottom is the same fixture as the loaded
// chat — when the real messages stream in, only the scrollback
// region changes.
export function ChatPageSkeleton() {
  return (
    <div className="flex flex-col h-full">
      {/* Scrollback */}
      <div className="flex-1 overflow-hidden px-4 sm:px-6 py-6">
        <div className="max-w-3xl mx-auto space-y-6">
          <ChatMessageSkeleton role="user" />
          <ChatMessageSkeleton role="assistant" />
          <ChatMessageSkeleton role="user" />
          <ChatMessageSkeleton role="assistant" />
        </div>
      </div>

      {/* Input area */}
      <div className="border-t border-border bg-card/50 px-4 sm:px-6 py-4">
        <div className="max-w-3xl mx-auto">
          <Skeleton className="h-24 w-full rounded-xl" />
          <div className="mt-2 flex items-center justify-between">
            <Skeleton className="h-7 w-32 rounded-md" />
            <Skeleton className="h-9 w-24 rounded-md" />
          </div>
        </div>
      </div>
    </div>
  );
}
