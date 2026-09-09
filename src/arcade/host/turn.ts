import type { Difficulty, MoveEvent, RulesModule, Seat } from "./rules";

/**
 * Whose turn it is, and what part of it is happening.
 *
 * ── A machine, because the alternative is booleans ───────────────────────
 *
 * The version of this that gets written by accident is `hasRolled`,
 * `isAnimating`, `canMove` and `waitingForBot` on one object, and it is wrong
 * within a week: every one of those flags is set in two places and cleared in
 * three, and the bug that ships is a player rolling twice because the dice
 * button was live for the two frames between the animation ending and the turn
 * advancing. One `phase` field with a fixed transition table makes that state
 * unrepresentable rather than merely unlikely.
 *
 * ── Every duration is in steps, never milliseconds ───────────────────────
 *
 * `GameHost` stops the loop when the tab is hidden, when the game is paused,
 * and when the run is over. A `setTimeout` keeps counting through all three,
 * so a dice roll started before a tab switch would resolve while nobody was
 * looking and the player would return to a board that had moved without
 * animating. Counting `step()` calls means every timer in here freezes exactly
 * when the game freezes, and no code in this file has to know the word
 * "paused". `tower-stack`'s death freeze is the same trick.
 *
 * ── The spec's eight phases are seven ────────────────────────────────────
 *
 * `resolvingCapture` is folded into `animating`. A capture is not a state the
 * *rules* can be in — `applyMove` has already decided it happened and said so
 * in an event. It is a thing the animator is in the middle of drawing, and the
 * animator already owns how long that takes. Keeping it as a phase would mean
 * the machine had to know which games have captures.
 */

export type Phase =
  /** Seats are being filled. Nothing may roll. */
  | "lobby"
  /** The active seat may roll. A human's turn clock runs here. */
  | "awaitingRoll"
  /** Dice are tumbling. Nothing may be pressed. */
  | "rolling"
  /** Legal moves are on the board waiting to be picked. Clock runs. */
  | "awaitingMove"
  /** A move is being drawn. The game says when it is finished. */
  | "animating"
  /** A beat between turns, so the board is not yanked to the next seat. */
  | "turnEnd"
  | "matchOver";

/** Dice tumble. ~600 ms, which is the spec's §8.6 figure and it is a good one. */
export const DICE_STEPS = 36;

/**
 * The pause after a move resolves.
 *
 * Short, but not zero. Cutting straight from a capture to the next player's
 * highlight reads as a dropped frame rather than as a turn ending.
 */
export const TURN_END_STEPS = 12;

/**
 * How long a single forced move sits highlighted before it plays itself.
 *
 * Spec §8.5, and the cheapest pacing win available: roughly a third of all
 * taps in Ludo are the player confirming the only thing they were allowed to
 * do. It is not instant because a move that happens before you saw the dice is
 * a move you did not understand.
 */
export const AUTOPLAY_STEPS = 30;

/** 15 seconds. Humans only — a bot is not on a clock, it is on a think timer. */
export const TURN_TIMER_STEPS = 900;

export interface TurnOptions<S, M> {
  rules: RulesModule<S, M>;
  seats: readonly Seat[];
  seed: number;
  /** Seeded, from `GameServices`. The machine never reaches for `Math.random`. */
  rng: () => number;
  /** Spec §8.5. Off is a supported setting, not a debug flag. */
  autoplaySingle?: boolean;
  /** Steps on a human's turn clock, or 0 for "off" — also a setting. */
  turnTimerSteps?: number;
}

export interface TurnMachine<S, M> {
  readonly phase: Phase;
  readonly state: S;
  readonly seats: readonly Seat[];
  /** The seat to act. Meaningless in `lobby` and `matchOver`; never null. */
  readonly activeSeat: Seat;
  /** What the dice are worth this turn, or null before they land. */
  readonly roll: number | null;
  readonly moves: readonly M[];
  /** 0..1 through whatever the current phase is timing. For the renderer. */
  readonly progress: number;
  /** Steps left on the turn clock, or null when no clock is running. */
  readonly clock: number | null;
  /** Seat ids best-first. Grows as seats finish. */
  readonly rankings: readonly number[];

  /** Leave the lobby. Legal once. */
  start(): void;
  /** Returns false if it was not a legal moment to roll. Never throws. */
  requestRoll(): boolean;
  /** Returns false if the move is not one of `moves`. Never throws. */
  chooseMove(move: M): boolean;
  /** The animator is done drawing the last batch of events. */
  animationDone(): void;
  /** One fixed step. The only thing that advances a timer. */
  step(): void;
  /** Take the events produced since the last call. Empties the queue. */
  drainEvents(): MoveEvent[];
}

export function createTurnMachine<S, M>(opts: TurnOptions<S, M>): TurnMachine<S, M> {
  const { rules, seats, seed, rng } = opts;
  const autoplaySingle = opts.autoplaySingle ?? true;
  const turnTimerSteps = opts.turnTimerSteps ?? TURN_TIMER_STEPS;

  const state = rules.createInitialState({ seats, seed });

  let phase: Phase = "lobby";
  let active = 0;
  let roll: number | null = null;
  let moves: M[] = [];
  let events: MoveEvent[] = [];

  /** Counts down in every timed phase. Zero means "waiting on a person". */
  let timer = 0;
  let timerSpan = 0;
  /** Set by `applyRoll` or `applyMove`; consumed when the turn ends. */
  let extraTurn = false;

  const finished = (): number[] => rules.rankings(state);
  const isFinished = (seatId: number) => finished().includes(seatId);

  const setTimer = (steps: number) => {
    timer = steps;
    timerSpan = steps;
  };

  const emit = (batch: readonly MoveEvent[] | undefined) => {
    if (batch && batch.length) events = events.concat(batch);
  };

  /**
   * Whether the turn clock applies to the seat about to act.
   *
   * Only humans, and only when the setting is on. Running it for a bot would
   * mean a bot that thinks for longer than the clock gets its own move
   * auto-played, which is the same move it was about to make — a no-op that
   * would nonetheless make the bot look like it timed out.
   */
  const clockRuns = () =>
    turnTimerSteps > 0 && seats[active]?.kind === "human";

  const enterAwaitingRoll = () => {
    phase = "awaitingRoll";
    roll = null;
    moves = [];
    setTimer(clockRuns() ? turnTimerSteps : 0);
  };

  const enterTurnEnd = () => {
    phase = "turnEnd";
    setTimer(TURN_END_STEPS);
  };

  /**
   * Hand the turn to whoever is next, or end the match.
   *
   * The loop is bounded by the seat count rather than running until it finds
   * somebody: near the end of a Ludo match every remaining seat can already be
   * placed without `isTerminal` having been asked yet, and a `while (true)`
   * looking for an unfinished seat would hang the tab on the last turn.
   */
  const advance = () => {
    if (rules.isTerminal(state)) {
      phase = "matchOver";
      return;
    }

    if (extraTurn && !isFinished(seats[active].id)) {
      extraTurn = false;
      enterAwaitingRoll();
      return;
    }
    extraTurn = false;

    for (let i = 1; i <= seats.length; i++) {
      const next = (active + i) % seats.length;
      if (isFinished(seats[next].id)) continue;
      active = next;
      enterAwaitingRoll();
      return;
    }

    // Nobody left to act. `isTerminal` disagreeing with `rankings` is a rules
    // bug, but it must not be a hang: the match is over either way.
    phase = "matchOver";
  };

  /** The dice have landed. Everything from here to a phase is one decision. */
  const resolveRoll = () => {
    const seat = seats[active];
    const faces = rules.dice.faces;
    let raw = 0;
    for (let i = 0; i < rules.dice.count; i++) {
      raw += 1 + Math.floor(rng() * faces);
    }

    const result = rules.applyRoll(state, seat.id, raw);
    emit(result.events);
    roll = result.roll;
    if (result.extraTurn) extraTurn = true;

    if (result.forfeit) {
      moves = [];
      enterTurnEnd();
      return;
    }

    moves = rules.getLegalMoves(state, seat.id, result.roll);

    // No legal move is a normal outcome, not an error: in Ludo it is every
    // roll that is not a six while all four tokens are still in base.
    if (moves.length === 0) {
      enterTurnEnd();
      return;
    }

    phase = "awaitingMove";
    if (autoplaySingle && moves.length === 1) {
      setTimer(AUTOPLAY_STEPS);
    } else {
      setTimer(clockRuns() ? turnTimerSteps : 0);
    }
  };

  const play = (move: M) => {
    const seat = seats[active];
    const result = rules.applyMove(state, seat.id, move);
    emit(result.events);
    if (result.extraTurn) extraTurn = true;
    roll = null;
    moves = [];
    phase = "animating";
    setTimer(0);
  };

  /**
   * The clock ran out. Play the best move rather than skipping the turn.
   *
   * Spec §8.5, and it is right: a skipped turn is a punishment for being slow,
   * an auto-played move is help. It also means an idle tab left on a four-seat
   * match still resolves instead of deadlocking on a human who left.
   */
  const playBest = () => {
    const seat = seats[active];
    const difficulty: Difficulty = seat.difficulty ?? "normal";
    let best = moves[0];
    let bestScore = -Infinity;
    for (const m of moves) {
      const s = rules.scoreMove(state, seat.id, m, difficulty);
      if (s > bestScore) {
        bestScore = s;
        best = m;
      }
    }
    play(best);
  };

  return {
    get phase() {
      return phase;
    },
    get state() {
      return state;
    },
    seats,
    get activeSeat() {
      return seats[active];
    },
    get roll() {
      return roll;
    },
    get moves() {
      return moves;
    },
    get progress() {
      if (timerSpan <= 0) return 0;
      return 1 - timer / timerSpan;
    },
    get clock() {
      return phase === "awaitingRoll" || phase === "awaitingMove"
        ? clockRuns()
          ? timer
          : null
        : null;
    },
    get rankings() {
      return finished();
    },

    start() {
      if (phase !== "lobby") return;
      active = 0;
      enterAwaitingRoll();
    },

    requestRoll() {
      if (phase !== "awaitingRoll") return false;
      phase = "rolling";
      setTimer(DICE_STEPS);
      return true;
    },

    chooseMove(move) {
      if (phase !== "awaitingMove") return false;
      if (!moves.includes(move)) return false;
      play(move);
      return true;
    },

    animationDone() {
      if (phase !== "animating") return;
      enterTurnEnd();
    },

    step() {
      // `animating` has no timer of its own: only the animator knows how many
      // cells a token has left to hop, so it is the thing that ends the phase.
      if (timer <= 0) return;
      timer--;
      if (timer > 0) return;

      if (phase === "rolling") {
        resolveRoll();
      } else if (phase === "turnEnd") {
        advance();
      } else if (phase === "awaitingMove") {
        // Either the single-move autoplay armed above, or the turn clock. Both
        // end the same way, and with one move there is nothing to choose
        // between.
        playBest();
      } else if (phase === "awaitingRoll") {
        // The clock expired before a human pressed anything. Roll for them —
        // the alternative is a match that stops because somebody looked away.
        phase = "rolling";
        setTimer(DICE_STEPS);
      }
    },

    drainEvents() {
      const out = events;
      events = [];
      return out;
    },
  };
}
