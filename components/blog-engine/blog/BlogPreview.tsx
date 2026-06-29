"use client";

import { useState } from "react";
import { Copy, Download, Check, ExternalLink, Send, Loader2, RefreshCw, CheckCircle2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { ImageRegenerator } from "@/components/blog-engine/blog/ImageRegenerator";
import type { BofuBlog } from "@/types/blog-engine";

interface BlogPreviewProps {
  blog: BofuBlog;
  authorName?: string;
  onOpenRefine?: () => void;
  onPublish?: () => void;
  publishing?: boolean;
  onSync?: () => void;
  syncing?: boolean;
  onBlogUpdated?: () => void;
}

function needsSync(blog: BofuBlog): boolean {
  if (blog.publish_status !== "published" || !blog.cms_post_id) return false;
  const lastSyncedAt = blog.synced_at || blog.published_at;
  if (!lastSyncedAt) return false;
  return new Date(blog.updated_at) > new Date(lastSyncedAt);
}

export function BlogPreview({ blog, authorName, onOpenRefine, onPublish, publishing, onSync, syncing, onBlogUpdated }: BlogPreviewProps) {
  const [copied, setCopied] = useState<string | null>(null);

  const handleCopy = async (content: string, type: string) => {
    await navigator.clipboard.writeText(content);
    setCopied(type);
    setTimeout(() => setCopied(null), 2000);
  };

  const handleDownload = (content: string, filename: string) => {
    const blob = new Blob([content], { type: "text/html" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="h-full flex flex-col">
      {/* Action bar */}
      <div className="flex items-center justify-between border-b px-4 py-2 bg-card/50 shrink-0">
        <div className="flex items-center gap-2">
          <span
            className={cn(
              "px-2 py-0.5 rounded-full text-[10px] font-medium border",
              blog.publish_status === "published"
                ? "border-[#31DBA5]/40 text-[#31DBA5]"
                : blog.publish_status === "draft"
                  ? "border-amber-400/40 text-amber-400"
                  : "border-border text-muted-foreground"
            )}
          >
            {blog.publish_status}
          </span>
          {blog.cms_post_url && (
            <a
              href={blog.cms_post_url}
              target="_blank"
              rel="noopener noreferrer"
              className="text-xs text-primary hover:underline flex items-center gap-1"
            >
              View on site <ExternalLink className="h-3 w-3" />
            </a>
          )}
        </div>

        <div className="flex items-center gap-1">
          {onPublish && blog.publish_status !== "published" && (
            <button
              onClick={onPublish}
              disabled={publishing}
              className="flex items-center gap-1 px-3 py-1 text-xs font-medium bg-primary text-primary-foreground hover:bg-primary/90 disabled:opacity-50 rounded-md transition-colors"
            >
              {publishing ? (
                <Loader2 className="h-3 w-3 animate-spin" />
              ) : (
                <Send className="h-3 w-3" />
              )}
              {publishing ? "Publishing..." : "Publish"}
            </button>
          )}
          {onSync && needsSync(blog) && (
            <button
              onClick={onSync}
              disabled={syncing}
              className="flex items-center gap-1 px-3 py-1 text-xs font-medium bg-amber-500/15 text-amber-400 border border-amber-500/30 hover:bg-amber-500/25 disabled:opacity-50 rounded-md transition-colors"
            >
              {syncing ? (
                <Loader2 className="h-3 w-3 animate-spin" />
              ) : (
                <RefreshCw className="h-3 w-3" />
              )}
              {syncing ? "Syncing..." : "Sync to CMS"}
            </button>
          )}
          {blog.publish_status === "published" && blog.cms_post_id && !needsSync(blog) && (
            <span className="flex items-center gap-1 px-2 py-1 text-[10px] text-[#31DBA5]">
              <CheckCircle2 className="h-3 w-3" />
              In sync
            </span>
          )}
          {onOpenRefine && (
            <button
              onClick={onOpenRefine}
              className="flex items-center gap-1 px-2 py-1 text-xs font-medium text-[#31DBA5] hover:text-[#31DBA5]/80 rounded transition-colors"
            >
              Refine
            </button>
          )}
          <button
            onClick={() => handleCopy(blog.content_html, "html")}
            className="flex items-center gap-1 px-2 py-1 text-xs text-muted-foreground hover:text-foreground rounded transition-colors"
          >
            {copied === "html" ? (
              <Check className="h-3 w-3 text-[#31DBA5]" />
            ) : (
              <Copy className="h-3 w-3" />
            )}
            HTML
          </button>
          <button
            onClick={() =>
              handleDownload(
                blog.content_html,
                `${blog.slug || "blog"}.html`
              )
            }
            className="flex items-center gap-1 px-2 py-1 text-xs text-muted-foreground hover:text-foreground rounded transition-colors"
          >
            <Download className="h-3 w-3" />
            Download
          </button>
        </div>
      </div>

      {/* Blog content */}
      <div className="flex-1 overflow-y-auto">
        <div className="max-w-3xl mx-auto px-6 sm:px-10 py-10">
          {/* Featured image with regeneration controls */}
          {onBlogUpdated ? (
            <ImageRegenerator blog={blog} onImageUpdated={onBlogUpdated} />
          ) : (
            blog.featured_image_url && (
              <div className="mb-8 rounded-xl overflow-hidden border border-border/50">
                <img
                  src={blog.featured_image_url}
                  alt={blog.featured_image_alt || blog.title}
                  className="w-full h-auto"
                />
              </div>
            )
          )}

          {/* Title */}
          <h1 className="font-sans text-2xl sm:text-3xl font-bold text-foreground leading-tight mb-4">
            {blog.title}
          </h1>

          {/* Meta line */}
          <div className="flex items-center gap-3 text-xs text-muted-foreground mb-8 pb-6 border-b border-border/50">
            {authorName && (
              <>
                <span>By {authorName}</span>
                <span className="text-border">·</span>
              </>
            )}
            <span>
              {new Date(blog.created_at).toLocaleDateString("en-US", {
                month: "long",
                day: "numeric",
                year: "numeric",
              })}
            </span>
            {blog.wp_categories.length > 0 && (
              <>
                <span className="text-border">·</span>
                <span>{blog.wp_categories.join(", ")}</span>
              </>
            )}
          </div>

          {/* Answer capsule */}
          {blog.answer_capsule && (
            <div className="bg-[#31DBA5]/5 border-l-4 border-[#31DBA5] px-5 py-4 rounded-r-lg mb-8">
              <p className="text-sm font-medium text-foreground leading-relaxed m-0">
                {blog.answer_capsule}
              </p>
            </div>
          )}

          {/* HTML content */}
          <article className="be-article prose prose-base max-w-none">
            <div dangerouslySetInnerHTML={{ __html: blog.content_html }} />
          </article>
        </div>
      </div>

      {/* Metadata panel (collapsible) */}
      <BlogMetadataPanel blog={blog} />
    </div>
  );
}

function BlogMetadataPanel({ blog }: { blog: BofuBlog }) {
  const [isOpen, setIsOpen] = useState(false);

  if (!isOpen) {
    return (
      <button
        onClick={() => setIsOpen(true)}
        className="w-full border-t px-4 py-2 text-xs text-muted-foreground hover:text-foreground hover:bg-accent/50 transition-colors text-center"
      >
        Show SEO Metadata
      </button>
    );
  }

  return (
    <div className="border-t max-h-64 overflow-y-auto">
      <button
        onClick={() => setIsOpen(false)}
        className="w-full px-4 py-2 text-xs text-muted-foreground hover:text-foreground hover:bg-accent/50 transition-colors text-center"
      >
        Hide SEO Metadata
      </button>
      <div className="px-4 pb-4 space-y-3">
        {blog.meta_title && (
          <MetaField label="Meta Title" value={blog.meta_title} />
        )}
        {blog.meta_description && (
          <MetaField label="Meta Description" value={blog.meta_description} />
        )}
        {blog.og_title && (
          <MetaField label="OG Title" value={blog.og_title} />
        )}
        {blog.wp_categories.length > 0 && (
          <MetaField
            label="Categories"
            value={blog.wp_categories.join(", ")}
          />
        )}
        {blog.wp_tags.length > 0 && (
          <MetaField label="Tags" value={blog.wp_tags.join(", ")} />
        )}
      </div>
    </div>
  );
}

function MetaField({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <span className="text-[10px] font-medium text-muted-foreground uppercase tracking-wide">
        {label}
      </span>
      <p className="text-xs text-foreground mt-0.5">{value}</p>
    </div>
  );
}
