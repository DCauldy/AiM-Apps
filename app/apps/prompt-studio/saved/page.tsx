"use client";

import { PromptCard } from "@/components/library/PromptCard";
import { useSavedPrompts } from "@/hooks/useSavedPrompts";
import { useLibrary } from "@/hooks/useLibrary";
import { Bookmark } from "lucide-react";

export default function SavedPromptsPage() {
  const { savedPrompts, loading, fetchSaved } = useSavedPrompts();
  const { upvotePrompt, savePrompt } = useLibrary();

  // Wrapper to refresh saved prompts after saving
  const handleSave = async (messageId: string) => {
    await savePrompt(messageId);
    // Refresh the saved prompts list
    await fetchSaved();
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-full w-full bg-background">
        <div className="text-muted-foreground">Loading saved prompts...</div>
      </div>
    );
  }

  return (
    <div className="h-full overflow-auto bg-background">
      <div className="max-w-6xl mx-auto p-6">
        <div className="mb-6">
          <div className="flex items-center gap-2 mb-4">
            <Bookmark className="h-6 w-6" />
            <h1 className="text-3xl font-bold">Bookmarked Prompts</h1>
          </div>
          <p className="text-muted-foreground">
            Your personal collection of saved prompts
          </p>
        </div>

        {savedPrompts.length === 0 ? (
          <div className="text-center py-12">
            <p className="text-muted-foreground">
              No bookmarked prompts yet. Bookmark your refined prompts from the Studio or save prompts from the community library.
            </p>
          </div>
        ) : (
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
            {savedPrompts.map((saved) => (
              saved.prompt && (
                <PromptCard
                  key={saved.id}
                  prompt={saved.prompt}
                  onUpvote={upvotePrompt}
                  onSave={handleSave}
                />
              )
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
