import { WorldMount } from "@/components/world/WorldMount";
import { IMMERSIVE_VIEWPORT } from "@/lib/immersive";
import { RememberPlay } from "@/components/RememberPlay";
import { getBuiltInWorld } from "@/lib/built-in-worlds";
import { CountPlay } from "@/components/stats/CountPlay";

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
      <RememberPlay
        href={`/play/${id}`}
        title={getBuiltInWorld(id)?.name ?? "a world"}
        kind="world"
        // A built-in world's id IS its registry slug. A published world's is a
        // uuid, which is not in the registry — the rail shows it by name with
        // no best time beside it, which is all it has to say about one.
        slug={id}
      />
      {/* Ten seconds of play, once per tab session. A world somebody
          published is not a registry slug and is ignored here — it has its
          own counter. See the component. */}
      <CountPlay slug={id} />
    </>
  );
}

/** No pinch-zoom, no page pan: this screen is a game. See lib/immersive. */
export const viewport = IMMERSIVE_VIEWPORT;
