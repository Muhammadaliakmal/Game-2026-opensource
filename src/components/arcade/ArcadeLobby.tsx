"use client";

import dynamic from "next/dynamic";
import { CABINETS } from "@/arcade/registry";
import { useArcade } from "@/arcade/store";
import { RATES } from "@/lib/arcade-payout";

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
              <div className="relative h-24 w-full overflow-hidden bg-[#0b1030]">
                {/* No cover art, and no placeholder pretending to be some. The
                    honest thing a cabinet can show before you play it is what
                    it pays and what you last got on it. */}
                <span className="hud-label text-accent absolute bottom-2 left-3">
                  {RATES[entry.id]
                    ? `${RATES[entry.id]} coins per point`
                    : "Practice"}
                </span>
                {(best[entry.id] ?? 0) > 0 && (
                  <span className="hud-label num absolute right-3 bottom-2">
                    best {best[entry.id]}
                  </span>
                )}
              </div>
              <div className="flex flex-col gap-1 p-4">
                <h3 className="text-ink text-base font-semibold">{entry.title}</h3>
                <p className="text-dim text-sm">{entry.tagline}</p>
                <p className="hud-label mt-2">{entry.controlsHint}</p>
              </div>
            </button>
          </li>
        ))}
      </ul>

      {activeGame && <ArcadeOverlay />}
    </>
  );
}
