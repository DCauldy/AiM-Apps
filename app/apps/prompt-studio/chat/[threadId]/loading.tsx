"use client";

export default function ThreadLoading() {
  return (
    <div className="flex flex-col items-center justify-center h-full min-h-[600px]">
      <div className="flex flex-col items-center gap-4">
        {/* Loading dots animation */}
        <div className="flex items-center gap-2">
          <div className="typing-dot"></div>
          <div className="typing-dot"></div>
          <div className="typing-dot"></div>
        </div>
        <p className="text-muted-foreground text-sm">Loading conversation...</p>
      </div>
    </div>
  );
}
