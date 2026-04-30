"use client";

import { useState } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { ThumbsUp, Bookmark, Copy, Check, User, Eye, Pencil, Trash2, Lock } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogClose, DialogBody } from "@/components/ui/dialog";
import { cn, formatDate } from "@/lib/utils";
import { useToast } from "@/components/ui/toast";
import type { PublicPrompt } from "@/types";

const AIM_UPGRADE_URL =
  process.env.NEXT_PUBLIC_AIM_UPGRADE_URL ||
  "https://aimarketingacademy.com/profile?aim_modal=upgrade";

interface PromptCardProps {
  prompt: PublicPrompt;
  currentUserId?: string;
  isAdminOverride?: boolean;
  deleteUrl?: string;
  onUpvote?: (messageId: string) => Promise<void>;
  onSave?: (messageId: string) => Promise<void>;
  onEdit?: (prompt: PublicPrompt) => void;
  onDelete?: (messageId: string) => void;
}

export function PromptCard({
  prompt,
  currentUserId,
  isAdminOverride,
  deleteUrl,
  onUpvote,
  onSave,
  onEdit,
  onDelete,
}: PromptCardProps) {
  const [copied, setCopied] = useState(false);
  const [isUpvoting, setIsUpvoting] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isConfirmingDelete, setIsConfirmingDelete] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const { addToast } = useToast();

  const isOwner = isAdminOverride || (!!currentUserId && currentUserId === prompt.user_id);
  const isLocked = prompt.locked === true;

  const copyToClipboard = async (text: string) => {
    if (isLocked) return;
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      addToast({
        title: "Copied!",
        description: "Prompt copied to clipboard",
      });
      setTimeout(() => setCopied(false), 2000);
    } catch (err) {
      addToast({
        title: "Error",
        description: "Failed to copy to clipboard",
        variant: "destructive",
      });
    }
  };

  const handleUpvote = async () => {
    if (!onUpvote || isUpvoting) return;
    setIsUpvoting(true);
    try {
      await onUpvote(prompt.message_id);
    } finally {
      setIsUpvoting(false);
    }
  };

  const handleSave = async () => {
    if (isLocked || !onSave || isSaving) return;
    setIsSaving(true);
    try {
      await onSave(prompt.message_id);
      addToast({
        title: prompt.is_saved ? "Removed" : "Saved",
        description: prompt.is_saved
          ? "Prompt removed from saved"
          : "Prompt saved to your collection",
      });
    } finally {
      setIsSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!onDelete || isDeleting) return;
    setIsDeleting(true);
    try {
      const endpoint = deleteUrl ?? `/api/apps/prompt-studio/prompts/${prompt.message_id}`;
      const res = await fetch(endpoint, {
        method: "DELETE",
      });
      if (!res.ok && res.status !== 204) {
        throw new Error("Failed to delete prompt");
      }
      addToast({ title: "Prompt deleted" });
      onDelete(prompt.message_id);
    } catch {
      addToast({ title: "Error", description: "Failed to delete prompt", variant: "destructive" });
      setIsDeleting(false);
      setIsConfirmingDelete(false);
    }
  };

  const handleCardClick = () => {
    if (isLocked) return;
    setIsModalOpen(true);
  };

  // Extract inner code block text for copy (strips the backtick fences)
  const codeMatch = prompt.content.match(/```[\w]*\n?([\s\S]*?)```/);
  const copyContent = codeMatch ? codeMatch[1].trim() : prompt.content;

  return (
    <>
      <Card
        className={cn(
          "group relative hover:shadow-lg transition-shadow flex flex-col",
          isLocked ? "cursor-default opacity-75" : "cursor-pointer"
        )}
        onClick={handleCardClick}
      >
        {/* Lock overlay for locked prompts */}
        {isLocked && (
          <div className="absolute inset-0 z-10 flex items-center justify-center rounded-xl bg-background/60 backdrop-blur-[1px]">
            <div className="text-center px-6">
              <Lock className="h-8 w-8 mx-auto mb-2 text-muted-foreground" />
              <p className="text-sm font-medium text-foreground mb-1">AiM Members Only</p>
              <a
                href={AIM_UPGRADE_URL}
                target="_blank"
                rel="noopener noreferrer"
                className="text-xs text-primary hover:underline"
                onClick={(e) => e.stopPropagation()}
              >
                Become an AiM Member
              </a>
            </div>
          </div>
        )}

        {/* Owner edit/delete overlay — absolutely positioned, no layout impact */}
        {isOwner && !isLocked && (
          <div className="absolute top-3 right-3 z-10" onClick={(e) => e.stopPropagation()}>
            {!isConfirmingDelete ? (
              <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={() => onEdit?.(prompt)}
                  title="Edit prompt"
                  className="h-7 w-7 bg-secondary hover:bg-secondary/70 shadow-sm border border-border"
                >
                  <Pencil className="h-3.5 w-3.5" />
                </Button>
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={() => setIsConfirmingDelete(true)}
                  title="Delete prompt"
                  className="h-7 w-7 bg-secondary hover:bg-secondary/70 shadow-sm border border-border text-destructive hover:text-destructive"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </Button>
              </div>
            ) : (
              <div className="flex items-center gap-1 bg-background border rounded-md px-2 py-1 shadow-md">
                <span className="text-xs text-muted-foreground whitespace-nowrap">Delete?</span>
                <Button
                  variant="destructive"
                  size="sm"
                  className="h-6 px-2 text-xs"
                  onClick={handleDelete}
                  disabled={isDeleting}
                >
                  {isDeleting ? "..." : "Yes"}
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-6 px-2 text-xs"
                  onClick={() => setIsConfirmingDelete(false)}
                  disabled={isDeleting}
                >
                  No
                </Button>
              </div>
            )}
          </div>
        )}
        <CardHeader className="flex-1 flex flex-col">
          <div className="flex items-start justify-between gap-4 mb-3">
            <div className="flex-1 min-w-0 min-h-[5.25rem]">
              <h3 className="text-lg font-semibold text-[#2D323C]">
                {prompt.title || "Untitled Prompt"}
              </h3>
              {prompt.access_tier === "free" && (
                <span className="inline-block mt-1 px-2 py-0.5 text-[10px] font-medium uppercase tracking-wider rounded-full bg-emerald-100 text-emerald-700">
                  Free
                </span>
              )}
            </div>
            {!isLocked && (
              <div className="flex gap-2 shrink-0" onClick={(e) => e.stopPropagation()}>
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={handleUpvote}
                  disabled={isUpvoting}
                  className={cn(
                    prompt.has_upvoted && "text-primary"
                  )}
                >
                  <ThumbsUp className="h-4 w-4" />
                  <span className="ml-1 text-sm">{prompt.upvote_count}</span>
                </Button>
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={handleSave}
                  disabled={isSaving}
                  className={cn(
                    prompt.is_saved && "text-primary"
                  )}
                >
                  <Bookmark className={cn("h-4 w-4", prompt.is_saved && "fill-current")} />
                </Button>
              </div>
            )}
          </div>
          {prompt.description && (
            <p className="text-sm text-muted-foreground leading-relaxed line-clamp-2 mt-1">
              {prompt.description}
            </p>
          )}
        </CardHeader>
        <CardContent className="shrink-0 flex flex-col gap-3">
          <div className="flex items-center gap-2 text-sm text-muted-foreground min-w-0">
            <User className="h-4 w-4 shrink-0" />
            <span className="min-w-0 truncate">{prompt.author_name || "Anonymous"}</span>
            <span className="shrink-0">•</span>
            <span className="shrink-0 whitespace-nowrap">{formatDate(prompt.created_at)}</span>
          </div>
          {!isLocked && prompt.content && (
            <div className="bg-[#f6f6f6] dark:bg-neutral-800 p-3 rounded-lg overflow-hidden h-40">
              <div className="text-xs text-foreground leading-relaxed [&>*:first-child]:mt-0 [&>*:last-child]:mb-0 [&_p]:mb-1.5 [&_ul]:list-disc [&_ul]:pl-4 [&_ul]:mb-1.5 [&_ol]:list-decimal [&_ol]:pl-4 [&_ol]:mb-1.5 [&_li]:mb-0.5 [&_strong]:font-semibold [&_h1]:font-semibold [&_h1]:text-sm [&_h2]:font-semibold [&_h2]:text-sm [&_h3]:font-semibold [&_pre]:font-mono [&_pre]:whitespace-pre-wrap [&_pre]:break-words [&_code]:font-mono [&_blockquote]:border-l-2 [&_blockquote]:pl-2 [&_blockquote]:italic [&_blockquote]:text-muted-foreground [&_hr]:border-border [&_hr]:my-1">
                <ReactMarkdown remarkPlugins={[remarkGfm]}>
                  {prompt.content}
                </ReactMarkdown>
              </div>
            </div>
          )}
          {isLocked && (
            <div className="bg-[#f6f6f6] dark:bg-neutral-800 p-3 rounded-lg h-40 flex items-center justify-center">
              <div className="text-center text-muted-foreground">
                <Lock className="h-5 w-5 mx-auto mb-1" />
                <p className="text-xs">Content available to AiM members</p>
              </div>
            </div>
          )}
          {!isLocked && (
            <div className="flex gap-2">
              <Button
                variant="outline"
                size="sm"
                className="flex-1"
                onClick={(e) => {
                  e.stopPropagation();
                  setIsModalOpen(true);
                }}
              >
                <Eye className="h-4 w-4 mr-2" />
                View Full Prompt
              </Button>

              <Button
                variant="outline"
                size="icon"
                onClick={(e) => {
                  e.stopPropagation();
                  copyToClipboard(copyContent);
                }}
                title="Copy prompt"
              >
                {copied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
              </Button>
            </div>
          )}
        </CardContent>
      </Card>

      {!isLocked && (
        <Dialog open={isModalOpen} onOpenChange={setIsModalOpen}>
          <DialogContent className="max-w-3xl max-h-[calc(100vh-2rem)] flex flex-col">
            <DialogHeader>
              <div className="flex items-start justify-between">
                <div className="flex-1">
                  <DialogTitle>{prompt.title || "Prompt Details"}</DialogTitle>
                  {prompt.description && (
                    <p className="text-sm text-muted-foreground mt-2 leading-relaxed">
                      {prompt.description}
                    </p>
                  )}
                </div>
                <div className="flex items-center gap-1 shrink-0 ml-4">
                  <Button
                    variant="outline"
                    size="sm"
                    className="h-8 gap-1.5"
                    onClick={() => copyToClipboard(copyContent)}
                  >
                    {copied ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
                    {copied ? "Copied" : "Copy Prompt"}
                  </Button>
                  <DialogClose onClose={() => setIsModalOpen(false)} />
                </div>
              </div>
            </DialogHeader>
            <DialogBody>
              <div className="space-y-4">
                <div className="flex items-center gap-2 text-sm text-muted-foreground pb-4 border-b min-w-0">
                  <User className="h-4 w-4 shrink-0" />
                  <span className="min-w-0 truncate">{prompt.author_name || "Anonymous"}</span>
                  <span className="shrink-0">•</span>
                  <span className="shrink-0 whitespace-nowrap">{formatDate(prompt.created_at)}</span>
                </div>

                <div className="text-sm text-foreground [&>*:first-child]:mt-0 [&_p]:mb-3 [&_p]:leading-relaxed [&_p]:text-muted-foreground [&_ul]:list-disc [&_ul]:pl-5 [&_ul]:mb-3 [&_ul]:space-y-1 [&_ol]:list-decimal [&_ol]:pl-5 [&_ol]:mb-3 [&_ol]:space-y-1 [&_li]:leading-relaxed [&_li]:text-muted-foreground [&_strong]:font-semibold [&_strong]:text-foreground [&_em]:italic [&_h1]:text-lg [&_h1]:font-bold [&_h1]:mt-5 [&_h1]:mb-2 [&_h1]:text-foreground [&_h2]:text-base [&_h2]:font-bold [&_h2]:mt-4 [&_h2]:mb-2 [&_h2]:text-foreground [&_h3]:text-sm [&_h3]:font-semibold [&_h3]:mt-3 [&_h3]:mb-1 [&_h3]:text-foreground [&_pre]:bg-muted [&_pre]:p-4 [&_pre]:rounded-lg [&_pre]:overflow-x-auto [&_pre]:text-sm [&_pre]:font-mono [&_pre]:mb-3 [&_code]:font-mono [&_code]:text-sm [&_:not(pre)>code]:bg-muted [&_:not(pre)>code]:px-1 [&_:not(pre)>code]:py-0.5 [&_:not(pre)>code]:rounded [&_blockquote]:border-l-4 [&_blockquote]:border-border [&_blockquote]:pl-4 [&_blockquote]:italic [&_blockquote]:text-muted-foreground [&_blockquote]:my-3 [&_hr]:border-border [&_hr]:my-4 [&_table]:w-full [&_table]:text-sm [&_table]:mb-3 [&_th]:text-left [&_th]:font-semibold [&_th]:pb-1 [&_th]:border-b [&_th]:border-border [&_td]:py-1 [&_td]:border-b [&_td]:border-border/50">
                  <ReactMarkdown remarkPlugins={[remarkGfm]}>
                    {prompt.content}
                  </ReactMarkdown>
                </div>
              </div>
            </DialogBody>
          </DialogContent>
        </Dialog>
      )}
    </>
  );
}
