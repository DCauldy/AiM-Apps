"use client";

import { useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import { ArrowLeft, X } from "lucide-react";
import { BlogPreview } from "@/components/blog-engine/blog/BlogPreview";
import { RefinementChat } from "@/components/blog-engine/blog/RefinementChat";
import type { BofuBlog, BofuBlogChat } from "@/types/blog-engine";

interface BlogViewClientProps {
  blog: BofuBlog;
  chats: BofuBlogChat[];
}

export function BlogViewClient({ blog: initialBlog, chats }: BlogViewClientProps) {
  const router = useRouter();
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
        }));
        window.dispatchEvent(new Event("blog-usage-updated"));
      }
    } catch {
      // Silently fail
    } finally {
      setPublishing(false);
    }
  }, [blog.id]);

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

      {/* Full-width preview */}
      <div className="flex-1 overflow-hidden">
        <BlogPreview
          blog={blog}
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
