"use client";

import dynamic from "next/dynamic";
import { ImmersiveMarker } from "@/components/ImmersiveMarker";
import { GameLoader } from "@/components/hud/GameLoader";
import type { CpuDifficulty } from "@/lib/race-cpu";

/**
 * Browser-only mount for the race canvas — `ssr: false` is only legal inside a
 * Client Component, so the route stays a Server Component (it has to await
 * `params`) and hands the R3F tree to this file.
 */
const RaceCanvas = dynamic(() => import("./RaceCanvas"), {
  ssr: false,
  loading: () => <GameLoader label="Loading race" tips="race" />,
});

export function RaceMount({
  code,
  target,
  track,
  cpu,
  bots,
}: {
  code: string;
  /** The grid size the lobby asked for, when this client opens the room. */
  target?: number;
  /** The track the lobby chose, when this client opens the room. */
  track?: string;
  /** CPU riders' difficulty, when this client opens the room. */
  cpu?: CpuDifficulty;
  /** CPU riders on the grid from the start. */
  bots?: number;
}) {
  return (
    <>
      <ImmersiveMarker />
      <RaceCanvas code={code} target={target} track={track} cpu={cpu} bots={bots} />
    </>
  );
}
