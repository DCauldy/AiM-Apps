"use client";

import { useState, useEffect, useCallback } from "react";
import { BlogList } from "@/components/blog-engine/dashboard/BlogList";
import type { BofuBlog } from "@/types/blog-engine";

export default function BlogsPage() {
  const [blogs, setBlogs] = useState<BofuBlog[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchBlogs = useCallback(async () => {
    try {
      const response = await fetch("/api/apps/blog-engine/blogs");
      if (response.ok) {
        const data = await response.json();
        setBlogs(data.blogs);
      }
    } catch {
      console.error("Failed to fetch blogs");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchBlogs();
  }, [fetchBlogs]);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-sm text-muted-foreground">Loading blogs...</div>
      </div>
    );
  }

  return (
    <div className="h-full overflow-y-auto">
      <div className="max-w-4xl mx-auto px-6 py-8">
        <div className="mb-6">
          <h1 className="font-sans text-xl font-bold text-foreground">My Blogs</h1>
          <p className="text-sm text-muted-foreground mt-1">
            All your generated blog posts in one place.
          </p>
        </div>

        <BlogList blogs={blogs} />
      </div>
    </div>
  );
}
