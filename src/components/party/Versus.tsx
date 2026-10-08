"use client";

import { useArcade } from "@/arcade/store";
import { partyStart } from "@/lib/net/party";
import { partyGame, rankScores } from "@/lib/party-games";
import { selectIsHost, usePartyStore, type PartyMemberView } from "@/stores/party-store";

/**
 * What a party round adds to the cabinet overlay: everyone's running score
 * over the game, and the standings where "Again" would be.
 */

function useRanked() {
  const members = usePartyStore((s) => s.members);
  return rankScores(members.filter((m) => m.playing));
}

/** A board or duel round is ranked by place; its "score" is only the sort key. */
function usePlacesOnly() {
  const game = usePartyStore((s) => s.game);
  return partyGame(game)?.kind !== "score";
}

function ordinal(n: number): string {
  const suffix = n === 1 ? "st" : n === 2 ? "nd" : n === 3 ? "rd" : "th";
  return `${n}${suffix}`;
}

/**
 * The live scoreboard, top-left over the canvas.
 *
 * `pointer-events: none` — it sits over the game, and every touch there
 * belongs to the game. Capped at four rows plus you, because eight names
 * down the side of a phone in landscape is most of the screen.
 */
export function VersusStrip() {
  const ranked = useRanked();
  const selfId = usePartyStore((s) => s.selfId);
  const placesOnly = usePlacesOnly();
  // A table game is played on one shared board, which already shows everyone.
  if (ranked.length < 2 || placesOnly) return null;
  const top = ranked.slice(0, 4);
  const me = ranked.find((r) => r.row.id === selfId);
  const rows = me && !top.includes(me) ? [...top, me] : top;

  return (
    <ol
      className="pointer-events-none absolute left-3 top-3 z-10 flex flex-col gap-1"
      aria-label="Party scores"
    >
      {rows.map(({ row, place }) => (
        <li
          key={row.id}
          className={`hud-chip num flex items-center gap-2 py-1 text-xs ${
            row.id === selfId ? "ring-accent ring-1" : "opacity-85"
          }`}
        >
          <span className="text-dim w-6">{ordinal(place)}</span>
          <span className="max-w-[9rem] truncate">{row.name}</span>
          <span className="font-semibold">{row.score}</span>
          {row.done && <span aria-label="finished">✓</span>}
        </li>
      ))}
    </ol>
  );
}

/** The standings, in the death screen's panel. Replaces Again for a party round. */
export function VersusResults() {
  const ranked = useRanked();
  const selfId = usePartyStore((s) => s.selfId);
  const phase = usePartyStore((s) => s.phase);
  const isHost = usePartyStore(selectIsHost);
  const placesOnly = usePlacesOnly();
  const waiting = ranked.filter(({ row }) => !row.done).length;

  return (
    <div className="flex w-full max-w-xs flex-col gap-3">
      <ol className="flex flex-col gap-1.5" aria-label="Standings">
        {ranked.map(({ row, place }) => (
          <Row
            key={row.id}
            row={row}
            place={place}
            self={row.id === selfId}
            final={phase === "results"}
            placesOnly={placesOnly}
          />
        ))}
      </ol>
      {phase === "playing" && waiting > 0 && (
        <p className="text-dim text-center text-xs" role="status">
          Waiting for {waiting} {waiting === 1 ? "player" : "players"} to finish…
        </p>
      )}
      <div className="flex justify-center gap-2">
        {isHost && phase === "results" && (
          <button type="button" className="hud-chip hud-chip--primary" onClick={partyStart}>
            Rematch
          </button>
        )}
        {!isHost && phase === "results" && (
          <p className="text-dim self-center text-xs">The host picks what is next.</p>
        )}
        <button type="button" className="hud-chip" onClick={() => useArcade.getState().close()}>
          Back to party
        </button>
      </div>
    </div>
  );
}

function Row({
  row,
  place,
  self,
  final,
  placesOnly,
}: {
  row: PartyMemberView;
  place: number;
  self: boolean;
  final: boolean;
  placesOnly: boolean;
}) {
  return (
    <li
      className={`card flex items-center gap-3 px-3 py-2 text-sm ${self ? "border-accent" : ""}`}
    >
      <span className={`num w-8 font-semibold ${final && place === 1 ? "text-accent" : "text-dim"}`}>
        {ordinal(place)}
      </span>
      <span className="text-ink min-w-0 flex-1 truncate">
        {row.name}
        {self && <span className="text-dim"> (you)</span>}
      </span>
      {!placesOnly && <span className="num font-semibold">{row.score}</span>}
      <span className="text-dim w-4 text-xs" aria-label={row.done ? "finished" : "still playing"}>
        {row.done ? "✓" : "…"}
      </span>
    </li>
  );
}
