"use client";

import dynamic from "next/dynamic";
import { ImmersiveMarker } from "@/components/ImmersiveMarker";
import { GameLoader } from "@/components/hud/GameLoader";

/**
 * Browser-only mount for the match canvas — `ssr: false` is only legal inside
 * a Client Component, so the route stays a Server Component (it has to await
 * `params`) and hands the R3F tree to this file. Same split as WorldMount.
 */
const ArenaCanvas = dynamic(() => import("./ArenaCanvas"), {
  ssr: false,
  loading: () => <GameLoader label="Loading match" />,
});

export function ArenaMount({ code, worldId }: { code: string; worldId: string }) {
  return (
    <>
      <ImmersiveMarker />
      <ArenaCanvas code={code} worldId={worldId} />
    </>
  );
}
