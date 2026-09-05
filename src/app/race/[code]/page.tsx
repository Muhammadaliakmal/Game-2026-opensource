import { notFound } from "next/navigation";
import { RaceMount } from "@/components/race/RaceMount";
import { isMatchCode, normalizeMatchCode } from "@/lib/match-code";
import { MAX_RIDERS } from "@/lib/race-track";
import { IMMERSIVE_VIEWPORT } from "@/lib/immersive";

/**
 * A race by code.
 *
 * No `?world=`, unlike a match: laps only mean anything on a closed circuit and
 * the sector scheme in lib/race-track.ts describes exactly one, so the track is
 * the room's decision rather than the joiner's.
 */
export default async function RacePage({
  params,
  searchParams,
}: {
  params: Promise<{ code: string }>;
  searchParams: Promise<{ riders?: string }>;
}) {
  const { code } = await params;
  const { riders } = await searchParams;
  if (!isMatchCode(code)) notFound();

  /*
   * `?riders=` is a request, not a setting.
   *
   * It only lands if this client is the one that CREATES the room — the server
   * ignores it on a join, so somebody following a shared link cannot resize a
   * grid other people are already waiting on. Which also means the link stays
   * shareable with the parameter still on it, and does the right thing.
   */
  const n = Number(riders);
  const target =
    Number.isFinite(n) && n >= 1 && n <= MAX_RIDERS ? Math.floor(n) : undefined;

  return <RaceMount code={normalizeMatchCode(code)} target={target} />;
}

/** No pinch-zoom, no page pan: this screen is a game. See lib/immersive. */
export const viewport = IMMERSIVE_VIEWPORT;
