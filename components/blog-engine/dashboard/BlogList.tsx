"use client";

import { useState } from "react";
import { BlogCard } from "./BlogCard";
import { cn } from "@/lib/utils";
import type { BofuBlog, BlogPublishStatus } from "@/types/blog-engine";

interface BlogListProps {
  blogs: BofuBlog[];
}

const FILTER_OPTIONS: { label: string; value: BlogPublishStatus | "all" }[] = [
  { label: "All", value: "all" },
  { label: "Draft", value: "draft" },
  { label: "Published", value: "published" },
  { label: "Generating", value: "generating" },
  { label: "Failed", value: "failed" },
];

export function BlogList({ blogs }: BlogListProps) {
  const [filter, setFilter] = useState<BlogPublishStatus | "all">("all");

  const filteredBlogs =
    filter === "all"
      ? blogs
      : blogs.filter((b) => b.publish_status === filter);

  return (
    <div>
      {/* Filter tabs */}
      <div className="flex items-center gap-1 mb-4 overflow-x-auto">
        {FILTER_OPTIONS.map((option) => (
          <button
            key={option.value}
            onClick={() => setFilter(option.value)}
            className={cn(
              "px-3 py-1.5 text-xs font-medium rounded-md whitespace-nowrap transition-colors",
              filter === option.value
                ? "bg-primary text-primary-foreground"
                : "text-muted-foreground hover:text-foreground hover:bg-accent"
            )}
          >
            {option.label}
          </button>
        ))}
      </div>

      {/* Blog grid */}
      {filteredBlogs.length === 0 ? (
        <div className="text-center py-12">
          <p className="text-sm text-muted-foreground">
            {filter === "all"
              ? "No blogs yet. Your first blog will appear here after generation."
              : `No ${filter} blogs.`}
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {filteredBlogs.map((blog) => (
            <BlogCard key={blog.id} blog={blog} />
          ))}
        </div>
      )}
    </div>
  );
}
