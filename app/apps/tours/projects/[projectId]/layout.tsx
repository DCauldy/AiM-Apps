import { notFound } from "next/navigation";
import { TourProjectLayoutClient } from "./layout-client";
import { isTourRenderDevToolAvailable } from "@/lib/tours/rendering/tour-render-dev-tool-availability";
import { getTourProjectWorkspaceViewModel } from "@/lib/tours/workspace";

export default async function TourProjectLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ projectId: string }>;
}) {
  const { projectId } = await params;
  const viewModel = await getTourProjectWorkspaceViewModel(projectId);

  if (!viewModel) {
    notFound();
  }

  return (
    <TourProjectLayoutClient
      initialViewModel={viewModel}
      isQaRenderLabAvailable={isTourRenderDevToolAvailable()}
    >
      {children}
    </TourProjectLayoutClient>
  );
}
