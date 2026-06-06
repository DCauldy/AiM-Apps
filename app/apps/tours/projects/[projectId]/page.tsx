import { notFound } from "next/navigation";
import { TourProjectWorkspace } from "@/components/tours/workspace/TourProjectWorkspace";
import { getTourProjectWorkspaceViewModel } from "@/lib/tours/workspace";

export default async function TourProjectWorkspacePage({
  params,
}: {
  params: Promise<{ projectId: string }>;
}) {
  const { projectId } = await params;
  const viewModel = await getTourProjectWorkspaceViewModel(projectId);

  if (!viewModel) {
    notFound();
  }

  return <TourProjectWorkspace viewModel={viewModel} />;
}
