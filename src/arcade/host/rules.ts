/**
 * The contract a turn-based cabinet implements, and the only thing the turn
 * machine knows about a board game.
 *
 * ── Why this exists next to `types.ts` rather than inside it ─────────────
 *
 * `ArcadeGame` is four methods because a runner needs four: step, render,
 * resize, destroy. A board game needs those too — it still draws to the same
 * canvas on the same loop — but it also has a shape the runner has no word
 * for: seats, a roll, legal moves, and a finishing order. Folding both into
 * one interface would put `getLegalMoves` on Chunk Runner, where it means
 * nothing. So a board cabinet implements `ArcadeGame` *and* hands the turn
 * machine one of these.
 *
 * ── `applyMove` returns events, and never touches a pixel ────────────────
 *
 * The single most important line in this file. A rules module that moved a
 * token by writing its screen position would be a rules module that cannot be
 * tested without a canvas, cannot run in a worker, and cannot ever be moved to
 * a server to validate an online match. Returning a list of things that
 * happened keeps it arithmetic over plain objects — `sim.test.ts` in
 * `tower-stack` is the same discipline, and it is why that simulation is
 * pinned by tests that never open a DOM.
 *
 * The rule this file must keep, forever: **nothing here imports react, next,
 * or anything that touches the document.**
 */

export type Difficulty = "easy" | "normal" | "hard";

export type SeatKind = "human" | "bot";

/**
 * One player position at the table.
 *
 * `name` is a real name even for a bot, and that is deliberate rather than
 * dishonest: a seat labelled "Bot 2" tells the player they are alone, which is
 * the one thing a four-seat game with a two-thousand-user audience cannot
 * afford to say. The disclosure belongs in the lobby, once, in words — see the
 * spec's §7 — not stamped on every seat for the whole match.
 */
export interface Seat {
  /** Index into the match's seat list. Stable for the life of a match. */
  readonly id: number;
  readonly name: string;
  readonly kind: SeatKind;
  /** Bots only. A human seat carries none. */
  readonly difficulty?: Difficulty;
}

/**
 * Something that happened, in the order it happened, for the animator to play.
 *
 * Open-ended by design: `kind` is a string a game names itself, and the
 * animation layer switches on the ones it knows and ignores the rest. A closed
 * union here would mean every new game edits this file, which is exactly the
 * coupling the whole contract exists to avoid.
 */
export interface MoveEvent {
  readonly kind: string;
  /** Whose piece this happened to, when that is meaningful. */
  readonly seatId?: number;
  readonly tokenId?: number;
  /** Cells walked through, so a token hops rather than slides. See §8.6. */
  readonly path?: readonly number[];
  readonly from?: number;
  readonly to?: number;
}

/**
 * What the dice landed on, after the rules have had their say about it.
 *
 * Two flags rather than one, because they are opposite outcomes of the same
 * moment and a single "keeps turn" boolean cannot express both. In Ludo a six
 * grants another roll (`extraTurn`) but a *third* consecutive six ends the
 * turn with no move at all (`forfeit`) — the same face, two different
 * answers, decided by state the machine outside cannot see.
 */
export interface RollResult {
  /** The value in play. Not always what the die showed: a power card doubles it. */
  readonly roll: number;
  /** The seat loses its turn now, without moving. */
  readonly forfeit: boolean;
  /** The seat rolls again once this turn resolves. */
  readonly extraTurn: boolean;
  readonly events?: readonly MoveEvent[];
}

export interface MoveResult {
  readonly events: readonly MoveEvent[];
  /** A capture in Ludo. ORed with the roll's own claim by the turn machine. */
  readonly extraTurn: boolean;
}

/**
 * The whole of a board game, minus its drawing.
 *
 * `S` is the game's state and `M` its move; both are opaque to everything in
 * `host/`. Adding game #3 is a module that satisfies this and a row in the
 * registry — no host file changes, which is the claim `registry.ts` already
 * makes for runners and this extends to board games.
 */
export interface RulesModule<S, M> {
  readonly id: string;

  /** Seats the game can be played with, before any are filled by bots. */
  readonly seats: { readonly min: number; readonly max: number };

  /**
   * Faces on one die, and how many are thrown.
   *
   * Declared rather than rolled, so the *machine* does the rolling from the
   * match seed. A rules module that reached for its own randomness would break
   * the property the whole arcade is built on: that a run replays exactly from
   * its seed. It is also the answer to the accusation every dice game
   * eventually gets — the sequence is a function of a number shown on the
   * result screen.
   */
  readonly dice: { readonly faces: number; readonly count: number };

  createInitialState(opts: { seats: readonly Seat[]; seed: number }): S;

  /**
   * Fold a raw roll into the state and say what it is worth.
   *
   * Called exactly once per roll, before `getLegalMoves`. This is where a
   * consecutive-sixes counter lives, because it is the only hook that sees
   * every roll including the ones that produce no move.
   */
  applyRoll(state: S, seatId: number, roll: number): RollResult;

  /**
   * Empty is a legal answer, and means the turn passes — in Ludo it is every
   * roll that is not a six while all four tokens are still in base.
   *
   * A move must be **fully specified**: `{ tokenId, from, to }`, not
   * `tokenId`. `applyMove` then needs no side channel to remember what the
   * dice said, which is what lets a move list be replayed on its own later —
   * by a server validating an online match, or by a bug report.
   */
  getLegalMoves(state: S, seatId: number, roll: number): M[];

  applyMove(state: S, seatId: number, move: M): MoveResult;

  isTerminal(state: S): boolean;

  /**
   * Seat ids best-first, for every seat that has finished.
   *
   * Not "the winner": the result screen needs to say *third of four*, and a
   * seat that has not finished yet must not appear. Length grows as the match
   * resolves, which is how the host knows the local player has been placed —
   * see `plan-phase8.md` §2D.
   */
  rankings(state: S): number[];

  /**
   * How much a bot wants this move. Higher wins; sign is meaningful.
   *
   * On the rules module rather than in `bots.ts` because the weights are
   * facts about the game — "a capture is worth more than entering home" is a
   * Ludo sentence, not a bot sentence. What `bots.ts` owns is the part that is
   * genuinely general: how long to think, and how often to be wrong.
   */
  scoreMove(state: S, seatId: number, move: M, difficulty: Difficulty): number;
}
