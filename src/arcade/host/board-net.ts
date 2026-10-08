import { fillSeats } from "./bots";
import type { CabinetNet } from "./net";
import type { Difficulty, RulesModule, Seat } from "./rules";
import type { Decision, TurnMachine, TurnOptions } from "./turn";

/**
 * What a board cabinet adds to play a party match: who sits where, and which
 * table decides. Ludo and Snakes & Ladders share all of it.
 *
 * The HOST's turn machine is the match: it runs the bots and the turn clocks,
 * and announces every die and move (`onDecision`). Every other table is a
 * puppet that replays those (`turn.ts`). A guest's own tap is a request sent
 * to the host, which plays it if it is that guest's turn — so the only
 * authority on whose turn it is, and what is legal, is one table.
 */

type Want = { k: "want-roll" } | { k: "want-move"; i: number };

/** Seats for a party match: the party's players first, bots in the rest. */
export function partySeats(net: CabinetNet | undefined, total: number, rng: () => number, difficulty: Difficulty = "normal"): Seat[] {
  if (!net) return fillSeats({ total, rng, difficulty });
  // Same call on every table, so the bots get the same names everywhere.
  const seats = fillSeats({ total, humans: Math.max(1, net.players.length), rng, difficulty });
  return seats.map((s, i) => (i < net.players.length ? { ...s, name: net.players[i].name } : s));
}

/** The machine options a party match needs, or nothing for a solo run. */
export function netMachineOptions(net: CabinetNet | undefined): Pick<TurnOptions<unknown, unknown>, "puppet" | "onDecision"> {
  if (!net) return {};
  return net.isHost ? { onDecision: (d: Decision) => net.send(d) } : { puppet: true };
}

export interface BoardLink<M> {
  /** The local player asked to roll. */
  roll(): void;
  /** The local player picked a move. */
  move(m: M): void;
  /** Once per step, after the machine: the host plays for anyone who left. */
  step(): void;
}

export function createBoardLink<S, M>(opts: {
  net: CabinetNet | undefined;
  machine: TurnMachine<S, M>;
  rules: RulesModule<S, M>;
}): BoardLink<M> {
  const { net, machine, rules } = opts;

  if (!net) {
    return {
      roll: () => void machine.requestRoll(),
      move: (m) => void machine.chooseMove(m),
      step: () => {},
    };
  }

  if (!net.isHost) {
    net.onMessage = (msg) => {
      const d = msg as Decision;
      if (d && (d.k === "roll" || d.k === "move")) machine.apply(d);
    };
    return {
      roll: () => net.send({ k: "want-roll" } satisfies Want),
      move: (m) => {
        const i = machine.moves.indexOf(m);
        if (i >= 0) net.send({ k: "want-move", i } satisfies Want);
      },
      step: () => {},
    };
  }

  // The host. A request counts only from the seat whose turn it is.
  net.onMessage = (msg, fromSeat) => {
    const w = msg as Want;
    if (!w || fromSeat < 0 || machine.activeSeat.id !== fromSeat) return;
    if (w.k === "want-roll") machine.requestRoll();
    else if (w.k === "want-move") {
      const m = machine.moves[w.i];
      if (m !== undefined) machine.chooseMove(m);
    }
  };

  return {
    roll: () => void machine.requestRoll(),
    move: (m) => void machine.chooseMove(m),
    step: () => {
      // Somebody left mid-match. Their seat plays its best move at once
      // rather than waiting out a fifteen-second clock on every turn.
      const seat = machine.activeSeat;
      if (!net.gone.has(seat.id)) return;
      if (machine.phase === "awaitingRoll") machine.requestRoll();
      else if (machine.phase === "awaitingMove" && machine.moves.length > 0) {
        let best = machine.moves[0];
        let bestScore = -Infinity;
        for (const m of machine.moves) {
          const sc = rules.scoreMove(machine.state, seat.id, m, "normal");
          if (sc > bestScore) {
            bestScore = sc;
            best = m;
          }
        }
        machine.chooseMove(best);
      }
    },
  };
}
