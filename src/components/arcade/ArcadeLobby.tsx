"use client";

import dynamic from "next/dynamic";
import { CABINETS, entryFor } from "@/arcade/registry";
import { RememberPlay } from "@/components/RememberPlay";
import { useArcade } from "@/arcade/store";
import { RATES } from "@/lib/arcade-payout";
import { ControlsHint } from "@/components/hud/Hotkey";
import { CabinetPreview } from "./CabinetPreview";

/**
 * The row of cabinets, and the thing that opens one.
 *
 * ── Why the arcade has a page at all ─────────────────────────────────────
 *
 * The spec puts the cabinets in a room in the 3D world and is right that a
 * reward which never leaves the minigame makes the minigame a separate app.
 * But this codebase has many worlds rather than one, and every other mode here
 * — parkour, race, the shop — already has a page of its own that says what it
 * is before you are standing in it. A cabinet in the world is the *place* you
 * play; this is the sign on the door, and it is also the only honest way to
 * reach a game before deciding which world to walk into.
 *
 * The two are the same games and the same store: opening one from here and
 * opening one from a cabinet are the same call.
 */
const ArcadeOverlay = dynamic(() => import("@/arcade/host/ArcadeOverlay"), {
  ssr: false,
});

export function ArcadeLobby() {
  const open = useArcade((s) => s.open);
  const activeGame = useArcade((s) => s.activeGame);
  const best = useArcade((s) => s.best);

  return (
    <>
      <ul className="grid gap-4 sm:grid-cols-2">
        {CABINETS.map((entry) => (
          <li key={entry.id}>
            <button
              type="button"
              onClick={() => open(entry.id)}
              className="group card hover:border-accent/70 focus-visible:border-accent/70 block w-full overflow-hidden text-left transition-colors"
            >
              {/* The shelf display. It used to be an empty rectangle holding
                  two labels, which is what an arcade with nothing on its
                  shelves looks like. `CabinetPreview` draws the game's verb
                  from the same numbers the game is built from — see that file
                  for why it is generated rather than captured. */}
              <div className="relative aspect-[5/2] w-full overflow-hidden bg-[#0b1030]">
                <CabinetPreview id={entry.id} />
                <span className="hud-label text-accent absolute bottom-2 left-3">
                  {RATES[entry.id]
                    ? `${RATES[entry.id]} coins per point`
                    : "Practice"}
                </span>
                {/* Always rendered, reading an em dash when unplayed.

                    It used to appear only once there was a score, so the first
                    run on a cabinet silently changed the card's layout — and a
                    row of cards where one has a slot the other does not reads
                    as a rendering fault rather than as progress. */}
                <span className="hud-label num absolute right-3 bottom-2">
                  best {best[entry.id] ? best[entry.id] : "—"}
                </span>
              </div>
              <div className="flex flex-col gap-1 p-4">
                <h3 className="text-ink text-base font-semibold">{entry.title}</h3>
                <p className="text-dim text-sm">{entry.tagline}</p>
                {/* One input's instructions, not both. See components/hud/Hotkey. */}
                <ControlsHint hint={entry.hint} className="hud-label mt-2 block" />
              </div>
            </button>
          </li>
        ))}
      </ul>

      {activeGame && <ArcadeOverlay />}
      {/* A cabinet is a game, so the front page can offer it back. Keyed on
          the open cabinet: it records once per opening, not per render. */}
      {activeGame && entryFor(activeGame) && (
        <RememberPlay
          href={`/arcade?play=${activeGame}`}
          title={entryFor(activeGame)!.title}
          kind="arcade"
        />
      )}
    </>
  );
}
