"use client";

import { useEffect } from "react";
import { useArcade } from "@/arcade/store";
import { setCabinetNet, type CabinetNet } from "@/arcade/host/net";
import { onPartyGame, partyDone, partyGameSend, partyScore } from "@/lib/net/party";
import { partyGame } from "@/lib/party-games";
import { usePartyStore } from "@/stores/party-store";

/**
 * Wires a party round to the arcade, both ways. Renders nothing.
 *
 * Room → arcade: a new round number while `playing` opens the round's cabinet
 * with the round's seed. Keyed on the round rather than the phase, so a
 * rematch opens again and a snapshot that merely repeats the phase does not.
 * A table game (Ludo, Snakes, the duel) also gets a `CabinetNet`: its seat,
 * who sits where, and a line to the other tables.
 *
 * Arcade → room: the running score at most four times a second, and the final
 * result exactly once per round — on the result screen, or on Quit, because a
 * player who walks away has still finished, and a round that waited for them
 * would wait for fifteen minutes. A board game's result is a place, sent as
 * `of - place + 1` so that ranking by score ranks by place.
 */

const SCORE_EVERY_MS = 250;

/** A `CabinetNet` whose early messages wait for the cabinet to start listening. */
function makeNet(opts: {
  round: number;
  seat: number;
  players: { id: string; name: string }[];
  isHost: boolean;
  hostId: string;
}): CabinetNet & { deliver(msg: unknown, fromSeat: number): void; gone: Set<number> } {
  let handler: CabinetNet["onMessage"] = null;
  const queue: [unknown, number][] = [];
  return {
    seat: opts.seat,
    players: opts.players,
    isHost: opts.isHost,
    gone: new Set<number>(),
    send(msg) {
      partyGameSend(opts.round, msg, opts.isHost ? undefined : opts.hostId);
    },
    get onMessage() {
      return handler;
    },
    set onMessage(fn) {
      handler = fn;
      while (handler && queue.length) {
        const [m, from] = queue.shift()!;
        handler(m, from);
      }
    },
    deliver(msg, fromSeat) {
      if (handler) handler(msg, fromSeat);
      else queue.push([msg, fromSeat]);
    },
  };
}

export function PartyBridge() {
  useEffect(() => {
    let opened = 0;
    /** The round whose final result has been sent. */
    let reported = 0;
    let lastSent = -1;
    let lastAt = 0;
    let net: ReturnType<typeof makeNet> | null = null;
    let netRound = 0;

    const roundIsMine = () => {
      const p = usePartyStore.getState();
      return p.phase === "playing" && p.members.some((m) => m.id === p.selfId && m.playing && !m.done);
    };

    onPartyGame((msg, from, round) => {
      if (!net || round !== netRound) return;
      const seats = usePartyStore.getState().seats;
      net.deliver(msg, seats.indexOf(from));
    });

    const offParty = usePartyStore.subscribe((p, prev) => {
      if (p.status !== "live" && prev.status === "live") {
        // The party went away under an open versus run: the run is now just a run.
        if (useArcade.getState().versus) useArcade.getState().close();
        return;
      }

      const table = partyGame(p.game)?.kind !== "score";

      // A table game's match lives in its host's tab. If that tab goes, the
      // match goes with it — close rather than leave a board frozen mid-turn.
      if (table && net && p.round === netRound && prev.hostId && p.hostId !== prev.hostId) {
        if (useArcade.getState().versus) useArcade.getState().close();
      }

      // Seats whose player left: the host plays for them.
      if (net && p.round === netRound) {
        const here = new Set(p.members.map((m) => m.id));
        p.seats.forEach((id, i) => {
          if (!here.has(id)) net!.gone.add(i);
        });
      }

      if (p.phase === "playing" && p.round !== opened && roundIsMine()) {
        opened = p.round;
        lastSent = -1;
        if (table) {
          const names = new Map(p.members.map((m) => [m.id, m.name]));
          net = makeNet({
            round: p.round,
            seat: p.seats.indexOf(p.selfId ?? ""),
            players: p.seats.map((id) => ({ id, name: names.get(id) ?? "Player" })),
            isHost: p.selfId === p.hostId,
            hostId: p.hostId,
          });
          netRound = p.round;
          setCabinetNet(net);
        } else {
          net = null;
          setCabinetNet(null);
        }
        useArcade.getState().open(p.game, p.seed, { versus: true });
      }
    });

    const finish = (n: number) => {
      const round = usePartyStore.getState().round;
      if (reported === round || !roundIsMine()) return;
      reported = round;
      partyDone(n);
    };

    /** A run's result as a party score: a place becomes "beat this many". */
    const resultOf = (a: { score: number; placement: { place: number; of: number } | null }) =>
      a.placement ? a.placement.of - a.placement.place + 1 : a.score;

    const offArcade = useArcade.subscribe((a, prev) => {
      if (!a.versus && !prev.versus) return;
      // Quit mid-run: `close` clears `versus`, so read it off the previous state.
      if (!a.activeGame && prev.activeGame && prev.versus) {
        finish(resultOf(prev));
        return;
      }
      if (a.status === "gameover" && prev.status !== "gameover") {
        finish(resultOf(a));
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
      onPartyGame(null);
      setCabinetNet(null);
    };
  }, []);

  return null;
}
