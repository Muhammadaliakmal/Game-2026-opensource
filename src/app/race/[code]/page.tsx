import { notFound } from "next/navigation";
import { RaceMount } from "@/components/race/RaceMount";
import { isMatchCode, normalizeMatchCode } from "@/lib/match-code";

/**
 * A race by code.
 *
 * No `?world=`, unlike a match: laps only mean anything on a closed circuit and
 * the sector scheme in lib/race-track.ts describes exactly one, so the track is
 * the room's decision rather than the joiner's.
 */
export default async function RacePage({
  params,
}: {
  params: Promise<{ code: string }>;
}) {
  const { code } = await params;
  if (!isMatchCode(code)) notFound();

  return <RaceMount code={normalizeMatchCode(code)} />;
}
