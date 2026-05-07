"use client";

import Link from "next/link";
import { FileText, Globe, Clock, AlertTriangle, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";
import type { BofuBlog, BlogPublishStatus } from "@/types/blog-engine";

interface BlogCardProps {
  blog: BofuBlog;
}

const STATUS_CONFIG: Record<
  BlogPublishStatus,
  { label: string; color: string; icon: React.ElementType }
> = {
  generating: {
    label: "Generating",
    color: "text-blue-400 border border-blue-400/40",
    icon: Loader2,
  },
  draft: {
    label: "Draft",
    color: "text-amber-400 border border-amber-400/40",
    icon: FileText,
  },
  review: {
    label: "In Review",
    color: "text-purple-400 border border-purple-400/40",
    icon: Clock,
  },
  published: {
    label: "Published",
    color: "text-[#31DBA5] border border-[#31DBA5]/40",
    icon: Globe,
  },
  failed: {
    label: "Failed",
    color: "text-destructive border border-destructive/40",
    icon: AlertTriangle,
  },
};

export function BlogCard({ blog }: BlogCardProps) {
  const status = STATUS_CONFIG[blog.publish_status] || STATUS_CONFIG.draft;
  const StatusIcon = status.icon;

  return (
    <Link
      href={`/apps/blog-engine/blogs/${blog.id}`}
      className="block rounded-lg border bg-card hover:bg-accent/50 transition-colors"
    >
      <div className="flex gap-4 p-4">
        {/* Thumbnail */}
        <div className="w-20 h-20 rounded-md bg-muted shrink-0 overflow-hidden">
          {blog.featured_image_url ? (
            <img
              src={blog.featured_image_url}
              alt={blog.featured_image_alt || blog.title}
              className="w-full h-full object-cover"
            />
          ) : (
            <div className="w-full h-full flex items-center justify-center">
              <FileText className="h-8 w-8 text-muted-foreground/30" />
            </div>
          )}
        </div>

        {/* Content */}
        <div className="flex-1 min-w-0">
          <h3 className="text-sm font-medium text-foreground truncate">
            {blog.title}
          </h3>
          {blog.excerpt && (
            <p className="text-xs text-muted-foreground mt-1 line-clamp-2">
              {blog.excerpt}
            </p>
          )}
          <div className="flex items-center gap-3 mt-2">
            {/* Status badge */}
            <span
              className={cn(
                "inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-medium",
                status.color
              )}
            >
              <StatusIcon
                className={cn(
                  "h-3 w-3",
                  blog.publish_status === "generating" && "animate-spin"
                )}
              />
              {status.label}
            </span>

            {/* Date */}
            <span className="text-[10px] text-muted-foreground">
              {new Date(blog.created_at).toLocaleDateString("en-US", {
                month: "short",
                day: "numeric",
                year: "numeric",
              })}
            </span>

            {/* CMS indicator */}
            {blog.cms_post_url && (
              <span className="text-[10px] text-[#31DBA5]">
                Published to CMS
              </span>
            )}
          </div>
        </div>
      </div>
    </Link>
  );
}
