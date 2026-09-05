"use client";

import dynamic from "next/dynamic";
import { ImmersiveMarker } from "@/components/ImmersiveMarker";
import { GameLoader } from "@/components/hud/GameLoader";
import type { Mode } from "./WorldCanvas";

/**
 * Browser-only mount for the world canvas.
 *
 * `next/dynamic` with `ssr: false` is only legal inside a Client Component, so
 * the pages stay Server Components (they need to await `params`) and hand the
 * browser-only R3F mount to this file.
 */
const WorldCanvas = dynamic(() => import("./WorldCanvas"), {
  ssr: false,
  loading: () => <GameLoader label="Loading world" />,
});

export function WorldMount({
  worldId,
  initialMode,
}: {
  worldId: string;
  initialMode: Mode;
}) {
  return (
    <>
      <ImmersiveMarker />
      <WorldCanvas worldId={worldId} initialMode={initialMode} />
    </>
  );
}
