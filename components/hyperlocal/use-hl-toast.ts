"use client";

import { useToast } from "@/components/ui/toast";

export function useHlToast() {
  const { addToast } = useToast();
  return {
    success: (msg: string, description?: string) =>
      addToast({ title: msg, description, variant: "default" }),
    error: (msg: string, description?: string) =>
      addToast({ title: msg, description, variant: "destructive" }),
  };
}
