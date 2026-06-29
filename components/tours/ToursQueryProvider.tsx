"use client";

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

const toursQueryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 30_000,
      refetchOnWindowFocus: false,
    },
  },
});

export function ToursQueryProvider({ children }: { children: React.ReactNode }) {
  return <QueryClientProvider client={toursQueryClient}>{children}</QueryClientProvider>;
}
