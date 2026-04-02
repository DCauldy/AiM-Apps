"use client";

import { useState, useCallback } from "react";
import type { PublicPrompt } from "@/types";

export function useAimLibrary() {
  const [prompts, setPrompts] = useState<PublicPrompt[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchPrompts = useCallback(
    async (sort: "recent" | "popular" = "recent") => {
      try {
        setLoading(true);
        setError(null);
        const response = await fetch(
          `/api/apps/prompt-studio/aim-library?sort=${sort}`
        );

        if (!response.ok) {
          const errorData = await response.json().catch(() => ({}));
          throw new Error(errorData.error || "Failed to fetch prompts");
        }

        const data = await response.json();

        if (Array.isArray(data)) {
          setPrompts(data);
        } else if (data.error) {
          throw new Error(data.error);
        } else {
          setPrompts([]);
        }
      } catch (err: any) {
        console.error("Error fetching AiM Library prompts:", err);
        setError(err.message || "Failed to load prompts. Please try again later.");
        setPrompts([]);
      } finally {
        setLoading(false);
      }
    },
    []
  );

  const upvotePrompt = useCallback(async (promptId: string) => {
    try {
      const response = await fetch(
        `/api/apps/prompt-studio/aim-library/${promptId}/upvote`,
        { method: "POST" }
      );

      if (!response.ok) {
        throw new Error("Failed to upvote");
      }

      const { upvoted } = await response.json();

      setPrompts((prev) =>
        prev.map((prompt) => {
          if (prompt.message_id === promptId) {
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

  const savePrompt = useCallback(async (promptId: string) => {
    try {
      const response = await fetch(
        `/api/apps/prompt-studio/aim-library/${promptId}/save`,
        { method: "POST" }
      );

      if (!response.ok) {
        throw new Error("Failed to save prompt");
      }

      const { saved } = await response.json();

      setPrompts((prev) =>
        prev.map((prompt) => {
          if (prompt.message_id === promptId) {
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
