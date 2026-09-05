import { WorldMount } from "@/components/world/WorldMount";
import { IMMERSIVE_VIEWPORT } from "@/lib/immersive";

export default async function BuildPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  // Build and Play are one canvas with a mode (see WorldCanvas); the route
  // only decides which mode it opens in, and switching does not navigate.
  return <WorldMount worldId={id} initialMode="build" />;
}

/** No pinch-zoom, no page pan: this screen is a game. See lib/immersive. */
export const viewport = IMMERSIVE_VIEWPORT;
