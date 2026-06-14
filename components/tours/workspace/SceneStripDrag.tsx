"use client";

import {
  DndContext,
  KeyboardSensor,
  MouseSensor,
  TouchSensor,
  closestCenter,
  type DragEndEvent,
  type Modifier,
  useSensor,
  useSensors,
} from "@dnd-kit/core";
import {
  SortableContext,
  horizontalListSortingStrategy,
  sortableKeyboardCoordinates,
  useSortable,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { Plus } from "lucide-react";
import { useCallback } from "react";
import type { OptimisticSortableId } from "@/hooks/useOptimisticSortableList";
import type { TourScene } from "@/lib/tours/workspace";

type SceneStripDragAxis = "horizontal" | "free";

const SCENE_STRIP_DND_CONFIG: {
  dragAxis: SceneStripDragAxis;
} = {
  dragAxis: "horizontal",
};

const restrictSceneDragToHorizontalAxis: Modifier = ({ transform }) => ({
  ...transform,
  y: 0,
});

function getSceneStripDragModifiers(config: typeof SCENE_STRIP_DND_CONFIG) {
  const modifiers: Modifier[] = [];
  if (config.dragAxis === "horizontal") {
    modifiers.push(restrictSceneDragToHorizontalAxis);
  }
  return modifiers;
}

function getSceneStripTransform(transform: Parameters<typeof CSS.Transform.toString>[0]) {
  if (!transform || SCENE_STRIP_DND_CONFIG.dragAxis !== "horizontal") {
    return transform;
  }

  return {
    ...transform,
    y: 0,
  };
}

function sceneShortLabel(scene: TourScene, index: number) {
  return scene.title.trim().charAt(0).toUpperCase() || String(index + 1);
}

export function useSceneStripDragEnd({
  reorderById,
}: {
  reorderById: (activeId: OptimisticSortableId, overId: OptimisticSortableId | null | undefined) => void;
}) {
  return useCallback(
    (event: DragEndEvent) => {
      const { active, over } = event;
      reorderById(active.id, over?.id);
    },
    [reorderById]
  );
}

function SceneTabButton({
  scene,
  index,
  isActive,
  isReordering,
  onSelect,
}: {
  scene: TourScene;
  index: number;
  isActive: boolean;
  isReordering: boolean;
  onSelect: () => void;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: scene.id,
    disabled: isReordering,
  });
  const style = {
    transform: CSS.Transform.toString(getSceneStripTransform(transform)),
    transition,
  };

  return (
    <button
      ref={setNodeRef}
      style={style}
      type="button"
      onClick={onSelect}
      disabled={isReordering}
      className={`relative h-16 w-16 flex-none cursor-grab touch-pan-x overflow-hidden rounded-md border bg-muted text-sm font-semibold transition-colors active:cursor-grabbing disabled:cursor-not-allowed ${
        isActive
          ? "border-primary ring-2 ring-primary/25"
          : "border-border bg-background text-foreground hover:border-primary/60"
      } ${isDragging ? "z-10 shadow-lg" : ""}`}
      {...attributes}
      {...listeners}
    >
      {scene.authoritativePhoto.previewUrl ? (
        <img
          src={scene.authoritativePhoto.previewUrl}
          alt={`${scene.title} scene`}
          className="h-16 w-16 object-cover"
        />
      ) : (
        <span className="flex h-16 w-16 items-center justify-center bg-muted">
          {sceneShortLabel(scene, index)}
        </span>
      )}
      <span className="absolute inset-x-0 bottom-0 truncate bg-background/85 px-1.5 py-1 text-left text-[11px] font-medium text-foreground backdrop-blur-sm">
        {scene.title}
      </span>
    </button>
  );
}

export function SceneStrip({
  scenes,
  itemIds,
  activeSceneId,
  isReordering,
  onSelectScene,
  onAddScene,
  onDragEnd,
}: {
  scenes: TourScene[];
  itemIds: string[];
  activeSceneId: string | null;
  isReordering: boolean;
  onSelectScene: (sceneId: string) => void;
  onAddScene: () => void;
  onDragEnd: (event: DragEndEvent) => void;
}) {
  const sensors = useSensors(
    useSensor(MouseSensor, { activationConstraint: { distance: 6 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 180, tolerance: 8 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
  );
  const sceneStripDragModifiers = getSceneStripDragModifiers(SCENE_STRIP_DND_CONFIG);

  return (
    <div
      className="flex max-w-full touch-pan-x items-start gap-2 overflow-x-auto overflow-y-hidden pb-2"
      data-testid="tour-scene-strip"
    >
      <DndContext
        sensors={sensors}
        collisionDetection={closestCenter}
        modifiers={sceneStripDragModifiers}
        onDragEnd={onDragEnd}
      >
        <SortableContext items={itemIds} strategy={horizontalListSortingStrategy}>
          <div className="flex min-w-max flex-none gap-2">
            {scenes.map((scene, index) => (
              <SceneTabButton
                key={scene.id}
                scene={scene}
                index={index}
                isActive={scene.id === activeSceneId}
                isReordering={isReordering}
                onSelect={() => onSelectScene(scene.id)}
              />
            ))}
          </div>
        </SortableContext>
      </DndContext>
      <button
        type="button"
        onClick={onAddScene}
        aria-label="Add scene"
        className="flex h-16 w-16 flex-none items-center justify-center rounded-md border border-dashed border-border bg-muted/30 text-muted-foreground transition-colors hover:border-primary/60 hover:bg-muted hover:text-foreground"
      >
        <Plus className="h-6 w-6" />
      </button>
    </div>
  );
}
