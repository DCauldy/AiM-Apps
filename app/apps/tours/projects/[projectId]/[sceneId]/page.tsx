import { TourProjectSceneWorkspace } from "@/components/tours/workspace/TourProjectSceneWorkspace";

export default async function TourProjectSceneWorkspacePage({
  params,
}: {
  params: Promise<{ sceneId: string }>;
}) {
  const { sceneId } = await params;

  return <TourProjectSceneWorkspace initialSceneId={sceneId} />;
}
