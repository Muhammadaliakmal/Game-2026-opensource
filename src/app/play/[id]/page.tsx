import { WorldMount } from "@/components/world/WorldMount";
import { IMMERSIVE_VIEWPORT } from "@/lib/immersive";
import { RememberPlay } from "@/components/RememberPlay";
import { getBuiltInWorld } from "@/lib/built-in-worlds";

export default async function PlayPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  // The shareable link. Same canvas as /build/<id>, opened in play mode.
  return (
    <>
      <WorldMount worldId={id} initialMode="play" />
      {/* A built-in world has a name here; a player's world is loaded by the
          canvas and named there, so the chip says "a world" for it. */}
      <RememberPlay href={`/play/${id}`} title={getBuiltInWorld(id)?.name ?? "a world"} kind="world" />
    </>
  );
}

/** No pinch-zoom, no page pan: this screen is a game. See lib/immersive. */
export const viewport = IMMERSIVE_VIEWPORT;
