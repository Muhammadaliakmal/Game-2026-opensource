import { notFound } from "next/navigation";
import { RaceMount } from "@/components/race/RaceMount";
import { isMatchCode, normalizeMatchCode } from "@/lib/match-code";
import { MAX_RIDERS, RACE_TRACKS } from "@/lib/race-track";
import { IMMERSIVE_VIEWPORT } from "@/lib/immersive";

/**
 * A race by code.
 *
 * `?track=` and `?riders=` are both requests the server only honours from the
 * client that CREATES the room — a shared link carries them along and does the
 * right thing, and someone joining an existing grid races it as built. Every
 * track shares the sector scheme, so there is nothing here for the lap counter
 * to disagree with.
 */
export default async function RacePage({
  params,
  searchParams,
}: {
  params: Promise<{ code: string }>;
  searchParams: Promise<{ riders?: string; track?: string }>;
}) {
  const { code } = await params;
  const { riders, track: trackParam } = await searchParams;
  if (!isMatchCode(code)) notFound();

  // Validate against the known set here too, so a junk value never reaches the
  // room option — the server would fall back anyway, but a clean undefined is
  // clearer than a bad string travelling one hop further.
  const track = RACE_TRACKS.some((t) => t.id === trackParam)
    ? trackParam
    : undefined;

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

  return (
    <RaceMount code={normalizeMatchCode(code)} target={target} track={track} />
  );
}

/** No pinch-zoom, no page pan: this screen is a game. See lib/immersive. */
export const viewport = IMMERSIVE_VIEWPORT;
