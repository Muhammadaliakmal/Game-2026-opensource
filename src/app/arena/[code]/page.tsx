import { notFound } from "next/navigation";
import { ArenaMount } from "@/components/arena/ArenaMount";
import { isMatchCode, normalizeMatchCode } from "@/lib/match-code";
import { IMMERSIVE_VIEWPORT } from "@/lib/immersive";

/**
 * A match by code. `?world=` only matters for whoever opens it — anyone
 * following the link inherits the world the match was created with, which is
 * why the room ignores the second client's choice.
 */
export default async function MatchPage({
  params,
  searchParams,
}: {
  params: Promise<{ code: string }>;
  searchParams: Promise<{ world?: string }>;
}) {
  const { code } = await params;
  const { world } = await searchParams;
  if (!isMatchCode(code)) notFound();

  return (
    <ArenaMount code={normalizeMatchCode(code)} worldId={world ?? "parkour"} />
  );
}

/** No pinch-zoom, no page pan: this screen is a game. See lib/immersive. */
export const viewport = IMMERSIVE_VIEWPORT;
