"use client";

import { useState, useEffect, useMemo, useRef } from "react";
import { X, User, TrendingUp, Calendar, Heart, Search, Check, Tag } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogClose, DialogBody, DialogFooter } from "@/components/ui/dialog";
import { cn } from "@/lib/utils";
import type { PublicPrompt, PromptTopic } from "@/types";

export interface FilterState {
  authors: string[];
  topics: PromptTopic[];
  minUpvotes: number | null;
  dateRange: "all" | "week" | "month" | "3months" | "6months";
  savedOnly: boolean;
}

interface FilterPromptsModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  prompts: PublicPrompt[];
  filters: FilterState;
  onFiltersChange: (filters: FilterState) => void;
  isAuthenticated: boolean;
}

export function FilterPromptsModal({
  open,
  onOpenChange,
  prompts,
  filters,
  onFiltersChange,
  isAuthenticated,
}: FilterPromptsModalProps) {
  const [localFilters, setLocalFilters] = useState<FilterState>(filters);
  const [authorSearch, setAuthorSearch] = useState("");
  const [authorDropdownOpen, setAuthorDropdownOpen] = useState(false);
  const authorSearchRef = useRef<HTMLInputElement>(null);
  const authorDropdownRef = useRef<HTMLDivElement>(null);

  // Sync local filters when props change
  useEffect(() => {
    setLocalFilters(filters);
  }, [filters]);

  // Get unique authors from prompts
  const authorsMap = useMemo(() => {
    const map = new Map<string, { name: string; count: number }>();
    prompts.forEach((prompt) => {
      if (prompt.author_name && prompt.user_id) {
        const existing = map.get(prompt.user_id);
        if (existing) {
          existing.count++;
        } else {
          map.set(prompt.user_id, {
            name: prompt.author_name,
            count: 1,
          });
        }
      }
    });
    return map;
  }, [prompts]);

  const authors = useMemo(() => {
    return Array.from(authorsMap.entries())
      .map(([id, data]) => ({ id, ...data }))
      .sort((a, b) => b.count - a.count);
  }, [authorsMap]);

  // Filter authors based on search
  const filteredAuthors = useMemo(() => {
    if (!authorSearch.trim()) {
      return authors.slice(0, 50); // Show top 50 when no search
    }
    const searchLower = authorSearch.toLowerCase();
    return authors
      .filter((author) => author.name.toLowerCase().includes(searchLower))
      .slice(0, 50); // Limit to 50 results
  }, [authors, authorSearch]);

  // Get selected author names
  const selectedAuthors = useMemo(() => {
    return localFilters.authors
      .map((id) => {
        const author = authorsMap.get(id);
        return author ? { id, name: author.name, count: author.count } : null;
      })
      .filter((a): a is { id: string; name: string; count: number } => a !== null);
  }, [localFilters.authors, authorsMap]);

  // Handle clicks outside author dropdown
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (
        authorDropdownRef.current &&
        !authorDropdownRef.current.contains(event.target as Node) &&
        authorSearchRef.current &&
        !authorSearchRef.current.contains(event.target as Node)
      ) {
        setAuthorDropdownOpen(false);
      }
    };

    if (authorDropdownOpen) {
      document.addEventListener("mousedown", handleClickOutside);
      return () => document.removeEventListener("mousedown", handleClickOutside);
    }
  }, [authorDropdownOpen]);

  const upvoteOptions = [
    { label: "All", value: null },
    { label: "10+ upvotes", value: 10 },
    { label: "25+ upvotes", value: 25 },
    { label: "50+ upvotes", value: 50 },
    { label: "100+ upvotes", value: 100 },
  ];

  const dateRangeOptions: Array<{ label: string; value: FilterState["dateRange"] }> = [
    { label: "All time", value: "all" },
    { label: "This week", value: "week" },
    { label: "This month", value: "month" },
    { label: "Last 3 months", value: "3months" },
    { label: "Last 6 months", value: "6months" },
  ];

  const handleAuthorToggle = (authorId: string) => {
    setLocalFilters((prev) => {
      const newAuthors = prev.authors.includes(authorId)
        ? prev.authors.filter((id) => id !== authorId)
        : [...prev.authors, authorId];
      return { ...prev, authors: newAuthors };
    });
    // Don't close dropdown, allow multiple selections
  };

  const handleRemoveAuthor = (authorId: string) => {
    setLocalFilters((prev) => ({
      ...prev,
      authors: prev.authors.filter((id) => id !== authorId),
    }));
  };

  // Get unique topics from prompts
  const topicsMap = useMemo(() => {
    const map = new Map<PromptTopic, number>();
    prompts.forEach((prompt) => {
      if (prompt.topic) {
        // Type assert topic as PromptTopic since we know it's a valid value from the database
        const topic = prompt.topic as PromptTopic;
        map.set(topic, (map.get(topic) || 0) + 1);
      }
    });
    return map;
  }, [prompts]);

  const topicOptions: Array<{ value: PromptTopic; label: string }> = [
    { value: "marketing", label: "Marketing" },
    { value: "development", label: "Development" },
    { value: "content", label: "Content Writing" },
    { value: "research", label: "Research" },
    { value: "business", label: "Business" },
    { value: "education", label: "Education" },
    { value: "creative", label: "Creative" },
    { value: "analysis", label: "Analysis" },
    { value: "productivity", label: "Productivity" },
    { value: "other", label: "Other" },
  ];

  const handleTopicToggle = (topic: PromptTopic) => {
    setLocalFilters((prev) => {
      const newTopics = prev.topics.includes(topic)
        ? prev.topics.filter((t) => t !== topic)
        : [...prev.topics, topic];
      return { ...prev, topics: newTopics };
    });
  };

  const handleRemoveTopic = (topic: PromptTopic) => {
    setLocalFilters((prev) => ({
      ...prev,
      topics: prev.topics.filter((t) => t !== topic),
    }));
  };

  const handleUpvoteChange = (value: number | null) => {
    setLocalFilters((prev) => ({ ...prev, minUpvotes: value }));
  };

  const handleDateRangeChange = (value: FilterState["dateRange"]) => {
    setLocalFilters((prev) => ({ ...prev, dateRange: value }));
  };

  const handleSavedToggle = () => {
    setLocalFilters((prev) => ({ ...prev, savedOnly: !prev.savedOnly }));
  };

  const handleClearAll = () => {
    const clearedFilters: FilterState = {
      authors: [],
      topics: [],
      minUpvotes: null,
      dateRange: "all",
      savedOnly: false,
    };
    setLocalFilters(clearedFilters);
    onFiltersChange(clearedFilters);
  };

  const handleApply = () => {
    onFiltersChange(localFilters);
    onOpenChange(false);
  };

  const handleCancel = () => {
    setLocalFilters(filters); // Reset to current filters
    onOpenChange(false);
  };

  const hasActiveFilters =
    localFilters.authors.length > 0 ||
    localFilters.topics.length > 0 ||
    localFilters.minUpvotes !== null ||
    localFilters.dateRange !== "all" ||
    localFilters.savedOnly;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh]">
        <DialogHeader>
          <div className="flex items-center justify-between w-full">
            <DialogTitle>Filter Prompts</DialogTitle>
            <DialogClose onClose={handleCancel} />
          </div>
        </DialogHeader>
        <DialogBody>
          <div className="space-y-8">
            {/* Author Filter */}
            <div>
              <div className="flex items-center gap-2 mb-3">
                <User className="h-5 w-5 text-muted-foreground" />
                <h3 className="font-semibold">Author</h3>
              </div>
              <p className="text-sm text-muted-foreground mb-4">
                Search and select authors to filter by
              </p>
              
              {/* Selected Authors - Display as chips */}
              {selectedAuthors.length > 0 && (
                <div className="flex flex-wrap gap-2 mb-3">
                  {selectedAuthors.map((author) => (
                    <div
                      key={author.id}
                      className="inline-flex items-center gap-2 px-3 py-1.5 bg-primary text-primary-foreground rounded-md text-sm"
                    >
                      <span>{author.name}</span>
                      <button
                        type="button"
                        onClick={() => handleRemoveAuthor(author.id)}
                        className="hover:opacity-70 transition-opacity"
                        aria-label={`Remove ${author.name}`}
                      >
                        <X className="h-3 w-3" />
                      </button>
                    </div>
                  ))}
                </div>
              )}

              {/* Search Input */}
              <div className="relative">
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                  <Input
                    ref={authorSearchRef}
                    type="text"
                    placeholder="Search authors..."
                    value={authorSearch}
                    onChange={(e) => {
                      setAuthorSearch(e.target.value);
                      setAuthorDropdownOpen(true);
                    }}
                    onFocus={() => setAuthorDropdownOpen(true)}
                    className="pl-10 pr-10"
                  />
                  {authorSearch && (
                    <button
                      type="button"
                      onClick={() => {
                        setAuthorSearch("");
                        setAuthorDropdownOpen(false);
                      }}
                      className="absolute right-3 top-1/2 transform -translate-y-1/2 text-muted-foreground hover:text-foreground"
                    >
                      <X className="h-4 w-4" />
                    </button>
                  )}
                </div>

                {/* Author Dropdown */}
                {authorDropdownOpen && (
                  <div
                    ref={authorDropdownRef}
                    className="absolute z-50 w-full mt-1 bg-white border border-gray-200 rounded-md shadow-lg max-h-64 overflow-y-auto"
                  >
                    {filteredAuthors.length === 0 ? (
                      <div className="px-4 py-3 text-sm text-muted-foreground">
                        {authorSearch.trim()
                          ? "No authors found"
                          : "Start typing to search authors..."}
                      </div>
                    ) : (
                      <div className="py-1">
                        {filteredAuthors.map((author) => {
                          const isSelected = localFilters.authors.includes(author.id);
                          return (
                            <button
                              key={author.id}
                              type="button"
                              onClick={() => handleAuthorToggle(author.id)}
                              className={cn(
                                "w-full px-4 py-2 text-left text-sm hover:bg-gray-100 flex items-center justify-between transition-colors",
                                isSelected && "bg-primary/10"
                              )}
                            >
                              <div className="flex items-center gap-2">
                                <span className="font-medium">{author.name}</span>
                                <span className="text-xs text-muted-foreground">
                                  ({author.count} prompt{author.count !== 1 ? "s" : ""})
                                </span>
                              </div>
                              {isSelected && (
                                <Check className="h-4 w-4 text-primary" />
                              )}
                            </button>
                          );
                        })}
                        {filteredAuthors.length === 50 && (
                          <div className="px-4 py-2 text-xs text-muted-foreground border-t">
                            Showing first 50 results. Refine your search for more specific results.
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                )}
              </div>

              {selectedAuthors.length > 0 && (
                <p className="text-xs text-muted-foreground mt-2">
                  {selectedAuthors.length} author{selectedAuthors.length !== 1 ? "s" : ""} selected
                </p>
              )}
            </div>

            {/* Topic Filter */}
            <div>
              <div className="flex items-center gap-2 mb-3">
                <Tag className="h-5 w-5 text-muted-foreground" />
                <h3 className="font-semibold">Topic</h3>
              </div>
              <p className="text-sm text-muted-foreground mb-4">
                Filter prompts by topic or category
              </p>

              {/* Selected Topics - Display as chips */}
              {localFilters.topics.length > 0 && (
                <div className="flex flex-wrap gap-2 mb-3">
                  {localFilters.topics.map((topic) => {
                    const topicOption = topicOptions.find((opt) => opt.value === topic);
                    if (!topicOption) return null;
                    return (
                      <div
                        key={topic}
                        className="inline-flex items-center gap-2 px-3 py-1.5 bg-primary text-primary-foreground rounded-md text-sm"
                      >
                        <span>{topicOption.label}</span>
                        {topicsMap.has(topic) && (
                          <span className="text-xs opacity-80">
                            ({topicsMap.get(topic)})
                          </span>
                        )}
                        <button
                          type="button"
                          onClick={() => handleRemoveTopic(topic)}
                          className="hover:opacity-70 transition-opacity"
                          aria-label={`Remove ${topicOption.label}`}
                        >
                          <X className="h-3 w-3" />
                        </button>
                      </div>
                    );
                  })}
                </div>
              )}

              {/* Topic Options */}
              <div className="flex flex-wrap gap-2">
                {topicOptions.map((option) => {
                  const isSelected = localFilters.topics.includes(option.value);
                  const count = topicsMap.get(option.value) || 0;
                  return (
                    <Button
                      key={option.value}
                      variant={isSelected ? "default" : "outline"}
                      size="sm"
                      onClick={() => handleTopicToggle(option.value)}
                      className={cn(
                        "text-sm",
                        isSelected && "bg-primary text-primary-foreground"
                      )}
                      disabled={!option.value || count === 0}
                    >
                      {option.label}
                      {count > 0 && (
                        <span className={cn(
                          "ml-2 text-xs",
                          isSelected ? "opacity-80" : "text-muted-foreground"
                        )}>
                          ({count})
                        </span>
                      )}
                    </Button>
                  );
                })}
              </div>

              {localFilters.topics.length > 0 && (
                <p className="text-xs text-muted-foreground mt-2">
                  {localFilters.topics.length} topic{localFilters.topics.length !== 1 ? "s" : ""} selected
                </p>
              )}
            </div>

            {/* Upvote Count Filter */}
            <div>
              <div className="flex items-center gap-2 mb-3">
                <TrendingUp className="h-5 w-5 text-muted-foreground" />
                <h3 className="font-semibold">Upvote Count</h3>
              </div>
              <p className="text-sm text-muted-foreground mb-4">
                Filter by minimum number of upvotes
              </p>
              <div className="flex flex-wrap gap-2">
                {upvoteOptions.map((option) => {
                  const isSelected = localFilters.minUpvotes === option.value;
                  return (
                    <Button
                      key={option.label}
                      variant={isSelected ? "default" : "outline"}
                      size="sm"
                      onClick={() => handleUpvoteChange(option.value)}
                      className={cn(
                        isSelected && "bg-primary text-primary-foreground"
                      )}
                    >
                      {option.label}
                    </Button>
                  );
                })}
              </div>
            </div>

            {/* Date Range Filter */}
            <div>
              <div className="flex items-center gap-2 mb-3">
                <Calendar className="h-5 w-5 text-muted-foreground" />
                <h3 className="font-semibold">Date Range</h3>
              </div>
              <p className="text-sm text-muted-foreground mb-4">
                Filter by when prompts were created
              </p>
              <div className="flex flex-wrap gap-2">
                {dateRangeOptions.map((option) => {
                  const isSelected = localFilters.dateRange === option.value;
                  return (
                    <Button
                      key={option.value}
                      variant={isSelected ? "default" : "outline"}
                      size="sm"
                      onClick={() => handleDateRangeChange(option.value)}
                      className={cn(
                        isSelected && "bg-primary text-primary-foreground"
                      )}
                    >
                      {option.label}
                    </Button>
                  );
                })}
              </div>
            </div>

            {/* Saved Prompts Toggle */}
            {isAuthenticated && (
              <div>
                <div className="flex items-center gap-2 mb-3">
                  <Heart className="h-5 w-5 text-muted-foreground" />
                  <h3 className="font-semibold">Saved Prompts</h3>
                </div>
                <p className="text-sm text-muted-foreground mb-4">
                  Show only prompts you've saved
                </p>
                <Button
                  variant={localFilters.savedOnly ? "default" : "outline"}
                  size="sm"
                  onClick={handleSavedToggle}
                  className={cn(
                    localFilters.savedOnly && "bg-primary text-primary-foreground"
                  )}
                >
                  <Heart
                    className={cn(
                      "mr-2 h-4 w-4",
                      localFilters.savedOnly ? "fill-current" : ""
                    )}
                  />
                  Show Only Saved Prompts
                </Button>
              </div>
            )}
          </div>
        </DialogBody>
        <DialogFooter>
          <Button
            variant="outline"
            onClick={handleClearAll}
            disabled={!hasActiveFilters}
          >
            <X className="mr-2 h-4 w-4" />
            Clear All
          </Button>
          <Button variant="outline" onClick={handleCancel}>
            Cancel
          </Button>
          <Button onClick={handleApply}>
            <Search className="mr-2 h-4 w-4" />
            Show Results
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}


