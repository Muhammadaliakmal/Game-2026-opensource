import { WorldMount } from "@/components/world/WorldMount";
import { IMMERSIVE_VIEWPORT } from "@/lib/immersive";

export default async function PlayPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  // The shareable link. Same canvas as /build/<id>, opened in play mode.
  return <WorldMount worldId={id} initialMode="play" />;
}

/** No pinch-zoom, no page pan: this screen is a game. See lib/immersive. */
export const viewport = IMMERSIVE_VIEWPORT;
