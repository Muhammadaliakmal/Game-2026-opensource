import test from "node:test";
import assert from "node:assert/strict";
import type { Seat } from "@/arcade/host/rules";
import { mulberry32 } from "@/arcade/host/rng";
import { CARD_SQUARES, HAND_LIMIT, JUMPS, SQUARES } from "./board";
import {
  buildDeck,
  createSnakesRules,
  pathOf,
  placings,
  type SnakesMove,
  type SnakesState,
} from "./rules";
import { DEFAULT_SETTINGS, SIXES_CAP, type CardKind } from "./tuning";

/**
 * The arithmetic, with no canvas and no machine.
 *
 * Everything below sets a position directly and asks one question, which is
 * the whole advantage of a token being a single number: "a seat on 83 rolling
 * a four" is two assignments rather than a match played to that point.
 */

const seats: Seat[] = [
  { id: 0, name: "You", kind: "human" },
  { id: 1, name: "Bilal", kind: "bot", difficulty: "normal" },
  { id: 2, name: "Mina", kind: "bot", difficulty: "normal" },
  { id: 3, name: "Omar", kind: "bot", difficulty: "normal" },
];

const rules = createSnakesRules(DEFAULT_SETTINGS);

/** A state with everybody at the start and nobody holding anything. */
function fresh(seed = 1): SnakesState {
  const state = rules.createInitialState({ seats, seed });
  for (const hand of state.hands) hand.length = 0;
  return state;
}

const withHand = (state: SnakesState, seat: number, cards: CardKind[]) => {
  state.hands[seat] = cards.slice();
  return state;
};

const cardMove = (moves: SnakesMove[], card: CardKind) =>
  moves.find((m) => m.card === card);

test("there is always something to do, even with nothing in hand", () => {
  // The printed game never passes a turn, and the machine relies on that: an
  // empty move list ends the turn, which here would be a seat that never moves.
  const state = fresh();
  for (let at = 0; at <= SQUARES - 1; at++) {
    state.at[0] = at;
    for (let roll = 1; roll <= 6; roll++) {
      const moves = rules.getLegalMoves(state, 0, roll);
      assert.equal(moves.length, 1, `${at} rolling ${roll} offered ${moves.length}`);
      assert.equal(moves[0].card, null);
    }
  }
});

test("a ladder is climbed and a snake is slid, and the walk is emitted", () => {
  const state = fresh();
  state.at[0] = 0;
  const [move] = rules.getLegalMoves(state, 0, 4);
  assert.equal(move.to, 4, "the roll lands on the ladder's foot");

  const { events } = rules.applyMove(state, 0, move);
  assert.equal(state.at[0], 14, "the ladder was not climbed");

  const walked = events.find((e) => e.kind === "move");
  assert.deepEqual(walked?.path, [1, 2, 3, 4], "the four squares were not counted");
  const jump = events.find((e) => e.kind === "jump");
  assert.equal(jump?.from, 4);
  assert.equal(jump?.to, 14);
});

test("an exact roll wins and an overshoot bounces — into 98's snake", () => {
  const state = fresh();
  state.at[0] = 96;
  const [win] = rules.getLegalMoves(state, 0, 4);
  rules.applyMove(state, 0, win);
  assert.equal(state.at[0], SQUARES);
  assert.deepEqual(rules.rankings(state), [0]);
  assert.equal(rules.isTerminal(state), true);

  // The bounce, and the reason it is the house rule worth having: 97 on a five
  // touches a hundred and comes back down onto the meanest snake on the board.
  const other = fresh();
  other.at[1] = 97;
  const [bounced] = rules.getLegalMoves(other, 1, 5);
  assert.equal(bounced.to, 98);
  assert.deepEqual(pathOf(bounced), [98, 99, 100, 99, 98]);
  rules.applyMove(other, 1, bounced);
  assert.equal(other.at[1], 78, "the snake at 98 did not bite");
});

test("boost counts the roll twice", () => {
  const state = withHand(fresh(), 0, ["boost"]);
  state.at[0] = 0;
  const moves = rules.getLegalMoves(state, 0, 2);
  const boost = cardMove(moves, "boost");
  assert.ok(boost, "boost was not offered");
  assert.equal(boost.to, 4, "two twos is four");
  assert.equal(boost.steps, 4);

  rules.applyMove(state, 0, boost);
  assert.equal(state.at[0], 14, "four is a ladder to fourteen");
  assert.equal(state.hands[0].length, 0, "the card was not spent");
});

test("anchor is offered against a snake and nothing else", () => {
  const state = withHand(fresh(), 0, ["anchor"]);

  // 12 rolling a four lands on 16, which is a snake.
  state.at[0] = 12;
  const bitten = rules.getLegalMoves(state, 0, 4);
  const anchor = cardMove(bitten, "anchor");
  assert.ok(anchor, "anchor was not offered against a snake");

  const { events } = rules.applyMove(state, 0, anchor);
  assert.equal(state.at[0], 16, "the anchor did not hold");
  assert.ok(
    events.some((e) => e.kind === "held"),
    "a card whose whole effect is an absence must still say so"
  );

  // And on a turn with no snake in it, the card is not on offer: being asked a
  // question with one answer is not a decision.
  const calm = withHand(fresh(), 0, ["anchor"]);
  calm.at[0] = 12;
  assert.equal(rules.getLegalMoves(calm, 0, 3).length, 1);
});

test("anchor does not refuse a ladder", () => {
  const state = withHand(fresh(), 0, ["anchor"]);
  state.at[0] = 0;
  // 4 is a ladder, so there is nothing for the anchor to hold against.
  const moves = rules.getLegalMoves(state, 0, 4);
  assert.equal(cardMove(moves, "anchor"), undefined);
});

test("reverse counts the roll backwards", () => {
  const state = withHand(fresh(), 0, ["reverse"]);
  state.at[0] = 20;
  const moves = rules.getLegalMoves(state, 0, 6);
  const back = cardMove(moves, "reverse");
  assert.ok(back, "reverse was not offered");
  assert.equal(back.to, 14);
  assert.deepEqual(pathOf(back), [19, 18, 17, 16, 15, 14]);

  // And it is not offered when there is not that much board behind you.
  const early = withHand(fresh(), 0, ["reverse"]);
  early.at[0] = 2;
  assert.equal(cardMove(rules.getLegalMoves(early, 0, 5), "reverse"), undefined);
});

test("swap trades squares with the leader, and only when there is one", () => {
  const state = withHand(fresh(), 0, ["swap"]);
  state.at[0] = 10;
  state.at[1] = 60;
  state.at[2] = 40;

  const moves = rules.getLegalMoves(state, 0, 3);
  const swap = cardMove(moves, "swap");
  assert.ok(swap, "swap was not offered with somebody ahead");
  assert.equal(swap.target, 1, "swapped with the wrong seat");

  rules.applyMove(state, 0, swap);
  assert.equal(state.at[0], 60, "the swapper did not take the leader's square");
  assert.equal(state.at[1], 13, "the leader was not put where the swapper landed");

  // Out in front, there is nobody to trade with.
  const ahead = withHand(fresh(), 0, ["swap"]);
  ahead.at[0] = 90;
  assert.equal(cardMove(rules.getLegalMoves(ahead, 0, 2), "swap"), undefined);
});

test("a swap is a placement, so the square it puts you on does not bite", () => {
  // The rule that stops a chain nobody could hold in their head at a table.
  const state = withHand(fresh(), 0, ["swap"]);
  state.at[0] = 10;
  state.at[1] = 98;
  const swap = cardMove(rules.getLegalMoves(state, 0, 3), "swap");
  assert.ok(swap);
  rules.applyMove(state, 0, swap);
  assert.equal(state.at[0], 98, "98's snake ate a token that was placed there");
});

test("swap is not offered on a move that already wins", () => {
  const state = withHand(fresh(), 0, ["swap"]);
  state.at[0] = 97;
  state.at[1] = 99;
  assert.equal(cardMove(rules.getLegalMoves(state, 0, 3), "swap"), undefined);
});

test("a card square hands out a card, and a full hand does not take a fourth", () => {
  const square = [...CARD_SQUARES][0];
  const state = fresh();
  state.at[0] = square - 1;
  const [step] = rules.getLegalMoves(state, 0, 1);
  const { events } = rules.applyMove(state, 0, step);
  assert.equal(state.hands[0].length, 1, "the card square paid nothing");
  assert.ok(events.some((e) => e.kind === "card"));

  const full = withHand(fresh(), 0, ["boost", "boost", "boost"]);
  full.at[0] = square - 1;
  const [again] = rules.getLegalMoves(full, 0, 1);
  rules.applyMove(full, 0, again);
  assert.equal(full.hands[0].length, HAND_LIMIT, "the hand grew past its limit");
});

test("a six rolls again, twice, and then stops", () => {
  const state = fresh();
  const results = [1, 2, 3].map(() => rules.applyRoll(state, 0, 6));
  assert.deepEqual(
    results.map((r) => r.extraTurn),
    [true, true, false]
  );
  assert.equal(SIXES_CAP, 3);
  // Never a forfeit: a six is the board's one moment of luck and must not also
  // be a punishment.
  assert.ok(results.every((r) => !r.forfeit));
  // And the streak is broken by anything else.
  rules.applyRoll(state, 0, 6);
  assert.equal(rules.applyRoll(state, 0, 3).extraTurn, false);
  assert.equal(rules.applyRoll(state, 0, 6).extraTurn, true);
});

test("the same seed deals the same deck", () => {
  assert.deepEqual(buildDeck(2024), buildDeck(2024));
  assert.notDeepEqual(buildDeck(2024), buildDeck(2025));
  // Every kind is in there, or a card exists only in the tuning table.
  const kinds = new Set(buildDeck(7));
  assert.deepEqual([...kinds].sort(), ["anchor", "boost", "reverse", "swap"]);
});

test("a bot spends the anchor on a long snake and not on a short one", () => {
  // 87 loses 63 squares and is worth a card. 56 loses three and is not, which
  // is what `cardCost` is for — a bot with no charge for spending dumps its
  // hand on the first turn a card gains it anything at all.
  const long = withHand(fresh(), 0, ["anchor"]);
  long.at[0] = 83;
  const longMoves = rules.getLegalMoves(long, 0, 4);
  assert.ok(
    best(long, longMoves)?.card === "anchor",
    "the bot rode a sixty-three square snake with an anchor in hand"
  );

  const short = withHand(fresh(), 0, ["anchor"]);
  short.at[0] = 52;
  const shortMoves = rules.getLegalMoves(short, 0, 4);
  assert.equal(JUMPS.get(56), 53, "this test is written against the 56 snake");
  assert.equal(best(short, shortMoves)?.card, null, "a card for three squares");
});

test("a bot climbs a ladder rather than walking past it", () => {
  const state = fresh();
  state.at[0] = 0;
  const ladder = rules.getLegalMoves(state, 0, 4)[0];
  const plain = rules.getLegalMoves(state, 0, 3)[0];
  assert.ok(
    rules.scoreMove(state, 0, ladder, "normal") >
      rules.scoreMove(state, 0, plain, "normal")
  );
});

test("every offered move walks to where it says it does", () => {
  // The property `steps` exists to hold: `to` alone cannot tell a one from a
  // five that bounced, so a walk that ended anywhere else would be a token
  // animating to a square the rules did not put it on.
  const rng = mulberry32(99);
  const state = fresh(5);
  for (let i = 0; i < 4000; i++) {
    for (let s = 0; s < 4; s++) state.at[s] = Math.floor(rng() * SQUARES);
    state.hands[0] = ["boost", "anchor", "reverse"].filter(
      () => rng() < 0.6
    ) as CardKind[];
    if (rng() < 0.4) state.hands[0].push("swap");

    const roll = 1 + Math.floor(rng() * 6);
    for (const move of rules.getLegalMoves(state, 0, roll)) {
      const path = pathOf(move);
      assert.equal(path[path.length - 1], move.to, JSON.stringify(move));
      for (const sq of path) assert.ok(sq >= 0 && sq <= SQUARES);
    }
  }
});

test("the result screen can order a table nobody finished", () => {
  const state = fresh();
  state.at[0] = 12;
  state.at[1] = 71;
  state.at[2] = 40;
  state.at[3] = 3;
  assert.deepEqual(placings(state), [1, 2, 0, 3]);

  // And a finisher outranks everyone still walking, however far along they are.
  state.done.push(3);
  assert.deepEqual(placings(state), [3, 1, 2, 0]);
});

/** The move a bot would take, ignoring the blunder rate `bots.ts` owns. */
function best(state: SnakesState, moves: SnakesMove[]): SnakesMove | undefined {
  let top: SnakesMove | undefined;
  let score = -Infinity;
  for (const m of moves) {
    const s = rules.scoreMove(state, 0, m, "hard");
    if (s > score) {
      score = s;
      top = m;
    }
  }
  return top;
}
