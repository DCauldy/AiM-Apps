import { HeatBoard } from "@/components/heat/HeatBoard";

export const dynamic = "force-dynamic";

export default async function HeatBoardPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  return <HeatBoard searchId={id} />;
}
