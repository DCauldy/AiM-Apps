"use client";

import { useState, useEffect, useCallback } from "react";
import type { SavedPrompt } from "@/types";

export function useSavedPrompts() {
  const [savedPrompts, setSavedPrompts] = useState<SavedPrompt[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchSaved = useCallback(async () => {
    try {
      setLoading(true);
      const response = await fetch("/api/apps/prompt-studio/saved");
      if (!response.ok) {
        throw new Error("Failed to fetch saved prompts");
      }
      const data = await response.json();
      setSavedPrompts(data);
      setError(null);
    } catch (err: any) {
      setError(err.message || "Failed to load saved prompts");
    } finally {
      setLoading(false);
    }
  }, []);

  const removeSaved = useCallback((messageId: string) => {
    setSavedPrompts((prev) =>
      prev.filter((sp) => sp.message_id !== messageId)
    );
  }, []);

  useEffect(() => {
    fetchSaved();
  }, [fetchSaved]);

  return {
    savedPrompts,
    loading,
    error,
    fetchSaved,
    removeSaved,
  };
}

