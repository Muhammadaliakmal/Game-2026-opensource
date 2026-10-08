"use client";

import { useEffect } from "react";
import { useArcade } from "@/arcade/store";
import { partyDone, partyScore } from "@/lib/net/party";
import { usePartyStore } from "@/stores/party-store";

/**
 * Wires a party round to the arcade, both ways. Renders nothing.
 *
 * Room → arcade: a new round number while `playing` opens the round's cabinet
 * with the round's seed. Keyed on the round rather than the phase, so a
 * rematch (same game, new seed) opens again and a patch that merely repeats
 * the phase does not.
 *
 * Arcade → room: the running score at most four times a second, and the final
 * one exactly once per round — on the death screen, or on Quit, because a
 * player who walks away from a run has still finished it, and a round that
 * waited for them would wait for fifteen minutes.
 *
 * Plain store subscriptions rather than React state: neither half needs a
 * render, and the score arrives at ten hertz.
 */

const SCORE_EVERY_MS = 250;

export function PartyBridge() {
  useEffect(() => {
    let opened = 0;
    /** The round whose final score has been sent. */
    let reported = 0;
    let lastSent = -1;
    let lastAt = 0;

    const roundIsMine = () => {
      const p = usePartyStore.getState();
      return p.phase === "playing" && p.members.some((m) => m.id === p.selfId && m.playing && !m.done);
    };

    const offParty = usePartyStore.subscribe((p, prev) => {
      if (p.status !== "live" && prev.status === "live") {
        // The party went away under an open versus run: the run is now just a run.
        if (useArcade.getState().versus) useArcade.getState().close();
        return;
      }
      if (p.phase === "playing" && p.round !== opened && roundIsMine()) {
        opened = p.round;
        lastSent = -1;
        useArcade.getState().open(p.game, p.seed, { versus: true });
      }
    });

    const finish = (score: number) => {
      const round = usePartyStore.getState().round;
      if (reported === round || !roundIsMine()) return;
      reported = round;
      partyDone(score);
    };

    const offArcade = useArcade.subscribe((a, prev) => {
      if (!a.versus && !prev.versus) return;
      // Quit mid-run: `close` clears `versus`, so read it off the previous state.
      if (!a.activeGame && prev.activeGame && prev.versus) {
        finish(prev.score);
        return;
      }
      if (a.status === "gameover" && prev.status !== "gameover") {
        finish(a.score);
        return;
      }
      if (a.status === "playing" && a.score !== lastSent && roundIsMine()) {
        const now = performance.now();
        if (now - lastAt < SCORE_EVERY_MS) return;
        lastAt = now;
        lastSent = a.score;
        partyScore(a.score);
      }
    });

    return () => {
      offParty();
      offArcade();
    };
  }, []);

  return null;
}
