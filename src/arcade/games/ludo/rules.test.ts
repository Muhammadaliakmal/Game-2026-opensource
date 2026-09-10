import test from "node:test";
import assert from "node:assert/strict";
import type { Seat } from "@/arcade/host/rules";
import { createLudoRules, placings, tokenIdOf, type LudoState } from "./rules";
import { HOME, IN_YARD, LOOP_LEN, SAFE, START, cellFor, yardCell } from "./board";
import { BOT_WEIGHTS, DEFAULT_SETTINGS, type LudoSettings } from "./tuning";

/**
 * Ludo's rules, run headless.
 *
 * Every one of these is a sentence somebody says at a table — "you need an
 * exact roll", "you can't be taken on a star", "three sixes and you lose your
 * turn" — checked against the arithmetic that claims to implement it. That is
 * most of why `rules.ts` imports nothing: an argument about whether a move was
 * legal is settled by a test rather than by opening the game and hoping the
 * dice cooperate.
 *
 * States are built by writing `progress` directly rather than by playing a
 * match into position. Rolling until a token happens to sit six cells ahead of
 * an enemy is a test that depends on the dice, and a test that depends on the
 * dice is a test that fails on a Tuesday.
 */

const seatsOf = (n: number): Seat[] =>
  Array.from({ length: n }, (_, i) => ({
    id: i,
    name: `Seat ${i}`,
    kind: i === 0 ? "human" : "bot",
  }));

function match(over: Partial<LudoSettings> = {}, seatCount = 4) {
  const settings = { ...DEFAULT_SETTINGS, ...over };
  const rules = createLudoRules(settings);
  const state: LudoState = rules.createInitialState({
    seats: seatsOf(seatCount),
    seed: 7,
  });
  return { rules, state };
}

/** The loop cell a seat's token stands on at a given progress. */
const cellOf = (seat: number, progress: number) =>
  (START[seat] + progress) % LOOP_LEN;

// ── Leaving the yard ─────────────────────────────────────────────────────

test("only a six opens the yard", () => {
  const { rules, state } = match();
  for (const roll of [1, 2, 3, 4, 5]) {
    assert.equal(rules.getLegalMoves(state, 0, roll).length, 0, `roll ${roll}`);
  }
  assert.equal(rules.getLegalMoves(state, 0, 6).length, 1);
});

test("a one opens it too, when the house plays that way", () => {
  const { rules, state } = match({ unlockOnOne: true });
  assert.equal(rules.getLegalMoves(state, 0, 1).length, 1);
  assert.equal(rules.getLegalMoves(state, 0, 2).length, 0);
});

test("four tokens waiting in the yard are one decision, not four", () => {
  // Being asked which of four identical pieces to release is a choice with no
  // content. Collapsing them is also what lets the single-move autoplay fire.
  const { rules, state } = match({ tokens: 4 });
  assert.equal(rules.getLegalMoves(state, 0, 6).length, 1);
});

test("a token leaving the yard is placed on its start, not walked to it", () => {
  const { rules, state } = match();
  const [move] = rules.getLegalMoves(state, 0, 6);
  const { events } = rules.applyMove(state, 0, move);
  const walk = events[0];
  assert.equal(walk.kind, "move");
  assert.deepEqual(walk.path, [cellOf(0, 0)]);
  assert.equal(walk.from, yardCell(0, move.token));
});

// ── The dice ─────────────────────────────────────────────────────────────

test("three sixes and the turn is gone", () => {
  const { rules, state } = match();
  const first = rules.applyRoll(state, 0, 6);
  assert.deepEqual([first.forfeit, first.extraTurn], [false, true]);
  const second = rules.applyRoll(state, 0, 6);
  assert.deepEqual([second.forfeit, second.extraTurn], [false, true]);
  const third = rules.applyRoll(state, 0, 6);
  assert.deepEqual([third.forfeit, third.extraTurn], [true, false]);
});

test("the streak is consecutive sixes, not sixes", () => {
  const { rules, state } = match();
  rules.applyRoll(state, 0, 6);
  rules.applyRoll(state, 0, 6);
  rules.applyRoll(state, 0, 4);
  assert.equal(state.sixes, 0);
  // Two more must now be a fresh pair rather than the third and fourth.
  assert.equal(rules.applyRoll(state, 0, 6).forfeit, false);
  assert.equal(rules.applyRoll(state, 0, 6).forfeit, false);
});

test("a forfeited turn leaves the counter clear for the next seat", () => {
  const { rules, state } = match();
  rules.applyRoll(state, 0, 6);
  rules.applyRoll(state, 0, 6);
  rules.applyRoll(state, 0, 6);
  assert.equal(state.sixes, 0);
});

// ── Getting home ─────────────────────────────────────────────────────────

test("home needs the exact roll, and an overshoot is a turn spent", () => {
  const { rules, state } = match();
  state.progress[0][0] = HOME - 2;
  assert.equal(rules.getLegalMoves(state, 0, 3).length, 0, "57 is not 58");
  const moves = rules.getLegalMoves(state, 0, 2);
  assert.equal(moves.length, 1);
  assert.equal(moves[0].to, HOME);
});

test("a token that is home is not a token that can move", () => {
  const { rules, state } = match({ tokens: 2 });
  state.progress[0][0] = HOME;
  state.progress[0][1] = 20;
  const moves = rules.getLegalMoves(state, 0, 3);
  assert.deepEqual(
    moves.map((m) => m.token),
    [1]
  );
});

test("the last token home places the seat, and only then", () => {
  const { rules, state } = match({ tokens: 2 });
  state.progress[0][0] = HOME;
  state.progress[0][1] = HOME - 1;
  assert.deepEqual(rules.rankings(state), []);

  const { events } = rules.applyMove(state, 0, {
    token: 1,
    from: HOME - 1,
    to: HOME,
  });
  assert.ok(events.some((e) => e.kind === "enterHome"));
  assert.deepEqual(rules.rankings(state), [0]);
  assert.ok(rules.isTerminal(state));
});

// ── Capture ──────────────────────────────────────────────────────────────

test("landing on an enemy sends it home, and buys another roll", () => {
  const { rules, state } = match();
  // Seat 0 walks 7 -> 10, which is loop cell 11; seat 1 at 49 is standing on it.
  state.progress[0][0] = 7;
  state.progress[1][0] = 49;
  assert.equal(cellOf(0, 10), cellOf(1, 49));

  const { events, extraTurn } = rules.applyMove(state, 0, {
    token: 0,
    from: 7,
    to: 10,
  });
  assert.equal(state.progress[1][0], IN_YARD);
  assert.ok(extraTurn);

  const capture = events.find((e) => e.kind === "capture");
  assert.ok(capture, "a capture nobody was told about is a token that vanishes");
  assert.equal(capture.tokenId, tokenIdOf(1, 0));
  assert.equal(capture.to, yardCell(1, 0));
});

test("a star is a star: nobody is taken on a safe cell", () => {
  const { rules, state } = match();
  // Cell 9 is seat 0's star, eight cells past its start.
  assert.ok(SAFE.has(cellOf(0, 8)));
  state.progress[0][0] = 5;
  state.progress[1][0] = 47;
  assert.equal(cellOf(0, 8), cellOf(1, 47));

  const { events, extraTurn } = rules.applyMove(state, 0, {
    token: 0,
    from: 5,
    to: 8,
  });
  assert.equal(state.progress[1][0], 47, "the tenant was safe and stayed");
  assert.equal(extraTurn, false);
  assert.equal(
    events.some((e) => e.kind === "capture"),
    false
  );
});

test("your own tokens stack rather than take each other", () => {
  const { rules, state } = match({ tokens: 2 });
  state.progress[0][0] = 10;
  state.progress[0][1] = 7;
  const { events, extraTurn } = rules.applyMove(state, 0, {
    token: 1,
    from: 7,
    to: 10,
  });
  assert.equal(state.progress[0][0], 10, "the token already there is untouched");
  assert.equal(extraTurn, false);
  assert.equal(
    events.some((e) => e.kind === "capture"),
    false
  );
});

test("a capture does not buy a turn when the house says it does not", () => {
  const { rules, state } = match({ captureExtraTurn: false });
  state.progress[0][0] = 7;
  state.progress[1][0] = 49;
  const { events, extraTurn } = rules.applyMove(state, 0, {
    token: 0,
    from: 7,
    to: 10,
  });
  assert.ok(
    events.some((e) => e.kind === "capture"),
    "still a capture"
  );
  assert.equal(extraTurn, false, "just not another roll");
});

test("the walk is the cells entered, so a four hops four times", () => {
  const { rules, state } = match();
  state.progress[0][0] = 12;
  const { events } = rules.applyMove(state, 0, { token: 0, from: 12, to: 16 });
  const walk = events[0];
  assert.deepEqual(
    walk.path,
    [13, 14, 15, 16].map((p) => cellOf(0, p))
  );
  assert.equal(walk.path?.includes(cellFor(0, 12, 0)), false, "not the cell left");
  assert.equal(walk.to, cellOf(0, 16));
});

// ── Who came where ───────────────────────────────────────────────────────

test("rankings is finishers only; placings is everybody", () => {
  // The distinction is load-bearing. `turn.ts` reads `rankings` to decide who
  // is still owed a turn, so listing the unfinished there would convince it
  // everybody was done and end the match on the first move. The result screen
  // needs the full order, and gets it from `placings`, which the machine never
  // sees.
  const { rules, state } = match({ endOnFirstWin: false, tokens: 1 });
  state.progress[2][0] = HOME - 1;
  rules.applyMove(state, 2, { token: 0, from: HOME - 1, to: HOME });
  state.progress[1][0] = 30;
  state.progress[3][0] = 10;

  assert.deepEqual(rules.rankings(state), [2]);
  assert.deepEqual(placings(state), [2, 1, 3, 0], "then by ground covered");
});

test("playing out the places ends when one seat is left racing nobody", () => {
  const { rules, state } = match({ endOnFirstWin: false, tokens: 1 });
  state.done.push(0);
  assert.equal(rules.isTerminal(state), false);
  state.done.push(1);
  assert.equal(rules.isTerminal(state), false);
  state.done.push(2);
  assert.ok(rules.isTerminal(state));
});

// ── What a bot wants ─────────────────────────────────────────────────────

test("a capture outranks the same move without one", () => {
  const plain = match();
  plain.state.progress[0][0] = 7;
  const quiet = plain.rules.scoreMove(
    plain.state,
    0,
    { token: 0, from: 7, to: 10 },
    "normal"
  );

  const taking = match();
  taking.state.progress[0][0] = 7;
  taking.state.progress[1][0] = 49;
  const loud = taking.rules.scoreMove(
    taking.state,
    0,
    { token: 0, from: 7, to: 10 },
    "normal"
  );

  assert.ok(loud > quiet);
  assert.equal(loud - quiet, BOT_WEIGHTS.capture);
});

test("progress can never outvote an intent", () => {
  // The weights are ordinal before they are cardinal: the longest walk on
  // offer is six cells at one point each, and that must not reach the smallest
  // deliberate weight. A table where the tie-breaker can win is how a
  // heuristic bot starts making moves nobody can explain.
  const longest = 6 * BOT_WEIGHTS.advanceProgress;
  const smallestIntent = Math.min(
    BOT_WEIGHTS.capture,
    BOT_WEIGHTS.enterHome,
    BOT_WEIGHTS.leaveYard,
    BOT_WEIGHTS.reachSafe,
    BOT_WEIGHTS.escapeThreat
  );
  assert.ok(longest < smallestIntent);
});

test("a bot does not flee a chaser that has already turned for home", () => {
  // Cell 13 is the one loop cell seat 1 can never reach: it sits one past the
  // end of its own lap, so a seat 1 token four cells behind it turns into its
  // home lane instead of arriving. Without the reachability check in
  // `threatened`, a bot runs from pieces that are no longer chasing it.
  const safeFromOne = match({ tokens: 1 });
  safeFromOne.state.progress[0][0] = 9;
  safeFromOne.state.progress[1][0] = 47;
  assert.equal(cellOf(1, 47), cellOf(0, 8), "four cells behind the square");
  const unbothered = safeFromOne.rules.scoreMove(
    safeFromOne.state,
    0,
    { token: 0, from: 9, to: 12 },
    "normal"
  );

  const chased = match({ tokens: 1 });
  chased.state.progress[0][0] = 9;
  chased.state.progress[2][0] = 34;
  assert.equal(cellOf(2, 34), cellOf(0, 8), "same square, a seat with a lap left");
  const hunted = chased.rules.scoreMove(
    chased.state,
    0,
    { token: 0, from: 9, to: 12 },
    "normal"
  );

  // Identical in every other term, so the whole gap is the exposure penalty.
  assert.equal(unbothered - hunted, -BOT_WEIGHTS.exposeToCapture);
});

test("difficulty is not a different opinion of a move", () => {
  // Being worse is how often the plan is thrown away, and that belongs to the
  // bot. If this ever stops holding, `BLUNDER_RATE` has been reimplemented in
  // the wrong file.
  const { rules, state } = match();
  state.progress[0][0] = 7;
  const move = { token: 0, from: 7, to: 10 };
  assert.equal(
    rules.scoreMove(state, 0, move, "easy"),
    rules.scoreMove(state, 0, move, "hard")
  );
});
