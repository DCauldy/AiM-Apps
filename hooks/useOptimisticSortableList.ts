"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { arrayMove } from "@dnd-kit/sortable";

export type OptimisticSortableId = string | number;

export type OptimisticSortableListOptions<TItem> = {
  items: TItem[];
  getId: (item: TItem) => OptimisticSortableId;
  getSyncKey?: (item: TItem) => string;
  isLocked?: boolean;
  onPersistOrder: (orderedIds: string[], orderedItems: TItem[]) => Promise<unknown> | void;
};

export type OptimisticSortableListState<TItem> = {
  items: TItem[];
  itemIds: string[];
  isPending: boolean;
  error: Error | null;
  moveItem: (itemId: OptimisticSortableId, direction: "up" | "down") => void;
  reorderById: (activeId: OptimisticSortableId, overId: OptimisticSortableId | null | undefined) => void;
  updateItem: (itemId: OptimisticSortableId, update: (item: TItem) => TItem) => void;
  setItems: (items: TItem[]) => void;
  resetError: () => void;
};

function normalizeId(id: OptimisticSortableId) {
  return String(id);
}

export function useOptimisticSortableList<TItem>({
  items,
  getId,
  getSyncKey,
  isLocked = false,
  onPersistOrder,
}: OptimisticSortableListOptions<TItem>): OptimisticSortableListState<TItem> {
  const [optimisticItems, setOptimisticItems] = useState(items);
  const [isPending, setIsPending] = useState(false);
  const [error, setError] = useState<Error | null>(null);
  const externalOrderKey = useMemo(() => items.map((item) => normalizeId(getId(item))).join("\u001f"), [getId, items]);
  const externalSyncKey = useMemo(
    () => items.map((item) => `${normalizeId(getId(item))}\u001e${getSyncKey?.(item) ?? ""}`).join("\u001f"),
    [getId, getSyncKey, items]
  );
  const lastSyncedExternalOrderKey = useRef(externalOrderKey);
  const lastSyncedExternalSyncKey = useRef(externalSyncKey);
  const expectedOrderKey = useRef<string | null>(null);
  const itemIds = useMemo(() => optimisticItems.map((item) => normalizeId(getId(item))), [getId, optimisticItems]);

  useEffect(() => {
    if (isPending) {
      return;
    }

    if (expectedOrderKey.current && externalOrderKey !== expectedOrderKey.current) {
      return;
    }

    if (
      externalOrderKey !== lastSyncedExternalOrderKey.current ||
      externalSyncKey !== lastSyncedExternalSyncKey.current
    ) {
      expectedOrderKey.current = null;
      lastSyncedExternalOrderKey.current = externalOrderKey;
      lastSyncedExternalSyncKey.current = externalSyncKey;
      setOptimisticItems(items);
    }
  }, [externalOrderKey, externalSyncKey, isPending, items]);

  const persistOrder = useCallback(
    (nextItems: TItem[], previousItems: TItem[]) => {
      setOptimisticItems(nextItems);
      setIsPending(true);
      setError(null);

      const orderedIds = nextItems.map((item) => normalizeId(getId(item)));
      expectedOrderKey.current = orderedIds.join("\u001f");

      Promise.resolve(onPersistOrder(orderedIds, nextItems))
        .catch((caughtError) => {
          expectedOrderKey.current = null;
          setOptimisticItems(previousItems);
          setError(caughtError instanceof Error ? caughtError : new Error("Could not save item order."));
        })
        .finally(() => {
          setIsPending(false);
        });
    },
    [getId, onPersistOrder]
  );

  const reorderById = useCallback(
    (activeId: OptimisticSortableId, overId: OptimisticSortableId | null | undefined) => {
      if (isLocked || overId == null || normalizeId(activeId) === normalizeId(overId)) {
        return;
      }

      const previousItems = optimisticItems;
      const previousIds = previousItems.map((item) => normalizeId(getId(item)));
      const oldIndex = previousIds.indexOf(normalizeId(activeId));
      const newIndex = previousIds.indexOf(normalizeId(overId));
      if (oldIndex < 0 || newIndex < 0) {
        return;
      }

      persistOrder(arrayMove(previousItems, oldIndex, newIndex), previousItems);
    },
    [getId, isLocked, optimisticItems, persistOrder]
  );

  const moveItem = useCallback(
    (itemId: OptimisticSortableId, direction: "up" | "down") => {
      if (isLocked) {
        return;
      }

      const previousItems = optimisticItems;
      const currentIndex = previousItems.findIndex((item) => normalizeId(getId(item)) === normalizeId(itemId));
      const nextIndex = direction === "up" ? currentIndex - 1 : currentIndex + 1;
      if (currentIndex < 0 || nextIndex < 0 || nextIndex >= previousItems.length) {
        return;
      }

      persistOrder(arrayMove(previousItems, currentIndex, nextIndex), previousItems);
    },
    [getId, isLocked, optimisticItems, persistOrder]
  );

  const updateItem = useCallback(
    (itemId: OptimisticSortableId, update: (item: TItem) => TItem) => {
      setOptimisticItems((currentItems) =>
        currentItems.map((item) => (normalizeId(getId(item)) === normalizeId(itemId) ? update(item) : item))
      );
    },
    [getId]
  );

  return {
    items: optimisticItems,
    itemIds,
    isPending,
    error,
    moveItem,
    reorderById,
    updateItem,
    setItems: setOptimisticItems,
    resetError: () => setError(null),
  };
}
