"use client";

import { useState, useCallback } from "react";
import type { PublicPrompt } from "@/types";

export function useLibrary() {
  const [prompts, setPrompts] = useState<PublicPrompt[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchPrompts = useCallback(
    async (sort: "recent" | "popular" = "recent", limit = 20, offset = 0) => {
      try {
        setLoading(true);
        setError(null);
        const response = await fetch(
          `/api/apps/prompt-studio/library?sort=${sort}&limit=${limit}&offset=${offset}`
        );
        
        if (!response.ok) {
          const errorData = await response.json().catch(() => ({}));
          throw new Error(errorData.error || "Failed to fetch prompts");
        }
        
        const data = await response.json();
        
        // Check if this is a migration required response
        if (data.error === "MIGRATION_REQUIRED") {
          setError(data.message || "Library migration required");
          setPrompts([]);
          return;
        }
        
        // Check if data is an array (success) or error object
        if (Array.isArray(data)) {
          setPrompts(data);
        } else if (data.error) {
          throw new Error(data.error);
        } else {
          setPrompts([]);
        }
      } catch (err: any) {
        console.error("Error fetching prompts:", err);
        setError(err.message || "Failed to load prompts. Please try again later.");
        setPrompts([]); // Clear prompts on error
      } finally {
        setLoading(false);
      }
    },
    []
  );

  const upvotePrompt = useCallback(async (messageId: string) => {
    try {
      const response = await fetch("/api/apps/prompt-studio/upvotes", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ messageId }),
      });

      if (!response.ok) {
        throw new Error("Failed to upvote");
      }

      const { upvoted } = await response.json();

      // Update local state
      setPrompts((prev) =>
        prev.map((prompt) => {
          if (prompt.message_id === messageId) {
            return {
              ...prompt,
              has_upvoted: upvoted,
              upvote_count: upvoted
                ? prompt.upvote_count + 1
                : prompt.upvote_count - 1,
            };
          }
          return prompt;
        })
      );

      return upvoted;
    } catch (err: any) {
      setError(err.message || "Failed to upvote");
      throw err;
    }
  }, []);

  const savePrompt = useCallback(async (messageId: string) => {
    try {
      const response = await fetch("/api/apps/prompt-studio/saved", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ messageId }),
      });

      if (!response.ok) {
        throw new Error("Failed to save prompt");
      }

      const { saved } = await response.json();

      // Update local state
      setPrompts((prev) =>
        prev.map((prompt) => {
          if (prompt.message_id === messageId) {
            return {
              ...prompt,
              is_saved: saved,
            };
          }
          return prompt;
        })
      );

      return saved;
    } catch (err: any) {
      setError(err.message || "Failed to save prompt");
      throw err;
    }
  }, []);

  return {
    prompts,
    loading,
    error,
    fetchPrompts,
    upvotePrompt,
    savePrompt,
  };
}

