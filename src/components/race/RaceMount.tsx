"use client";

import dynamic from "next/dynamic";
import { ImmersiveMarker } from "@/components/ImmersiveMarker";
import { GameLoader } from "@/components/hud/GameLoader";

/**
 * Browser-only mount for the race canvas — `ssr: false` is only legal inside a
 * Client Component, so the route stays a Server Component (it has to await
 * `params`) and hands the R3F tree to this file. Same split as ArenaMount.
 */
const RaceCanvas = dynamic(() => import("./RaceCanvas"), {
  ssr: false,
  loading: () => <GameLoader label="Loading race" tips="race" />,
});

export function RaceMount({
  code,
  target,
  track,
}: {
  code: string;
  /** The grid size the lobby asked for, when this client opens the room. */
  target?: number;
  /** The track the lobby chose, when this client opens the room. */
  track?: string;
}) {
  return (
    <>
      <ImmersiveMarker />
      <RaceCanvas code={code} target={target} track={track} />
    </>
  );
}
