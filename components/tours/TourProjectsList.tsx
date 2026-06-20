"use client";

import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import { ArrowRight, RefreshCw } from "lucide-react";
import {
  DashboardCard,
  EmptyState,
} from "@/components/app-shell/PagePrimitives";
import { Button } from "@/components/ui/button";
import { fetchOpenTourProjects, tourQueryKeys } from "@/components/tours/tours-api-client";

function formatDate(value: string) {
  return new Intl.DateTimeFormat(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
  }).format(new Date(value));
}

export function TourProjectsList() {
  const {
    data: projects,
    error,
    isLoading,
    refetch,
  } = useQuery({
    queryKey: tourQueryKeys.openProjects(),
    queryFn: fetchOpenTourProjects,
  });

  if (isLoading) {
    return (
      <section className="space-y-4">
        <div className="flex items-center justify-between gap-4">
          <h2 className="text-sm font-semibold">Open projects</h2>
          <div className="h-4 w-16 animate-pulse rounded bg-muted" />
        </div>
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {[0, 1, 2].map((item) => (
            <div
              key={item}
              className="rounded-lg border border-border bg-card p-5"
            >
              <div className="h-5 w-56 animate-pulse rounded bg-muted" />
              <div className="mt-2 h-4 w-80 max-w-full animate-pulse rounded bg-muted" />
              <div className="mt-6 h-9 w-24 animate-pulse rounded bg-muted" />
            </div>
          ))}
        </div>
      </section>
    );
  }

  if (error) {
    return (
      <DashboardCard className="text-center">
        <h2 className="text-xl font-semibold text-foreground">
          Could not load tour projects
        </h2>
        <p className="mx-auto mt-2 max-w-xl text-sm text-muted-foreground">
          {error.message}
        </p>
        <Button
          type="button"
          onClick={() => refetch()}
          variant="outline"
          className="mt-5"
        >
          <RefreshCw className="h-4 w-4" />
          Try again
        </Button>
      </DashboardCard>
    );
  }

  if (!projects || projects.length === 0) {
    return (
      <section className="space-y-4">
        <h2 className="text-sm font-semibold">Open projects</h2>
        <EmptyState text="No open tour projects yet. Create a project to open its workspace." />
      </section>
    );
  }

  return (
    <section className="space-y-4">
      <div className="flex items-center justify-between gap-4">
        <div>
          <h2 className="text-sm font-semibold">Open projects</h2>
        </div>
        <span className="text-xs text-muted-foreground">
          {projects.length} active
        </span>
      </div>
      <div>
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {projects.map((project) => (
            <div
              key={project.id}
              className="overflow-hidden rounded-lg border border-border bg-card"
            >
              {project.cover_photo_preview_url && (
                <Link
                  href={`/apps/tours/projects/${project.id}`}
                  className="block aspect-[16/9] bg-muted"
                >
                  <img
                    src={project.cover_photo_preview_url}
                    alt={`First TourScene photo for ${project.name}`}
                    className="h-full w-full object-cover transition-transform duration-200 hover:scale-[1.02]"
                  />
                </Link>
              )}
              <div className="p-4">
                <Link
                  href={`/apps/tours/projects/${project.id}`}
                  className="group block min-w-0"
                >
                  <h3 className="text-sm font-semibold text-foreground">
                    {project.name}
                  </h3>
                  <p className="mt-1 truncate text-xs text-muted-foreground">
                    {project.property_address}
                  </p>
                </Link>
                <div className="mt-3 flex items-center justify-between gap-3">
                  <p className="text-xs text-muted-foreground">
                    Created {formatDate(project.created_at)}
                  </p>
                  <Button asChild variant="outline" size="sm">
                    <Link href={`/apps/tours/projects/${project.id}`}>
                      Open
                      <ArrowRight className="h-3.5 w-3.5" />
                    </Link>
                  </Button>
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
