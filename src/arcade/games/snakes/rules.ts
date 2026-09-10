import type { MoveEvent, RulesModule, Seat } from "@/arcade/host/rules";
import { mulberry32 } from "@/arcade/host/rng";
import {
  CARD_SQUARES,
  HAND_LIMIT,
  JUMPS,
  SQUARES,
  START_SQUARE,
  advance,
  walk,
  walkBack,
} from "./board";
import {
  BOT_WEIGHTS,
  CARDS,
  CARD_KINDS,
  DEFAULT_SETTINGS,
  OPENING_HAND,
  SIXES_CAP,
  type CardKind,
  type SnakesSettings,
} from "./tuning";

/**
 * Snakes & Ladders, as arithmetic, plus the four cards that make it a game.
 *
 * Nothing here draws or sounds, the same discipline as `ludo/rules.ts`: this
 * half runs headless under `node:test` and could referee an online match from
 * a server without changing a line.
 *
 * ── The deck is dealt at creation, never drawn at random ─────────────────
 *
 * A rules module has no randomness of its own — `host/rules.ts` is explicit
 * that the *machine* rolls the dice, so that a match replays exactly from its
 * seed. Cards are the same problem in a different shape, and the answer is to
 * shuffle the whole deck once inside `createInitialState`, which is handed the
 * seed, and keep a cursor. Drawing a card is then `deck[drawn++]` — a lookup,
 * not a roll. The state stays plain data with no closure hiding in it, which
 * is the property that lets a match be serialised, posted in a bug report, or
 * validated somewhere else.
 *
 * ── A card is a legal move, not a system ─────────────────────────────────
 *
 * `getLegalMoves` returns the plain move plus one per card worth playing. That
 * is the whole integration: the turn machine already knows how to offer a
 * choice, the bots already know how to score one, and the single-legal-move
 * autoplay already knows how to skip a turn with no decision in it — which,
 * with an empty hand, is every turn of the printed game.
 */

export interface SnakesState {
  readonly settings: SnakesSettings;
  readonly seatCount: number;
  /** The square each seat stands on, 0..100. The whole of the position. */
  readonly at: number[];
  /** Each seat's cards, at most `HAND_LIMIT`. */
  readonly hands: CardKind[][];
  /** Shuffled once from the seed. Cycled rather than exhausted. */
  readonly deck: readonly CardKind[];
  /** Cards taken so far. Indexes `deck` modulo its length. */
  drawn: number;
  /** Consecutive sixes by the seat currently rolling. */
  sixes: number;
  /** Seat ids, in the order they reached 100. */
  readonly done: number[];
}

/**
 * Fully specified, per the contract: `applyMove` never has to remember what
 * the dice said.
 *
 * `to` is where the *roll* puts the token — before any snake, ladder or swap,
 * because those are functions of the board and of the move, and recomputing
 * them is cheaper than storing a result that could disagree with the rules
 * that produced it.
 *
 * ── Why `steps` is here when `to` looks like enough ──────────────────────
 *
 * Because the board bounces. A move from 97 to 98 is a one, and it is also a
 * five that went up to 100 and came back — and those are different animations
 * of the same two numbers. `to` is what the board highlights and `steps` is
 * what gets counted out, so both are written down rather than one being
 * recovered from the other by a rule that cannot tell the two cases apart.
 *
 * `target` is the other thing a replay could not recompute: the seat a swap
 * trades with is chosen from a state that will have moved on by then.
 */
export interface SnakesMove {
  readonly card: CardKind | null;
  readonly from: number;
  readonly to: number;
  /** Squares counted, always positive. A Reverse counts them backwards. */
  readonly steps: number;
  readonly target?: number;
}

/** One token per seat, so a token's id is its seat's. */
export const tokenIdOf = (seat: number) => seat;

/**
 * Where a landing on `to` actually leaves you.
 *
 * Anchor stops snakes and only snakes: a card that also refused ladders would
 * be a card nobody plays, and "the snake lets you go" is one sentence.
 */
function landingOf(to: number, card: CardKind | null): number {
  const jump = JUMPS.get(to);
  if (jump === undefined) return to;
  if (card === "anchor" && jump < to) return to;
  return jump;
}

/** The seat furthest ahead of `square`, or -1 when nobody is. */
function leaderOver(state: SnakesState, seatId: number, square: number): number {
  let best = -1;
  for (let s = 0; s < state.seatCount; s++) {
    if (s === seatId) continue;
    if (state.at[s] <= square) continue;
    // Ties go to the lower seat id rather than to whoever was checked last,
    // because a move list has to replay identically and "the leader" must not
    // depend on an iteration order somebody changes later.
    if (best === -1 || state.at[s] > state.at[best]) best = s;
  }
  return best;
}

/**
 * The square a move finishes on, swap included.
 *
 * Shared by `applyMove` and `scoreMove`, so a bot can never be scoring a
 * different game from the one it is playing — the classic way a heuristic bot
 * starts making moves that look like mistakes and are not.
 */
export function finalSquare(
  state: SnakesState,
  seatId: number,
  move: SnakesMove
): number {
  const landing = landingOf(move.to, move.card);
  if (move.card === "swap" && move.target !== undefined) {
    const t = move.target;
    if (t >= 0 && t < state.seatCount && t !== seatId) return state.at[t];
  }
  return landing;
}

/**
 * The full ordering for the result screen, including seats still walking.
 *
 * Deliberately not `rankings`, for the reason `ludo/rules.ts` gives at length:
 * the contract's `rankings` lists only seats that have genuinely finished,
 * because `turn.ts` uses it to decide who is still owed a turn.
 */
export function placings(state: SnakesState): number[] {
  const rest: number[] = [];
  for (let s = 0; s < state.seatCount; s++) {
    if (!state.done.includes(s)) rest.push(s);
  }
  rest.sort((a, b) => state.at[b] - state.at[a]);
  return [...state.done, ...rest];
}

/** The deck, shuffled from the match seed. Same seed, same cards, same order. */
export function buildDeck(seed: number): CardKind[] {
  const deck: CardKind[] = [];
  for (const kind of CARD_KINDS) {
    for (let i = 0; i < CARDS[kind].weight; i++) deck.push(kind);
  }
  // Fisher-Yates, off a generator seeded away from the dice: a deck built from
  // the same stream the machine rolls from would shift every card in the match
  // if the dice count ever changed.
  const rng = mulberry32((seed ^ 0x5ca1ab1e) >>> 0);
  for (let i = deck.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    const swap = deck[i];
    deck[i] = deck[j];
    deck[j] = swap;
  }
  return deck;
}

/** The squares a move walks through, in the order the player counts them. */
export function pathOf(move: SnakesMove): number[] {
  return move.card === "reverse"
    ? walkBack(move.from, move.steps)
    : walk(move.from, move.steps);
}

/** What a square is worth to a seat standing on it. */
function valueOf(state: SnakesState, seatId: number, square: number): number {
  const w = BOT_WEIGHTS;
  let v = square * w.advance;
  if (square === SQUARES) v += w.win;
  if (CARD_SQUARES.has(square) && state.hands[seatId].length < HAND_LIMIT) {
    v += w.cardSquare;
  }
  return v;
}

export function createSnakesRules(
  settings: SnakesSettings = DEFAULT_SETTINGS
): RulesModule<SnakesState, SnakesMove> {
  return {
    id: "snakes",
    seats: { min: 2, max: 4 },
    dice: { faces: 6, count: 1 },

    createInitialState({ seats, seed }: { seats: readonly Seat[]; seed: number }) {
      const deck = buildDeck(seed);
      let drawn = 0;
      const hands: CardKind[][] = seats.map(() => {
        if (!settings.cards) return [];
        const hand: CardKind[] = [];
        for (let i = 0; i < OPENING_HAND; i++) hand.push(deck[drawn++ % deck.length]);
        return hand;
      });
      return {
        settings,
        seatCount: seats.length,
        at: seats.map(() => START_SQUARE),
        hands,
        deck,
        drawn,
        sixes: 0,
        done: [],
      };
    },

    /**
     * A six rolls again, up to `SIXES_CAP` in a row.
     *
     * Never a forfeit. Ludo takes the turn away on a third six because a token
     * stuck in the yard makes that a real cost; here it would only mean the
     * board's one moment of good luck is also a punishment, which is the sort
     * of rule that reads as the game being annoyed with you.
     */
    applyRoll(state, _seatId, roll) {
      if (roll !== 6) {
        state.sixes = 0;
        return { roll, forfeit: false, extraTurn: false };
      }
      state.sixes++;
      if (state.sixes >= SIXES_CAP) {
        state.sixes = 0;
        return { roll, forfeit: false, extraTurn: false };
      }
      return { roll, forfeit: false, extraTurn: true };
    },

    /**
     * The plain move, always, plus one per card that would change something.
     *
     * A card whose outcome is identical to walking is not offered, on the same
     * grounds Ludo collapses two identical yard releases: being asked a
     * question with one answer is not a decision, it is a tap. It also keeps
     * the autoplay honest — with nothing to choose, the single move plays
     * itself and the printed game runs at the pace of the dice.
     */
    getLegalMoves(state, seatId, roll) {
      const from = state.at[seatId];
      const to = advance(from, roll);
      const moves: SnakesMove[] = [{ card: null, from, to, steps: roll }];
      if (!state.settings.cards) return moves;

      const plain = landingOf(to, null);
      const hand = new Set(state.hands[seatId]);

      if (hand.has("boost")) {
        const boosted = advance(from, roll * 2);
        if (landingOf(boosted, null) !== plain) {
          moves.push({ card: "boost", from, to: boosted, steps: roll * 2 });
        }
      }

      if (hand.has("anchor")) {
        // Only against a snake it would actually save you from.
        const bite = JUMPS.get(to);
        if (bite !== undefined && bite < to) {
          moves.push({ card: "anchor", from, to, steps: roll });
        }
      }

      if (hand.has("reverse")) {
        const back = walkBack(from, roll);
        if (back.length === roll) {
          const target = back[back.length - 1];
          if (landingOf(target, null) !== plain) {
            moves.push({ card: "reverse", from, to: target, steps: roll });
          }
        }
      }

      if (hand.has("swap") && plain !== SQUARES) {
        // Not offered on a winning move: a card that gives away a win you
        // already have is a trap, not a choice.
        const target = leaderOver(state, seatId, plain);
        if (target >= 0) moves.push({ card: "swap", from, to, steps: roll, target });
      }

      return moves;
    },

    applyMove(state, seatId, move) {
      const events: MoveEvent[] = [];
      const id = tokenIdOf(seatId);
      const hand = state.hands[seatId];

      if (move.card) {
        const held = hand.indexOf(move.card);
        // Defensive: the machine only ever passes back a move from the list
        // above, but a card spent twice would be a card duplicated, and the
        // hand is the one piece of state a bug here could inflate.
        if (held >= 0) hand.splice(held, 1);
        events.push({ kind: "spend", seatId, tokenId: id });
      }

      // The counted walk, which is what the animator hops. Backwards for a
      // Reverse, and up-then-down for a bounce off 100 — a bounce that is not
      // counted out is a bounce the player reads as a miscount.
      const path = pathOf(move);
      events.push({
        kind: "move",
        seatId,
        tokenId: id,
        path,
        from: move.from,
        to: move.to,
      });

      let square = landingOf(move.to, move.card);
      if (square !== move.to) {
        events.push({ kind: "jump", seatId, tokenId: id, from: move.to, to: square });
      } else if (move.card === "anchor") {
        // The snake that did not happen. Worth an event of its own: the whole
        // value of the card is a thing *not* occurring, and a card that plays
        // no animation is a card the player suspects did nothing.
        events.push({ kind: "held", seatId, tokenId: id, from: square, to: square });
      }

      if (move.card === "swap" && move.target !== undefined) {
        const t = move.target;
        const theirs = state.at[t];
        state.at[t] = square;
        // Two travels, because that is exactly what a swap is: one seat rises
        // and the other falls, and the animator's up and down curves are
        // already the right pair for the two halves.
        events.push({ kind: "jump", seatId, tokenId: id, from: square, to: theirs });
        events.push({
          kind: "jump",
          seatId: t,
          tokenId: tokenIdOf(t),
          from: theirs,
          to: square,
        });
        square = theirs;
        // A swap is a placement, not a landing: the square you are put on does
        // not bite you. Otherwise a swap onto 98 would chain into a snake, and
        // a chain is a rule nobody can hold in their head at a table.
      }

      state.at[seatId] = square;

      if (
        state.settings.cards &&
        CARD_SQUARES.has(square) &&
        hand.length < HAND_LIMIT
      ) {
        hand.push(state.deck[state.drawn++ % state.deck.length]);
        events.push({ kind: "card", seatId, tokenId: id, to: square });
      }

      if (square === SQUARES && !state.done.includes(seatId)) {
        state.done.push(seatId);
        events.push({ kind: "finish", seatId, tokenId: id });
      }

      // Extra turns belong to the dice here, not to the move: there is no
      // capture to reward, and a card that also bought a turn would be two
      // effects hanging off one decision.
      return { events, extraTurn: false };
    },

    isTerminal(state) {
      if (state.settings.endOnFirstWin) return state.done.length >= 1;
      return state.done.length >= state.seatCount - 1;
    },

    rankings: (state) => state.done.slice(),

    scoreMove(state, seatId, move, _difficulty) {
      const w = BOT_WEIGHTS;
      const end = finalSquare(state, seatId, move);

      let score = valueOf(state, seatId, end) - valueOf(state, seatId, move.from);
      if (move.card) score -= w.cardCost;

      if (move.card === "swap" && move.target !== undefined) {
        // What the leader loses, on top of what the swapper gains. Small: this
        // is a race, and a bot that swaps purely to be unpleasant is a bot
        // that hands the third seat the match.
        score += (state.at[move.target] - landingOf(move.to, null)) * w.denyLeader;
      }

      // `difficulty` is accepted and unused, as in Ludo: being worse is not a
      // different scoring function, it is how often the best move is thrown
      // away, and `host/bots.ts` owns that.
      return score;
    },
  };
}
