"use client";

import { useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import { ArrowLeft, X, AlertCircle } from "lucide-react";
import { BlogPreview } from "@/components/blog-engine/blog/BlogPreview";
import { RefinementChat } from "@/components/blog-engine/blog/RefinementChat";
import { useToast } from "@/components/ui/toast";
import type { BofuBlog, BofuBlogChat } from "@/types/blog-engine";

interface BlogViewClientProps {
  blog: BofuBlog;
  chats: BofuBlogChat[];
  authorName?: string;
}

export function BlogViewClient({ blog: initialBlog, chats, authorName }: BlogViewClientProps) {
  const router = useRouter();
  const { addToast } = useToast();
  const [blog, setBlog] = useState(initialBlog);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [publishing, setPublishing] = useState(false);
  const [syncing, setSyncing] = useState(false);

  const handleBlogUpdated = useCallback(async () => {
    try {
      const response = await fetch(`/api/apps/blog-engine/blogs/${blog.id}`);
      if (response.ok) {
        const data = await response.json();
        setBlog(data.blog);
      }
    } catch {
      // Silently fail — user can refresh manually
    }
  }, [blog.id]);

  const handlePublish = useCallback(async () => {
    setPublishing(true);
    try {
      const response = await fetch(`/api/apps/blog-engine/blogs/${blog.id}/publish`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
      });
      const data = await response.json();
      if (response.ok && data.success) {
        const now = new Date().toISOString();
        setBlog((prev) => ({
          ...prev,
          publish_status: "published",
          cms_post_url: data.postUrl || prev.cms_post_url,
          cms_post_id: data.postId || prev.cms_post_id,
          published_at: now,
          synced_at: now,
          pipeline_error: null,
        }));
        window.dispatchEvent(new Event("blog-usage-updated"));
        addToast({
          title: "Published",
          description: data.postUrl
            ? "Your post is live."
            : "Sent to your CMS.",
        });
      } else {
        const message = data.error ?? "Publish failed — try again.";
        setBlog((prev) => ({
          ...prev,
          publish_status: "failed",
          pipeline_error: `Publish: ${message}`,
        }));
        addToast({
          title: "Publish failed",
          description: message,
          variant: "destructive",
        });
      }
    } catch {
      addToast({
        title: "Network error",
        description: "Could not reach the publish endpoint.",
        variant: "destructive",
      });
    } finally {
      setPublishing(false);
    }
  }, [blog.id, addToast]);

  const handleSync = useCallback(async () => {
    setSyncing(true);
    try {
      const response = await fetch(`/api/apps/blog-engine/blogs/${blog.id}/sync`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
      });
      const data = await response.json();
      if (response.ok && data.success) {
        setBlog((prev) => ({
          ...prev,
          synced_at: data.syncedAt,
          cms_post_url: data.postUrl || prev.cms_post_url,
        }));
      }
    } catch {
      // Silently fail
    } finally {
      setSyncing(false);
    }
  }, [blog.id]);

  return (
    <div className="h-full flex flex-col relative">
      {/* Top bar */}
      <div className="flex items-center gap-3 border-b px-4 py-2 bg-card/50 shrink-0">
        <button
          onClick={() => router.push("/apps/blog-engine/dashboard")}
          className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors"
        >
          <ArrowLeft className="h-3.5 w-3.5" />
          Back to Dashboard
        </button>
        <span className="text-xs text-border">|</span>
        <h2 className="font-sans text-sm font-medium text-foreground truncate">
          {blog.title}
        </h2>
      </div>

      {/* Pipeline error banner — surfaces what step failed so the user
          knows whether to retry or investigate (CMS auth, AI rate-limit, etc.) */}
      {blog.pipeline_error && blog.publish_status === "failed" && (
        <div className="flex items-start gap-2 mx-4 mt-3 mb-1 rounded-md border border-destructive/30 bg-destructive/5 px-3 py-2">
          <AlertCircle className="h-4 w-4 text-destructive mt-0.5 shrink-0" />
          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium text-destructive">
              Last attempt failed
            </p>
            <p className="text-xs text-destructive/80 mt-0.5 break-words">
              {blog.pipeline_error}
            </p>
          </div>
          <button
            type="button"
            onClick={handlePublish}
            disabled={publishing}
            className="text-xs font-medium text-destructive underline underline-offset-2 hover:no-underline shrink-0 disabled:opacity-50"
          >
            {publishing ? "Retrying…" : "Retry"}
          </button>
        </div>
      )}

      {/* Full-width preview */}
      <div className="flex-1 overflow-hidden">
        <BlogPreview
          blog={blog}
          authorName={authorName}
          onOpenRefine={() => setDrawerOpen(true)}
          onPublish={handlePublish}
          publishing={publishing}
          onSync={handleSync}
          syncing={syncing}
          onBlogUpdated={handleBlogUpdated}
        />
      </div>

      {/* Slide-out refinement drawer */}
      {/* Backdrop */}
      {drawerOpen && (
        <div
          className="fixed inset-0 bg-black/50 z-40"
          onClick={() => setDrawerOpen(false)}
        />
      )}

      {/* Drawer panel */}
      <div
        className={`fixed top-0 right-0 h-full w-full sm:w-[440px] z-50 bg-background border-l border-border transform transition-transform duration-300 ease-in-out ${
          drawerOpen ? "translate-x-0" : "translate-x-full"
        }`}
      >
        {/* Drawer close button */}
        <button
          onClick={() => setDrawerOpen(false)}
          className="absolute top-3 right-3 z-10 flex items-center justify-center w-7 h-7 rounded-md text-muted-foreground hover:text-foreground hover:bg-accent transition-colors"
          aria-label="Close refinement drawer"
        >
          <X className="h-4 w-4" />
        </button>

        {drawerOpen && (
          <RefinementChat
            blog={blog}
            existingChats={chats}
            onBlogUpdated={handleBlogUpdated}
          />
        )}
      </div>
    </div>
  );
}
