import { WorldMount } from "@/components/world/WorldMount";

export default async function PlayPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  // The shareable link. Same canvas as /build/<id>, opened in play mode.
  return <WorldMount worldId={id} initialMode="play" />;
}
