"use client";

import { useState } from "react";
import { Sparkles, Send } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogClose, DialogBody, DialogFooter } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/components/ui/toast";
import type { PublicPrompt, PromptTopic } from "@/types";

interface SubmitPromptModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSubmitSuccess: (prompt: PublicPrompt) => void;
}

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

export function SubmitPromptModal({
  open,
  onOpenChange,
  onSubmitSuccess,
}: SubmitPromptModalProps) {
  const { addToast } = useToast();

  const [content, setContent] = useState("");
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [topic, setTopic] = useState<string>("__none__");
  const [isGeneratingMeta, setIsGeneratingMeta] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [contentError, setContentError] = useState("");

  const resetState = () => {
    setContent("");
    setTitle("");
    setDescription("");
    setTopic("__none__");
    setIsGeneratingMeta(false);
    setIsSubmitting(false);
    setContentError("");
  };

  const handleOpenChange = (nextOpen: boolean) => {
    if (!nextOpen) {
      resetState();
    }
    onOpenChange(nextOpen);
  };

  const handleAutoGenerate = async () => {
    if (!content.trim()) {
      setContentError("Please enter a prompt first.");
      return;
    }

    setIsGeneratingMeta(true);
    try {
      const res = await fetch("/api/apps/prompt-studio/prompts/generate-metadata", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ content }),
      });

      if (!res.ok) {
        throw new Error("Failed to generate metadata");
      }

      const data = await res.json();
      if (data.title) setTitle(data.title);
      if (data.description) setDescription(data.description);
      if (data.topic) setTopic(data.topic);
    } catch (err: any) {
      addToast({
        title: "Failed to generate metadata",
        description: err.message || "Please try again.",
        variant: "destructive",
      });
    } finally {
      setIsGeneratingMeta(false);
    }
  };

  const handleSubmit = async () => {
    if (!content.trim()) {
      setContentError("Prompt content is required.");
      return;
    }
    setContentError("");

    setIsSubmitting(true);
    try {
      const res = await fetch("/api/apps/prompt-studio/prompts/submit", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          content: content.trim(),
          title: title.trim() || undefined,
          description: description.trim() || undefined,
          topic: topic === "__none__" ? undefined : topic,
        }),
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || "Failed to submit prompt");
      }

      const newPrompt: PublicPrompt = await res.json();

      addToast({
        title: "Prompt submitted!",
        description: "Your prompt has been published to the community library.",
      });

      onSubmitSuccess(newPrompt);
      handleOpenChange(false);
    } catch (err: any) {
      addToast({
        title: "Submission failed",
        description: err.message || "Please try again.",
        variant: "destructive",
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh]">
        <DialogHeader>
          <div className="flex items-center justify-between w-full">
            <DialogTitle>Submit a Prompt</DialogTitle>
            <DialogClose onClose={() => handleOpenChange(false)} />
          </div>
        </DialogHeader>
        <DialogBody>
          <div className="space-y-6">
            {/* Prompt Content */}
            <div>
              <label className="block text-sm font-medium mb-2">
                Prompt Content <span className="text-destructive">*</span>
              </label>
              <Textarea
                rows={8}
                placeholder="Paste your prompt here..."
                value={content}
                onChange={(e) => {
                  setContent(e.target.value);
                  if (e.target.value.trim()) setContentError("");
                }}
                className="font-mono bg-[#f6f6f6] dark:bg-neutral-800 border-0 focus-visible:ring-1 focus-visible:ring-offset-0 resize-none"
              />
              {contentError && (
                <p className="text-sm text-destructive mt-1">{contentError}</p>
              )}
            </div>

            {/* Metadata panel */}
            <div className="border rounded-lg p-4 space-y-4">
              <div className="flex items-center justify-between">
                <p className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">
                  Metadata (Optional)
                </p>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={handleAutoGenerate}
                  disabled={isGeneratingMeta || !content.trim()}
                >
                  <Sparkles className="mr-2 h-4 w-4" />
                  {isGeneratingMeta ? "Generating..." : "Auto-generate"}
                </Button>
              </div>

              <div>
                <label className="block text-sm font-medium mb-1">Title</label>
                <Input
                  placeholder="A short, descriptive title"
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  maxLength={100}
                />
              </div>

              <div>
                <label className="block text-sm font-medium mb-1">Description</label>
                <Input
                  placeholder="Brief description of what this prompt does"
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  maxLength={200}
                />
              </div>

              <div>
                <label className="block text-sm font-medium mb-1">Topic</label>
                <Select value={topic} onValueChange={setTopic}>
                  <SelectTrigger>
                    <SelectValue placeholder="Select a topic" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="__none__">None</SelectItem>
                    {topicOptions.map((opt) => (
                      <SelectItem key={opt.value as string} value={opt.value as string}>
                        {opt.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
          </div>
        </DialogBody>
        <DialogFooter>
          <Button variant="outline" onClick={() => handleOpenChange(false)}>
            Cancel
          </Button>
          <Button onClick={handleSubmit} disabled={isSubmitting || !content.trim()}>
            <Send className="mr-2 h-4 w-4" />
            {isSubmitting ? "Submitting..." : "Submit to Library"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
