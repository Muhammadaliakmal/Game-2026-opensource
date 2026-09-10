import type { Difficulty, RulesModule, Seat } from "./rules";
import type { TurnMachine } from "./turn";

/**
 * The players who are not there.
 *
 * A four-seat board game with one human in it and three empty chairs is not a
 * game, so this is the piece that decides whether any of the phase is worth
 * shipping. It owns exactly two things, and they are the two that are the same
 * in every board game: **how long a seat takes to act**, and **how often it is
 * wrong**. What it does *not* own is which move is good — that is
 * `rules.scoreMove`, because "a capture beats going home" is a Ludo sentence
 * and not a bot sentence.
 *
 * ── Think time is counted in steps, never in milliseconds ────────────────
 *
 * The obvious implementation is `setTimeout(act, 400 + rng() * 1000)`, and it
 * is wrong here for a reason that has nothing to do with taste. `GameHost`
 * stops the loop on `visibilitychange`, on pause, and on the result screen. A
 * timer keeps running through all three: a backgrounded tab would come back
 * with moves already made and no animation played, and a paused game would
 * quietly advance behind the pause panel. Counting fixed steps means a bot
 * freezes exactly when the game freezes, for free, with no code here that has
 * to know what "paused" means. `tower-stack`'s `deathFreeze` is the same shape
 * for the same reason. See `plan-phase8.md` §2C.
 *
 * ── And it is two waits, not one ─────────────────────────────────────────
 *
 * A seat pauses before reaching for the dice and again before committing to a
 * move, and the two are different lengths because they are different acts.
 * There is nothing to deliberate about a roll — that beat exists so you can
 * see whose turn it has become — while the pause before a move is the one that
 * has to look like thought. One shared delay makes a bot that dawdles over the
 * dice and then snaps out a move, which reads as a machine pretending.
 */

/** Reaching for the dice: 300–600 ms. Long enough to see the turn change. */
export const REACH_STEPS = { min: 18, max: 36 } as const;

/** Deliberating over a move: 400–1400 ms, which is the spec's §7 figure. */
export const THINK_STEPS = { min: 24, max: 84 } as const;

/**
 * How often each tier throws its own plan away.
 *
 * Spec §7, and the second rule there is the one that matters: a bot that
 * always plays the best move available is *more* obviously a bot than one that
 * occasionally leaves a piece hanging. Perfect play is a tell.
 *
 * Here rather than in a game's `tuning.ts` because it is not a fact about
 * Ludo. `rules.ts` draws that line explicitly, and two tables for one idea is
 * how the easy tier ends up easy in one game and merciless in the next.
 */
export const BLUNDER_RATE: Record<Difficulty, number> = {
  easy: 0.6,
  normal: 0.2,
  hard: 0,
};

/**
 * Names for the seats nobody is sitting in.
 *
 * Real names rather than "Bot 2", per `rules.ts`: a table labelled as three
 * machines tells the player they are alone, which is the one thing a four-seat
 * game with a small audience cannot afford to say. The honesty belongs in the
 * lobby, once, in a sentence — not stamped on every seat for the whole match.
 *
 * Short, because they are drawn at cell size on a phone, and drawn from
 * several places, because the player list should not read as one office.
 */
export const BOT_NAMES: readonly string[] = [
  "Ayesha",
  "Bilal",
  "Mina",
  "Omar",
  "Rhea",
  "Tomas",
  "Yuki",
  "Zara",
  "Kofi",
  "Ines",
  "Dev",
  "Lena",
  "Sami",
  "Nova",
  "Rafi",
  "Juno",
];

/** Seed-driven integer in `[min, max]`. */
const between = (rng: () => number, min: number, max: number) =>
  min + Math.floor(rng() * (max - min + 1));

/**
 * Deal a table: the humans first, then bots to fill it.
 *
 * Seat 0 is the local player, and the machine's seat order is the play order,
 * so the human always goes first. That is a small gift to the one person at
 * the table who can get bored, and it costs the bots nothing.
 */
export function fillSeats(opts: {
  total: number;
  humans?: number;
  difficulty?: Difficulty;
  rng: () => number;
  /** What the local player is called. */
  youName?: string;
}): Seat[] {
  const humans = Math.max(1, Math.min(opts.humans ?? 1, opts.total));
  const difficulty = opts.difficulty ?? "normal";
  const pool = BOT_NAMES.slice();
  const seats: Seat[] = [];

  for (let id = 0; id < opts.total; id++) {
    if (id < humans) {
      seats.push({ id, name: opts.youName ?? "You", kind: "human" });
      continue;
    }
    // Drawn without replacement: two seats called Zara at one table is a bug
    // report, and the pool is many times the four seats a match can have.
    const pick = Math.floor(opts.rng() * pool.length);
    const [name] = pool.splice(pick, 1);
    seats.push({ id, name, kind: "bot", difficulty });
  }

  return seats;
}

export interface BotDriver {
  /** True while a bot is deliberating. For the "…" over its seat. */
  readonly thinking: boolean;
  /**
   * One fixed step.
   *
   * Call it *after* the turn machine's own step, so a bot acts on the phase
   * the player is being shown this frame rather than on the previous one.
   */
  step(): void;
}

export function createBotDriver<S, M>(opts: {
  machine: TurnMachine<S, M>;
  rules: RulesModule<S, M>;
  /** Seeded, from `GameServices`. A replayed match must seat the same bots. */
  rng: () => number;
  reach?: { min: number; max: number };
  think?: { min: number; max: number };
}): BotDriver {
  const { machine, rules, rng } = opts;
  const reach = opts.reach ?? REACH_STEPS;
  const think = opts.think ?? THINK_STEPS;

  /** The phase the current wait was armed for, or null if nothing is waiting. */
  let armedFor: string | null = null;
  let left = 0;

  /**
   * The move to play, which is usually the best one.
   *
   * ── A blunder is a *different* move, not a re-roll ───────────────────
   *
   * The tempting version picks uniformly at random from every move whenever
   * the dice say to blunder. That quietly dilutes the tiers: with two moves on
   * offer, a 0.6 blunder rate picks the best one back again half the time, so
   * an "easy" bot plays well 70% of the time and the number in the table means
   * nothing. Choosing from the moves that are *not* best makes the rate the
   * thing it claims to be.
   *
   * Ties count as best. Two equally good moves are not a mistake to pick
   * between.
   */
  const choose = (seat: Seat, moves: readonly M[]): M => {
    const difficulty: Difficulty = seat.difficulty ?? "normal";
    let bestScore = -Infinity;
    const scores = moves.map((m) => {
      const s = rules.scoreMove(machine.state, seat.id, m, difficulty);
      if (s > bestScore) bestScore = s;
      return s;
    });

    const best = moves.filter((_, i) => scores[i] === bestScore);
    const rest = moves.filter((_, i) => scores[i] !== bestScore);

    // With one move, or with every move equally good, there is nothing to get
    // wrong — and a bot that "blunders" into the only legal move looks like a
    // bot that hesitated for no reason.
    if (rest.length > 0 && rng() < BLUNDER_RATE[difficulty]) {
      return rest[Math.floor(rng() * rest.length)];
    }
    return best[Math.floor(rng() * best.length)];
  };

  return {
    get thinking() {
      return armedFor !== null && left > 0;
    },

    step() {
      const phase = machine.phase;
      const acting = phase === "awaitingRoll" || phase === "awaitingMove";
      const seat = machine.activeSeat;

      if (!acting || seat?.kind !== "bot") {
        // Disarmed rather than paused. A wait that survived the turn passing
        // would have the next bot act early by however long the last one had
        // already thought.
        armedFor = null;
        return;
      }

      if (armedFor !== phase) {
        armedFor = phase;
        const span = phase === "awaitingRoll" ? reach : think;
        left = between(rng, span.min, span.max);
      }

      if (left > 0) {
        left--;
        return;
      }

      if (phase === "awaitingRoll") {
        machine.requestRoll();
      } else {
        const moves = machine.moves;
        // An empty move list is the machine's to resolve, not the bot's: it
        // ends the turn on its own. Acting here would be choosing from nothing.
        if (moves.length > 0) machine.chooseMove(choose(seat, moves));
      }

      // Cleared so the next phase re-arms even when it is the same phase name
      // — a six grants another roll, and that second roll is its own beat.
      armedFor = null;
    },
  };
}
