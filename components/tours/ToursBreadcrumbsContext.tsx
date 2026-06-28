"use client";

import {
  createContext,
  type ReactNode,
  useCallback,
  useContext,
  useMemo,
  useState,
} from "react";

import type { ProductNavItem } from "@/components/app-shell/ProductHeader";

const DEFAULT_TOURS_BREADCRUMBS: ProductNavItem[] = [
  { href: "/apps/tours", label: "Projects" },
];

type ToursBreadcrumbsContextValue = {
  breadcrumbItems: ProductNavItem[];
  setBreadcrumbItems: (items: ProductNavItem[]) => void;
  resetBreadcrumbItems: () => void;
};

const ToursBreadcrumbsContext =
  createContext<ToursBreadcrumbsContextValue | null>(null);

export function ToursBreadcrumbsProvider({
  children,
}: {
  children: ReactNode;
}) {
  const [breadcrumbItems, setBreadcrumbItemsState] = useState<ProductNavItem[]>(
    DEFAULT_TOURS_BREADCRUMBS,
  );

  const setBreadcrumbItems = useCallback((items: ProductNavItem[]) => {
    setBreadcrumbItemsState(items.length > 0 ? items : DEFAULT_TOURS_BREADCRUMBS);
  }, []);

  const resetBreadcrumbItems = useCallback(() => {
    setBreadcrumbItemsState(DEFAULT_TOURS_BREADCRUMBS);
  }, []);

  const value = useMemo(
    () => ({
      breadcrumbItems,
      setBreadcrumbItems,
      resetBreadcrumbItems,
    }),
    [breadcrumbItems, resetBreadcrumbItems, setBreadcrumbItems],
  );

  return (
    <ToursBreadcrumbsContext.Provider value={value}>
      {children}
    </ToursBreadcrumbsContext.Provider>
  );
}

export function useToursBreadcrumbs() {
  const context = useContext(ToursBreadcrumbsContext);
  if (!context) {
    throw new Error(
      "useToursBreadcrumbs must be used within ToursBreadcrumbsProvider.",
    );
  }
  return context;
}
