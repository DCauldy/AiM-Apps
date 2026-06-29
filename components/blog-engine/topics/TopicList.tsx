"use client";

import { useState, useMemo } from "react";
import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
} from "@dnd-kit/core";
import {
  arrayMove,
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import {
  Play,
  SkipForward,
  Loader2,
  TrendingUp,
  Building,
  FileText,
  GripVertical,
} from "lucide-react";
import { cn } from "@/lib/utils";
import type { BofuTopic, TopicStatus } from "@/types/blog-engine";

interface TopicListProps {
  topics: BofuTopic[];
  onWriteTopic: (topicId: string) => void;
  onSkipTopic: (topicId: string) => void;
  onReorder?: (orderedIds: string[]) => void;
  isRunning: boolean;
}

const STATUS_LABELS: Record<TopicStatus, string> = {
  unused: "Available",
  writing: "Writing...",
  written: "Written",
  skipped: "Skipped",
  expired: "Expired",
};

const STATUS_COLORS: Record<TopicStatus, string> = {
  unused: "border border-[#31DBA5]/40 text-[#31DBA5]",
  writing: "border border-blue-400/40 text-blue-400",
  written: "border border-border text-muted-foreground",
  skipped: "border border-border text-muted-foreground",
  expired: "border border-border text-muted-foreground",
};

const INQUIRY_ICONS: Record<string, React.ElementType> = {
  property: Building,
  process: FileText,
};

const UPCOMING_STATUSES: TopicStatus[] = ["unused", "writing"];
const COMPLETED_STATUSES: TopicStatus[] = ["written", "skipped", "expired"];

// ── Sortable topic card ──────────────────────────────────────────────
function SortableTopicCard({
  topic,
  onWriteTopic,
  onSkipTopic,
  isRunning,
  isDraggable,
}: {
  topic: BofuTopic;
  onWriteTopic: (id: string) => void;
  onSkipTopic: (id: string) => void;
  isRunning: boolean;
  isDraggable: boolean;
}) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: topic.id, disabled: !isDraggable });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
  };

  const InquiryIcon =
    INQUIRY_ICONS[topic.inquiry_type || "process"] || FileText;

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={cn(
        "rounded-lg border bg-card p-4 hover:bg-accent/30 transition-colors",
        isDragging && "opacity-50 shadow-lg z-10"
      )}
    >
      <div className="flex items-start justify-between gap-4">
        <div className="flex items-start gap-2 flex-1 min-w-0">
          {/* Drag handle */}
          {isDraggable && (
            <button
              className="mt-0.5 cursor-grab active:cursor-grabbing text-muted-foreground hover:text-foreground touch-none"
              {...attributes}
              {...listeners}
            >
              <GripVertical className="h-4 w-4" />
            </button>
          )}

          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 mb-1">
              <InquiryIcon className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
              <h4 className="text-sm font-medium text-foreground truncate">
                {topic.title}
              </h4>
            </div>
            {topic.description && (
              <p className="text-xs text-muted-foreground line-clamp-2 ml-5">
                {topic.description}
              </p>
            )}
            <div className="flex items-center gap-3 mt-2 ml-5">
              {topic.bofu_score != null && (
                <span className="flex items-center gap-1 text-xs text-muted-foreground">
                  <TrendingUp className="h-3 w-3" />
                  BOFU: {Math.round(topic.bofu_score)}
                </span>
              )}
              <span
                className={cn(
                  "px-1.5 py-0.5 rounded text-[10px] font-medium",
                  STATUS_COLORS[topic.status]
                )}
              >
                {STATUS_LABELS[topic.status]}
              </span>
              {topic.inquiry_type && (
                <span className="text-[10px] text-muted-foreground capitalize">
                  {topic.inquiry_type}
                </span>
              )}
            </div>
          </div>
        </div>

        {/* Actions */}
        {topic.status === "unused" && (
          <div className="flex items-center gap-1 shrink-0">
            <button
              onClick={() => onWriteTopic(topic.id)}
              disabled={isRunning}
              className="flex items-center gap-1 px-2.5 py-1.5 text-xs font-medium rounded-md bg-primary text-primary-foreground hover:bg-primary/90 disabled:opacity-50 transition-colors"
            >
              {isRunning ? (
                <Loader2 className="h-3 w-3 animate-spin" />
              ) : (
                <Play className="h-3 w-3" />
              )}
              Write
            </button>
            <button
              onClick={() => onSkipTopic(topic.id)}
              className="flex items-center gap-1 px-2 py-1.5 text-xs text-muted-foreground hover:text-foreground rounded-md hover:bg-accent transition-colors"
            >
              <SkipForward className="h-3 w-3" />
              Skip
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

// ── Static topic card (no drag) ──────────────────────────────────────
function StaticTopicCard({
  topic,
}: {
  topic: BofuTopic;
}) {
  const InquiryIcon =
    INQUIRY_ICONS[topic.inquiry_type || "process"] || FileText;

  return (
    <div className="rounded-lg border bg-card p-4 hover:bg-accent/30 transition-colors">
      <div className="flex items-start justify-between gap-4">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-1">
            <InquiryIcon className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
            <h4 className="text-sm font-medium text-foreground truncate">
              {topic.title}
            </h4>
          </div>
          {topic.description && (
            <p className="text-xs text-muted-foreground line-clamp-2 ml-5">
              {topic.description}
            </p>
          )}
          <div className="flex items-center gap-3 mt-2 ml-5">
            {topic.bofu_score != null && (
              <span className="flex items-center gap-1 text-xs text-muted-foreground">
                <TrendingUp className="h-3 w-3" />
                BOFU: {Math.round(topic.bofu_score)}
              </span>
            )}
            <span
              className={cn(
                "px-1.5 py-0.5 rounded text-[10px] font-medium",
                STATUS_COLORS[topic.status]
              )}
            >
              {STATUS_LABELS[topic.status]}
            </span>
            {topic.inquiry_type && (
              <span className="text-[10px] text-muted-foreground capitalize">
                {topic.inquiry_type}
              </span>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

// ── Main component ───────────────────────────────────────────────────
export function TopicList({
  topics,
  onWriteTopic,
  onSkipTopic,
  onReorder,
  isRunning,
}: TopicListProps) {
  const [filter, setFilter] = useState<TopicStatus | "all">("all");

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
  );

  const filteredTopics = useMemo(
    () =>
      filter === "all"
        ? topics
        : topics.filter((t) => t.status === filter),
    [topics, filter]
  );

  const upcomingTopics = useMemo(
    () => filteredTopics.filter((t) => UPCOMING_STATUSES.includes(t.status)),
    [filteredTopics]
  );

  const completedTopics = useMemo(
    () => filteredTopics.filter((t) => COMPLETED_STATUSES.includes(t.status)),
    [filteredTopics]
  );

  const filterOptions: { label: string; value: TopicStatus | "all" }[] = [
    { label: "All", value: "all" },
    { label: "Available", value: "unused" },
    { label: "Written", value: "written" },
    { label: "Skipped", value: "skipped" },
  ];

  // Whether the current view supports dragging
  const isDragEnabled = filter === "all" || filter === "unused";
  const draggableTopics = isDragEnabled
    ? (filter === "all" ? upcomingTopics : filteredTopics)
    : [];

  function handleDragEnd(event: DragEndEvent) {
    const { active, over } = event;
    if (!over || active.id === over.id) return;

    const oldIndex = draggableTopics.findIndex((t) => t.id === active.id);
    const newIndex = draggableTopics.findIndex((t) => t.id === over.id);
    if (oldIndex === -1 || newIndex === -1) return;

    const reordered = arrayMove(draggableTopics, oldIndex, newIndex);
    onReorder?.(reordered.map((t) => t.id));
  }

  // Render a drag-enabled list of topics
  function renderDraggableList(items: BofuTopic[]) {
    return (
      <DndContext
        sensors={sensors}
        collisionDetection={closestCenter}
        onDragEnd={handleDragEnd}
      >
        <SortableContext
          items={items.map((t) => t.id)}
          strategy={verticalListSortingStrategy}
        >
          <div className="space-y-2">
            {items.map((topic) => (
              <SortableTopicCard
                key={topic.id}
                topic={topic}
                onWriteTopic={onWriteTopic}
                onSkipTopic={onSkipTopic}
                isRunning={isRunning}
                isDraggable
              />
            ))}
          </div>
        </SortableContext>
      </DndContext>
    );
  }

  return (
    <div>
      {/* Filter tabs */}
      <div className="flex items-center gap-1 mb-4">
        {filterOptions.map((option) => (
          <button
            key={option.value}
            onClick={() => setFilter(option.value)}
            className={cn(
              "px-3 py-1.5 text-xs font-medium rounded-md transition-colors",
              filter === option.value
                ? "bg-primary text-primary-foreground"
                : "text-muted-foreground hover:text-foreground hover:bg-accent"
            )}
          >
            {option.label}
          </button>
        ))}
      </div>

      {/* Topic cards */}
      {filteredTopics.length === 0 ? (
        <div className="text-center py-12">
          <p className="text-sm text-muted-foreground">
            No topics found. Topics are discovered automatically during blog
            generation.
          </p>
        </div>
      ) : filter === "all" ? (
        // "All" tab: show Upcoming + Completed sections
        <div className="space-y-6">
          {upcomingTopics.length > 0 && (
            <div>
              <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-3">
                Upcoming
              </h3>
              {renderDraggableList(upcomingTopics)}
            </div>
          )}
          {completedTopics.length > 0 && (
            <div>
              <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-3">
                Completed
              </h3>
              <div className="space-y-2">
                {completedTopics.map((topic) => (
                  <StaticTopicCard key={topic.id} topic={topic} />
                ))}
              </div>
            </div>
          )}
        </div>
      ) : isDragEnabled ? (
        // "Available" tab: draggable
        renderDraggableList(filteredTopics)
      ) : (
        // "Written" / "Skipped" tabs: static
        <div className="space-y-2">
          {filteredTopics.map((topic) => (
            <StaticTopicCard key={topic.id} topic={topic} />
          ))}
        </div>
      )}
    </div>
  );
}
