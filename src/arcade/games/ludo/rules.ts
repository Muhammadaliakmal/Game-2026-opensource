import type { MoveEvent, RulesModule, Seat } from "@/arcade/host/rules";
import {
  HOME,
  IN_YARD,
  LANE_FIRST,
  LAST_LOOP,
  LOOP_LEN,
  MAX_TOKENS,
  SAFE,
  START,
  cellFor,
  onLoop,
  yardCell,
} from "./board";
import {
  BOT_WEIGHTS,
  DEFAULT_SETTINGS,
  SIXES_FORFEIT,
  THREAT_RANGE,
  type LudoSettings,
} from "./tuning";

/**
 * Ludo, as arithmetic.
 *
 * Nothing in this file draws, sounds, or touches the DOM — it is the half of
 * the game that `rules.test.ts` runs headless, and the half that could be
 * lifted onto a server to referee an online match without changing a line.
 *
 * ── One number per token ─────────────────────────────────────────────────
 *
 * See `board.ts`: a token is its progress, `-1` to `57`. Every rule people
 * argue about at the table is then a comparison on that number — the exact
 * roll home is `to > HOME`, the whole of it — and the four seats' different
 * entry points exist in exactly one function, `cellFor`.
 */

export interface LudoState {
  readonly settings: LudoSettings;
  readonly seatCount: number;
  /** `progress[seat][token]`. The entire mutable state of a match. */
  readonly progress: number[][];
  /** Consecutive sixes by the seat currently rolling. */
  sixes: number;
  /** Seat ids, in the order they got every token home. */
  readonly done: number[];
}

/**
 * Fully specified, so `applyMove` needs no memory of the roll.
 *
 * `from` and `to` are progress values, not cells: a move is "this token goes
 * from 12 to 18", which is true regardless of which seat is playing and which
 * loop cells those are.
 */
export interface LudoMove {
  readonly token: number;
  readonly from: number;
  readonly to: number;
}

/** A token's id across the whole match, for the animator. */
export const tokenIdOf = (seat: number, token: number) => seat * MAX_TOKENS + token;

const loopIndex = (seat: number, progress: number) =>
  (START[seat] + progress) % LOOP_LEN;

/** Opponents standing on a loop cell. Empty on a safe cell, by definition. */
function occupantsAt(
  state: LudoState,
  seat: number,
  cell: number
): Array<{ seat: number; token: number }> {
  const out: Array<{ seat: number; token: number }> = [];
  if (SAFE.has(cell)) return out;
  for (let s = 0; s < state.seatCount; s++) {
    if (s === seat) continue;
    const row = state.progress[s];
    for (let t = 0; t < row.length; t++) {
      if (!onLoop(row[t])) continue;
      if (loopIndex(s, row[t]) === cell) out.push({ seat: s, token: t });
    }
  }
  return out;
}

/**
 * Whether an enemy could take a piece standing on this cell next turn.
 *
 * "Within six behind" is the whole of it, plus one condition that is easy to
 * miss: the enemy must still be *able* to walk that far on the loop. A token
 * three cells from its home lane cannot reach a cell five ahead, because its
 * fifth step does not exist — it turns off the shared track first. Without
 * that check a bot flees from pieces that are no longer chasing it.
 */
function threatened(state: LudoState, seat: number, cell: number): boolean {
  for (let s = 0; s < state.seatCount; s++) {
    if (s === seat) continue;
    const row = state.progress[s];
    for (let t = 0; t < row.length; t++) {
      const p = row[t];
      if (!onLoop(p)) continue;
      const at = loopIndex(s, p);
      const gap = (cell - at + LOOP_LEN) % LOOP_LEN;
      if (gap >= 1 && gap <= THREAT_RANGE && p + gap <= LAST_LOOP) return true;
    }
  }
  return false;
}

/**
 * The finishing order for the result screen, including seats that never got
 * home.
 *
 * Deliberately **not** `rankings`. The contract's `rankings` lists only seats
 * that have genuinely finished, because `turn.ts` uses it to decide who is
 * still owed a turn — appending the unfinished seats there would convince the
 * machine that everybody was done and end the match on the first move. The
 * result screen needs a full ordering; the turn machine must not see one.
 */
export function placings(state: LudoState): number[] {
  const rest: number[] = [];
  for (let s = 0; s < state.seatCount; s++) {
    if (!state.done.includes(s)) rest.push(s);
  }
  const total = (s: number) =>
    state.progress[s].reduce((sum, p) => sum + Math.max(0, p), 0);
  rest.sort((a, b) => total(b) - total(a));
  return [...state.done, ...rest];
}

export function createLudoRules(
  settings: LudoSettings = DEFAULT_SETTINGS
): RulesModule<LudoState, LudoMove> {
  return {
    id: "ludo",
    seats: { min: 2, max: 4 },
    dice: { faces: 6, count: 1 },

    createInitialState({ seats }: { seats: readonly Seat[]; seed: number }) {
      return {
        settings,
        seatCount: seats.length,
        progress: seats.map(() => new Array<number>(settings.tokens).fill(IN_YARD)),
        sixes: 0,
        done: [],
      };
    },

    applyRoll(state, _seatId, roll) {
      if (roll !== 6) {
        state.sixes = 0;
        return { roll, forfeit: false, extraTurn: false };
      }

      state.sixes++;
      if (state.sixes >= SIXES_FORFEIT) {
        // Three sixes and the turn is gone. The counter resets here rather
        // than on the next seat's roll, because it is *this* seat's streak and
        // nothing else ever reads it.
        state.sixes = 0;
        return { roll, forfeit: true, extraTurn: false };
      }
      return { roll, forfeit: false, extraTurn: true };
    },

    getLegalMoves(state, seatId, roll) {
      const row = state.progress[seatId];
      const moves: LudoMove[] = [];
      const seen = new Set<string>();

      for (let t = 0; t < row.length; t++) {
        const from = row[t];
        if (from >= HOME) continue;

        let to: number;
        if (from === IN_YARD) {
          const unlocks = roll === 6 || (state.settings.unlockOnOne && roll === 1);
          if (!unlocks) continue;
          to = 0;
        } else {
          to = from + roll;
          // The exact roll home. An overshoot is not a move, it is a turn
          // spent — which is the tension the whole endgame is built on.
          if (to > HOME) continue;
        }

        // Two tokens sitting in the yard produce the same move twice, and
        // being asked which identical piece to release is a decision with no
        // content. Collapsing them also lets the single-legal-move autoplay
        // fire, which is where it saves the most taps.
        const key = `${from}:${to}`;
        if (seen.has(key)) continue;
        seen.add(key);
        moves.push({ token: t, from, to });
      }

      return moves;
    },

    applyMove(state, seatId, move) {
      const row = state.progress[seatId];
      const events: MoveEvent[] = [];
      const id = tokenIdOf(seatId, move.token);

      row[move.token] = move.to;

      // The cells *entered*, which is what the animator hops through. A token
      // leaving the yard enters exactly one — it does not walk the board to
      // its start square, it is placed on it.
      const path: number[] = [];
      if (move.from === IN_YARD) {
        path.push(cellFor(seatId, 0, move.token));
      } else {
        for (let p = move.from + 1; p <= move.to; p++) {
          path.push(cellFor(seatId, p, move.token));
        }
      }
      events.push({
        kind: "move",
        seatId,
        tokenId: id,
        path,
        from: cellFor(seatId, move.from, move.token),
        to: cellFor(seatId, move.to, move.token),
      });

      let extraTurn = false;

      if (onLoop(move.to)) {
        const landed = loopIndex(seatId, move.to);
        for (const victim of occupantsAt(state, seatId, landed)) {
          state.progress[victim.seat][victim.token] = IN_YARD;
          events.push({
            kind: "capture",
            seatId: victim.seat,
            tokenId: tokenIdOf(victim.seat, victim.token),
            from: landed,
            to: yardCell(victim.seat, victim.token),
          });
          if (state.settings.captureExtraTurn) extraTurn = true;
        }
      }

      if (move.to === HOME) {
        events.push({ kind: "enterHome", seatId, tokenId: id });
        if (row.every((p) => p >= HOME) && !state.done.includes(seatId)) {
          state.done.push(seatId);
        }
      }

      return { events, extraTurn };
    },

    isTerminal(state) {
      if (state.settings.endOnFirstWin) return state.done.length >= 1;
      // Playing out the places: the last seat left has nobody to race.
      return state.done.length >= state.seatCount - 1;
    },

    rankings: (state) => state.done.slice(),

    scoreMove(state, seatId, move, _difficulty) {
      const w = BOT_WEIGHTS;
      let score = 0;

      if (move.from === IN_YARD) score += w.leaveYard;
      if (move.to === HOME) score += w.enterHome;
      score += (move.to - Math.max(move.from, 0)) * w.advanceProgress;

      if (onLoop(move.to)) {
        const landed = loopIndex(seatId, move.to);
        if (occupantsAt(state, seatId, landed).length > 0) score += w.capture;
        if (SAFE.has(landed)) score += w.reachSafe;
        else if (threatened(state, seatId, landed)) score += w.exposeToCapture;
      } else if (move.to >= LANE_FIRST) {
        // The home lane is nobody else's board. Reaching it is as safe as a
        // safe cell and is worth saying so, or a bot will dawdle on the loop.
        score += w.reachSafe;
      }

      if (onLoop(move.from)) {
        const was = loopIndex(seatId, move.from);
        if (!SAFE.has(was) && threatened(state, seatId, was)) score += w.escapeThreat;
      }

      // `difficulty` is accepted and unused: being *worse* is not a different
      // scoring function, it is how often the best move is thrown away, and
      // that belongs in the bot rather than in the game's own opinion of a
      // move. See `tuning.ts`'s BLUNDER_RATE.
      return score;
    },
  };
}
