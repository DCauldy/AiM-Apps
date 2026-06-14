import { TourProjectRenderingClient } from "./rendering-client";

export default async function ToursProjectRenderingPage({
  params,
}: {
  params: Promise<{ projectId: string }>;
}) {
  const { projectId } = await params;
  return <TourProjectRenderingClient projectId={projectId} />;
}
