"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  AlertCircle,
  ArrowDown,
  ArrowUp,
  Clock,
  Download,
  Loader2,
  Sparkles,
  Trash2,
  Upload,
  X,
} from "lucide-react";

import { cn } from "@/lib/utils";
import type { ListingPhotoRow, ListingRow } from "@/types/listing-studio";

interface PhotosTabProps {
  listing: ListingRow;
}

export function PhotosTab({ listing }: PhotosTabProps) {
  const [photos, setPhotos] = useState<ListingPhotoRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [processing, setProcessing] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [dragOver, setDragOver] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const baseUrl = useMemo(
    () => `/api/apps/listing-studio/listings/${listing.id}/photos`,
    [listing.id],
  );

  const refresh = useCallback(async () => {
    try {
      const res = await fetch(baseUrl);
      if (!res.ok) return;
      const data = (await res.json()) as { photos: ListingPhotoRow[] };
      setPhotos(data.photos ?? []);
    } catch {
      // soft-fail
    }
  }, [baseUrl]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      await refresh();
      if (!cancelled) setLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [refresh]);

  const handleFiles = useCallback(
    async (files: FileList | File[]) => {
      const fileArr = Array.from(files).filter((f) => f.type.startsWith("image/"));
      if (fileArr.length === 0) return;
      setUploading(true);
      setError(null);
      try {
        const formData = new FormData();
        for (const f of fileArr) formData.append("photos", f);
        const res = await fetch(`${baseUrl}/upload`, {
          method: "POST",
          body: formData,
        });
        const data = await res.json();
        if (!res.ok) {
          setError(data.error ?? "Upload failed");
          return;
        }
        if (Array.isArray(data.failures) && data.failures.length > 0) {
          setError(
            `${data.failures.length} file(s) failed: ${data.failures
              .map((f: { filename: string; error: string }) => `${f.filename}: ${f.error}`)
              .join("; ")}`,
          );
        }
        await refresh();
      } catch {
        setError("Upload failed — network error.");
      } finally {
        setUploading(false);
      }
    },
    [baseUrl, refresh],
  );

  const onInputChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      if (e.target.files && e.target.files.length > 0) {
        void handleFiles(e.target.files);
        e.target.value = "";
      }
    },
    [handleFiles],
  );

  const onDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      setDragOver(false);
      if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
        void handleFiles(e.dataTransfer.files);
      }
    },
    [handleFiles],
  );

  const handleProcess = useCallback(async () => {
    setProcessing(true);
    setError(null);
    try {
      const res = await fetch(baseUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? "Processing failed");
        return;
      }
      // Brief delay before refresh — Inngest needs a moment in prod.
      // In dev the route runs inline and the response is already final.
      await new Promise((r) => setTimeout(r, data.status === "queued" ? 1500 : 0));
      await refresh();
    } catch {
      setError("Processing failed — network error.");
    } finally {
      setProcessing(false);
    }
  }, [baseUrl, refresh]);

  const handleDeleteOne = useCallback(
    async (photoId: string) => {
      try {
        await fetch(`${baseUrl}?photoId=${encodeURIComponent(photoId)}`, {
          method: "DELETE",
        });
        await refresh();
      } catch {
        setError("Delete failed.");
      }
    },
    [baseUrl, refresh],
  );

  const handleDeleteAll = useCallback(async () => {
    if (!confirm("Delete all photos for this listing? This cannot be undone.")) return;
    setDeleting(true);
    try {
      await fetch(baseUrl, { method: "DELETE" });
      await refresh();
    } catch {
      setError("Delete failed.");
    } finally {
      setDeleting(false);
    }
  }, [baseUrl, refresh]);

  const handleEditCaption = useCallback(
    async (photoId: string, caption: string) => {
      // Optimistic update.
      setPhotos((prev) =>
        prev.map((p) => (p.id === photoId ? { ...p, caption } : p)),
      );
      try {
        await fetch(baseUrl, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ photoId, caption }),
        });
      } catch {
        setError("Caption save failed.");
      }
    },
    [baseUrl],
  );

  const handleMove = useCallback(
    async (photoId: string, direction: "up" | "down") => {
      // Find current index in the displayed list (which is ordered by suggested_order).
      const idx = photos.findIndex((p) => p.id === photoId);
      const swapIdx = direction === "up" ? idx - 1 : idx + 1;
      if (idx < 0 || swapIdx < 0 || swapIdx >= photos.length) return;

      const a = photos[idx];
      const b = photos[swapIdx];
      // Use existing suggested_order if both set, else fall back to (idx+1, swapIdx+1).
      const aOrder = a.suggested_order ?? idx + 1;
      const bOrder = b.suggested_order ?? swapIdx + 1;

      // Optimistic swap.
      const reordered = [...photos];
      reordered[idx] = { ...b, suggested_order: aOrder };
      reordered[swapIdx] = { ...a, suggested_order: bOrder };
      // Re-sort by suggested_order to match server-side ordering.
      reordered.sort(
        (x, y) =>
          (x.suggested_order ?? 9999) - (y.suggested_order ?? 9999) ||
          x.created_at.localeCompare(y.created_at),
      );
      setPhotos(reordered);

      // Persist both swaps.
      try {
        await Promise.all([
          fetch(baseUrl, {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ photoId: a.id, suggested_order: bOrder }),
          }),
          fetch(baseUrl, {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ photoId: b.id, suggested_order: aOrder }),
          }),
        ]);
      } catch {
        setError("Reorder save failed.");
      }
    },
    [baseUrl, photos],
  );

  const handleDownloadZip = useCallback(() => {
    // Trigger the browser download via direct navigation.
    window.location.href = `${baseUrl}/zip`;
  }, [baseUrl]);

  const hasPhotos = photos.length > 0;
  const hasProcessed = photos.some((p) => p.processed_at);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* TTL warning banner */}
      <div className="flex items-start gap-2 rounded-md border border-amber-500/30 bg-amber-500/5 px-3 py-2.5">
        <Clock className="h-3.5 w-3.5 text-amber-600 dark:text-amber-400 mt-0.5 shrink-0" />
        <p className="text-xs text-amber-900 dark:text-amber-200">
          <b>Photos are kept for 1 hour after upload</b> — download your renamed
          zip + captions before they expire. We never store listing photos
          long-term.
        </p>
      </div>

      {/* Upload zone */}
      <div
        onDragOver={(e) => {
          e.preventDefault();
          setDragOver(true);
        }}
        onDragLeave={() => setDragOver(false)}
        onDrop={onDrop}
        onClick={() => fileInputRef.current?.click()}
        className={cn(
          "rounded-xl border-2 border-dashed p-6 text-center cursor-pointer transition-colors",
          dragOver
            ? "border-[#D4A35C] bg-[#D4A35C]/5"
            : "border-border bg-card/30 hover:bg-card/50",
        )}
      >
        <input
          ref={fileInputRef}
          type="file"
          multiple
          accept="image/*"
          className="hidden"
          onChange={onInputChange}
        />
        {uploading ? (
          <div className="flex items-center justify-center gap-2 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" />
            Uploading…
          </div>
        ) : (
          <>
            <Upload className="h-7 w-7 mx-auto text-muted-foreground/70 mb-2" />
            <p className="text-sm font-medium text-foreground">
              Drop photos here or click to browse
            </p>
            <p className="text-xs text-muted-foreground mt-1">
              JPG, PNG, HEIC, WebP · up to 50 files at a time · max 25MB each
            </p>
          </>
        )}
      </div>

      {error && (
        <div className="flex items-start gap-2 rounded-md border border-destructive/30 bg-destructive/5 px-3 py-2">
          <AlertCircle className="h-3.5 w-3.5 text-destructive mt-0.5 shrink-0" />
          <p className="text-xs text-destructive">{error}</p>
          <button
            type="button"
            onClick={() => setError(null)}
            className="ml-auto text-destructive/70 hover:text-destructive"
            aria-label="Dismiss"
          >
            <X className="h-3 w-3" />
          </button>
        </div>
      )}

      {hasPhotos && (
        <>
          {/* Action bar */}
          <div className="flex items-center justify-between flex-wrap gap-2">
            <div className="text-xs text-muted-foreground">
              {photos.length} photo{photos.length === 1 ? "" : "s"}
              {hasProcessed && " · AI-ordered"}
            </div>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={handleProcess}
                disabled={processing}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-md text-white shadow transition-opacity hover:opacity-90 disabled:opacity-50"
                style={{
                  background: "linear-gradient(135deg, #1E293B 0%, #D4A35C 100%)",
                }}
                title="Run vision AI: order photos + write captions"
              >
                {processing ? (
                  <Loader2 className="h-3 w-3 animate-spin" />
                ) : (
                  <Sparkles className="h-3 w-3" />
                )}
                {hasProcessed ? "Re-process photos" : "Process photos"}
              </button>
              <button
                type="button"
                onClick={handleDownloadZip}
                disabled={!hasProcessed}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-md border border-border bg-card hover:bg-muted disabled:opacity-50 disabled:cursor-not-allowed"
                title={
                  hasProcessed
                    ? "Download renamed photos + captions.md"
                    : "Process photos first"
                }
              >
                <Download className="h-3 w-3" />
                Download zip
              </button>
              <button
                type="button"
                onClick={handleDeleteAll}
                disabled={deleting}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-md border border-destructive/30 text-destructive hover:bg-destructive/5 disabled:opacity-50"
              >
                <Trash2 className="h-3 w-3" />
                Delete all
              </button>
            </div>
          </div>

          {/* Grid */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {photos.map((p, i) => (
              <PhotoCard
                key={p.id}
                photo={p}
                position={i}
                total={photos.length}
                onMoveUp={() => handleMove(p.id, "up")}
                onMoveDown={() => handleMove(p.id, "down")}
                onDelete={() => handleDeleteOne(p.id)}
                onEditCaption={(caption) => handleEditCaption(p.id, caption)}
              />
            ))}
          </div>
        </>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// PhotoCard
// ---------------------------------------------------------------------------

interface PhotoCardProps {
  photo: ListingPhotoRow;
  position: number;
  total: number;
  onMoveUp: () => void;
  onMoveDown: () => void;
  onDelete: () => void;
  onEditCaption: (caption: string) => void;
}

function PhotoCard({
  photo,
  position,
  total,
  onMoveUp,
  onMoveDown,
  onDelete,
  onEditCaption,
}: PhotoCardProps) {
  const [caption, setCaption] = useState(photo.caption ?? "");

  // Keep local state in sync with prop changes from refresh().
  useEffect(() => {
    setCaption(photo.caption ?? "");
  }, [photo.caption]);

  const orderLabel =
    photo.suggested_order != null
      ? String(photo.suggested_order).padStart(2, "0")
      : "—";

  return (
    <div className="rounded-lg border border-border bg-card overflow-hidden flex flex-col">
      {/* Preview — we don't have a thumbnail URL stored on the row; the
          original_filename is the only display hint. A proper thumbnail
          would require a signed-URL fetch per card which is too chatty
          for v1; we render a metadata-only card instead. */}
      <div className="aspect-video bg-muted flex items-center justify-center text-xs text-muted-foreground p-3 text-center">
        <span className="truncate" title={photo.original_filename}>
          {photo.original_filename}
        </span>
      </div>
      <div className="p-3 space-y-2">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-1 text-xs font-medium text-foreground">
            <span className="inline-flex items-center justify-center min-w-[1.5rem] h-5 px-1.5 rounded bg-[#D4A35C]/15 text-[#D4A35C] font-mono">
              {orderLabel}
            </span>
            {photo.processed_at && (
              <span className="text-[10px] text-muted-foreground">AI-ordered</span>
            )}
          </div>
          <div className="flex items-center gap-0.5">
            <button
              type="button"
              onClick={onMoveUp}
              disabled={position === 0}
              className="p-1 rounded hover:bg-muted disabled:opacity-30 disabled:cursor-not-allowed"
              aria-label="Move up"
            >
              <ArrowUp className="h-3 w-3" />
            </button>
            <button
              type="button"
              onClick={onMoveDown}
              disabled={position === total - 1}
              className="p-1 rounded hover:bg-muted disabled:opacity-30 disabled:cursor-not-allowed"
              aria-label="Move down"
            >
              <ArrowDown className="h-3 w-3" />
            </button>
            <button
              type="button"
              onClick={onDelete}
              className="p-1 rounded hover:bg-destructive/10 text-destructive"
              aria-label="Delete photo"
            >
              <Trash2 className="h-3 w-3" />
            </button>
          </div>
        </div>
        <textarea
          value={caption}
          onChange={(e) => setCaption(e.target.value)}
          onBlur={() => {
            if (caption !== (photo.caption ?? "")) onEditCaption(caption);
          }}
          rows={2}
          placeholder="Caption appears here after processing — or write your own."
          className="w-full text-xs bg-background border border-border rounded px-2 py-1.5 focus:outline-none focus:ring-1 focus:ring-[#D4A35C] resize-none"
        />
      </div>
    </div>
  );
}
