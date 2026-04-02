"use client";

import { useEffect, useState, useMemo } from "react";
import { Library, TrendingUp, Clock, Search, X, Filter, PlusCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { PromptCard } from "./PromptCard";
import { useAimLibrary } from "@/hooks/useAimLibrary";
import { useAuth } from "@/hooks/useAuth";
import { FilterPromptsModal, type FilterState } from "./FilterPromptsModal";
import { AddAimPromptModal } from "./AddAimPromptModal";
import { cn } from "@/lib/utils";
import type { PublicPrompt, PromptTopic } from "@/types";

type SortOption = "recent" | "popular";

export function AimLibraryPage() {
  const { prompts, loading, error, fetchPrompts, upvotePrompt, savePrompt } =
    useAimLibrary();
  const { user } = useAuth();
  const isAdmin = user?.app_metadata?.is_admin === true;

  const [sort, setSort] = useState<SortOption>("recent");
  const [searchText, setSearchText] = useState("");
  const [isFilterModalOpen, setIsFilterModalOpen] = useState(false);
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [editingPrompt, setEditingPrompt] = useState<PublicPrompt | null>(null);
  const [filters, setFilters] = useState<FilterState>({
    authors: [],
    topics: [],
    minUpvotes: null,
    dateRange: "all",
    savedOnly: false,
  });

  useEffect(() => {
    fetchPrompts(sort);
  }, [sort, fetchPrompts]);

  const filteredPrompts = useMemo(() => {
    let filtered: PublicPrompt[] = [...prompts];

    if (searchText.trim()) {
      const searchLower = searchText.toLowerCase();
      filtered = filtered.filter(
        (prompt) =>
          prompt.content.toLowerCase().includes(searchLower) ||
          prompt.title?.toLowerCase().includes(searchLower) ||
          prompt.description?.toLowerCase().includes(searchLower)
      );
    }

    if (filters.dateRange !== "all") {
      const now = new Date();
      const cutoffDate = new Date();

      switch (filters.dateRange) {
        case "week":
          cutoffDate.setDate(now.getDate() - 7);
          break;
        case "month":
          cutoffDate.setMonth(now.getMonth() - 1);
          break;
        case "3months":
          cutoffDate.setMonth(now.getMonth() - 3);
          break;
        case "6months":
          cutoffDate.setMonth(now.getMonth() - 6);
          break;
      }

      filtered = filtered.filter((prompt) => {
        const promptDate = new Date(prompt.created_at);
        return promptDate >= cutoffDate;
      });
    }

    if (filters.minUpvotes !== null) {
      filtered = filtered.filter(
        (prompt) => prompt.upvote_count >= filters.minUpvotes!
      );
    }

    if (filters.topics.length > 0) {
      filtered = filtered.filter((prompt) =>
        prompt.topic && filters.topics.includes(prompt.topic as PromptTopic)
      );
    }

    if (filters.savedOnly) {
      filtered = filtered.filter((prompt) => prompt.is_saved);
    }

    if (sort === "popular") {
      filtered.sort((a, b) => b.upvote_count - a.upvote_count);
    } else {
      filtered.sort(
        (a, b) =>
          new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
      );
    }

    return filtered;
  }, [prompts, searchText, filters, sort]);

  const hasActiveFilters =
    filters.topics.length > 0 ||
    filters.minUpvotes !== null ||
    filters.dateRange !== "all" ||
    filters.savedOnly;

  const activeFilterCount =
    (filters.minUpvotes !== null ? 1 : 0) +
    (filters.dateRange !== "all" ? 1 : 0) +
    (filters.savedOnly ? 1 : 0);

  if (loading && prompts.length === 0) {
    return (
      <div className="flex items-center justify-center h-full w-full bg-background">
        <div className="text-muted-foreground">Loading prompts...</div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex items-center justify-center h-full w-full bg-background">
        <div className="text-destructive">{error}</div>
      </div>
    );
  }

  return (
    <div className="h-full overflow-auto bg-background">
      <div className="max-w-6xl mx-auto p-6">
        <div className="mb-6">
          <div className="flex items-center gap-2 mb-4">
            <Library className="h-6 w-6" />
            <h1 className="text-3xl font-bold">AiM Library</h1>
          </div>
          <p className="text-muted-foreground mb-4">
            Curated prompts from the AiM Academy team
          </p>

          {/* Search Bar */}
          <div className="relative mb-4">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              type="text"
              placeholder="Search prompts..."
              value={searchText}
              onChange={(e) => setSearchText(e.target.value)}
              className="pl-10 pr-10"
            />
            {searchText && (
              <Button
                variant="ghost"
                size="icon"
                className="absolute right-1 top-1/2 transform -translate-y-1/2 h-8 w-8"
                onClick={() => setSearchText("")}
              >
                <X className="h-4 w-4" />
              </Button>
            )}
          </div>

          {/* Sort and Filter Buttons */}
          <div className="flex gap-2 items-center">
            <Button
              variant={sort === "recent" ? "default" : "outline"}
              size="sm"
              onClick={() => setSort("recent")}
            >
              <Clock className="mr-2 h-4 w-4" />
              Recent
            </Button>
            <Button
              variant={sort === "popular" ? "default" : "outline"}
              size="sm"
              onClick={() => setSort("popular")}
            >
              <TrendingUp className="mr-2 h-4 w-4" />
              Popular
            </Button>
            <Button
              variant={hasActiveFilters ? "default" : "outline"}
              size="sm"
              onClick={() => setIsFilterModalOpen(true)}
            >
              <Filter className="mr-2 h-4 w-4" />
              Filter Prompts
              {activeFilterCount > 0 && (
                <span
                  className={cn(
                    "ml-2 rounded-full px-2 py-0.5 text-xs font-medium",
                    hasActiveFilters
                      ? "bg-white/20 text-white"
                      : "bg-primary text-primary-foreground"
                  )}
                >
                  {activeFilterCount}
                </span>
              )}
            </Button>
            {isAdmin && (
              <Button
                variant="default"
                size="sm"
                className="ml-auto"
                onClick={() => setIsAddModalOpen(true)}
              >
                <PlusCircle className="mr-2 h-4 w-4" />
                Add Prompt
              </Button>
            )}
          </div>

          {/* Results Count */}
          {(searchText || hasActiveFilters) && (
            <p className="text-sm text-muted-foreground mt-4">
              Showing {filteredPrompts.length} of {prompts.length} prompts
            </p>
          )}
        </div>

        {prompts.length === 0 ? (
          <div className="text-center py-12">
            <p className="text-muted-foreground">
              No AiM Library prompts yet.
              {isAdmin && " Use the Add Prompt button to add the first one!"}
            </p>
          </div>
        ) : filteredPrompts.length === 0 ? (
          <div className="text-center py-12">
            <p className="text-muted-foreground">
              No prompts found matching your search and filters.
            </p>
            <Button
              variant="outline"
              size="sm"
              className="mt-4"
              onClick={() => {
                setSearchText("");
                setFilters({
                  authors: [],
                  topics: [],
                  minUpvotes: null,
                  dateRange: "all",
                  savedOnly: false,
                });
              }}
            >
              Clear all filters
            </Button>
          </div>
        ) : (
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
            {filteredPrompts.map((prompt) => (
              <PromptCard
                key={prompt.id}
                prompt={prompt}
                currentUserId={user?.id}
                isAdminOverride={isAdmin}
                deleteUrl={`/api/apps/prompt-studio/aim-library/${prompt.id}`}
                onUpvote={upvotePrompt}
                onSave={savePrompt}
                onEdit={setEditingPrompt}
                onDelete={() => fetchPrompts(sort)}
              />
            ))}
          </div>
        )}
      </div>

      {/* Filter Modal */}
      <FilterPromptsModal
        open={isFilterModalOpen}
        onOpenChange={setIsFilterModalOpen}
        prompts={prompts}
        filters={filters}
        onFiltersChange={setFilters}
        isAuthenticated={!!user}
      />

      {/* Add Prompt Modal */}
      <AddAimPromptModal
        open={isAddModalOpen}
        onOpenChange={setIsAddModalOpen}
        onSubmitSuccess={() => fetchPrompts(sort)}
      />

      {/* Edit Prompt Modal */}
      <AddAimPromptModal
        open={!!editingPrompt}
        onOpenChange={(open) => {
          if (!open) setEditingPrompt(null);
        }}
        editingPrompt={editingPrompt}
        onSubmitSuccess={() => fetchPrompts(sort)}
      />
    </div>
  );
}
