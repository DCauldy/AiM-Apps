"use client";

import { useState } from "react";
import { RefreshCw, ImageIcon, Loader2, ChevronDown } from "lucide-react";
import { cn } from "@/lib/utils";
import type { BofuBlog, ImageStyle } from "@/types/blog-engine";

const STYLE_OPTIONS: { value: ImageStyle; label: string }[] = [
  { value: "location", label: "Location Photo" },
  { value: "branded", label: "Branded Header" },
];

interface ImageRegeneratorProps {
  blog: BofuBlog;
  onImageUpdated: () => void;
}

export function ImageRegenerator({ blog, onImageUpdated }: ImageRegeneratorProps) {
  const [generating, setGenerating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [style, setStyle] = useState<ImageStyle>(
    blog.featured_image_style || "location"
  );
  const [dropdownOpen, setDropdownOpen] = useState(false);

  const remaining = blog.image_regenerations_limit - blog.image_regenerations_used;
  const hasImage = !!blog.featured_image_url;
  const canRegenerate = remaining > 0;

  const handleGenerate = async () => {
    setGenerating(true);
    setError(null);

    try {
      const response = await fetch(
        `/api/apps/blog-engine/blogs/${blog.id}/regenerate-image`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ style }),
        }
      );

      const data = await response.json();

      if (!response.ok) {
        if (data.error === "regeneration_limit_reached") {
          setError("Regeneration limit reached");
        } else {
          setError(data.error || "Image generation failed");
        }
        return;
      }

      onImageUpdated();
    } catch {
      setError("Network error — please try again");
    } finally {
      setGenerating(false);
    }
  };

  return (
    <div className="mb-8">
      {/* Image display */}
      <div className="relative rounded-xl overflow-hidden border border-border/50 bg-accent/30">
        {hasImage ? (
          <img
            src={blog.featured_image_url!}
            alt={blog.featured_image_alt || blog.title}
            className="w-full h-auto"
          />
        ) : (
          <div className="flex flex-col items-center justify-center py-16 text-muted-foreground">
            <ImageIcon className="h-10 w-10 mb-3 opacity-40" />
            <p className="text-sm">No featured image</p>
          </div>
        )}

        {/* Loading overlay */}
        {generating && (
          <div className="absolute inset-0 bg-background/70 flex flex-col items-center justify-center">
            <Loader2 className="h-8 w-8 animate-spin text-[#31DBA5] mb-2" />
            <p className="text-sm text-muted-foreground">Generating image...</p>
          </div>
        )}
      </div>

      {/* Controls */}
      <div className="flex items-center justify-between mt-3">
        {/* Style selector */}
        <div className="relative">
          <button
            onClick={() => setDropdownOpen(!dropdownOpen)}
            disabled={generating}
            className="flex items-center gap-1.5 px-2.5 py-1.5 text-xs text-muted-foreground hover:text-foreground border border-border rounded-md transition-colors disabled:opacity-50"
          >
            {STYLE_OPTIONS.find((o) => o.value === style)?.label}
            <ChevronDown className="h-3 w-3" />
          </button>
          {dropdownOpen && (
            <>
              <div
                className="fixed inset-0 z-10"
                onClick={() => setDropdownOpen(false)}
              />
              <div className="absolute top-full left-0 mt-1 z-20 bg-popover border border-border rounded-md shadow-md py-1 min-w-[160px]">
                {STYLE_OPTIONS.map((option) => (
                  <button
                    key={option.value}
                    onClick={() => {
                      setStyle(option.value);
                      setDropdownOpen(false);
                    }}
                    className={cn(
                      "w-full text-left px-3 py-1.5 text-xs hover:bg-accent transition-colors",
                      style === option.value
                        ? "text-[#31DBA5] font-medium"
                        : "text-foreground"
                    )}
                  >
                    {option.label}
                  </button>
                ))}
              </div>
            </>
          )}
        </div>

        {/* Generate / Regenerate button + counter */}
        <div className="flex items-center gap-2">
          <span className="text-[10px] text-muted-foreground">
            {remaining}/{blog.image_regenerations_limit} remaining
          </span>
          <button
            onClick={handleGenerate}
            disabled={generating || !canRegenerate}
            className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium bg-primary text-primary-foreground hover:bg-primary/90 disabled:opacity-50 rounded-md transition-colors"
          >
            {generating ? (
              <Loader2 className="h-3 w-3 animate-spin" />
            ) : (
              <RefreshCw className="h-3 w-3" />
            )}
            {hasImage ? "Regenerate" : "Generate Image"}
          </button>
        </div>
      </div>

      {/* Error message */}
      {error && (
        <p className="mt-2 text-xs text-red-400">{error}</p>
      )}
    </div>
  );
}
