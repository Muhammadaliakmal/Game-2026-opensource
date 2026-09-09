import test from "node:test";
import assert from "node:assert/strict";
import { mulberry32 } from "./rng";
import type { RollResult, RulesModule, Seat } from "./rules";
import {
  AUTOPLAY_STEPS,
  DICE_STEPS,
  TURN_END_STEPS,
  createTurnMachine,
} from "./turn";

/**
 * A toy game, because the machine must be testable without Ludo existing.
 *
 * That it can be is the point of the contract: everything below is plain
 * arithmetic over plain objects, running under `node:test` with no canvas, no
 * DOM and no React. If this file ever needs one of those, the seam between
 * `rules.ts` and the games has leaked.
 *
 * Note the shape of a move: `{ token, roll }`, not `token`. A move is fully
 * specified, so `applyMove` needs no side channel to remember what the dice
 * said — which is what lets a server replay a move list later without also
 * replaying the roll that produced each one.
 */
interface ToyState {
  pos: number[];
  done: number[];
  goal: number;
}

type ToyMove = { token: number; roll: number };

interface ToyOptions {
  goal?: number;
  /** A roll of this value forfeits the turn — stands in for three sixes. */
  forfeitOn?: number;
  /** A roll of this value grants another. */
  extraOn?: number;
  /** A roll of this value produces no legal move. */
  noMovesOn?: number;
  /** More than one makes the machine wait for a choice instead of autoplaying. */
  tokens?: number;
}

function toyRules(o: ToyOptions = {}): RulesModule<ToyState, ToyMove> {
  const tokens = o.tokens ?? 1;
  return {
    id: "toy",
    seats: { min: 2, max: 4 },
    dice: { faces: 6, count: 1 },

    createInitialState: ({ seats }) => ({
      pos: seats.map(() => 0),
      done: [],
      goal: o.goal ?? 10,
    }),

    applyRoll(_state, _seatId, roll): RollResult {
      return {
        roll,
        forfeit: roll === o.forfeitOn,
        extraTurn: roll === o.extraOn,
      };
    },

    getLegalMoves(_state, _seatId, roll) {
      if (roll === o.noMovesOn) return [];
      const out: ToyMove[] = [];
      for (let t = 0; t < tokens; t++) out.push({ token: t, roll });
      return out;
    },

    applyMove(state, seatId, move) {
      state.pos[seatId] += move.roll;
      if (state.pos[seatId] >= state.goal && !state.done.includes(seatId)) {
        state.done.push(seatId);
      }
      return { events: [{ kind: "step", seatId, to: state.pos[seatId] }], extraTurn: false };
    },

    // Everybody placed. Deliberately not "all but one", so the bounded loop in
    // `advance` is exercised by the every-seat-finished case.
    isTerminal: (state) => state.done.length >= state.pos.length,
    rankings: (state) => state.done.slice(),
    scoreMove: (_s, _seat, move) => move.token,
  };
}

const seats = (kinds: Array<"human" | "bot">): Seat[] =>
  kinds.map((kind, id) => ({ id, name: `S${id}`, kind }));

function machine(rules: RulesModule<ToyState, ToyMove>, opts: Partial<{
  kinds: Array<"human" | "bot">;
  seed: number;
  autoplaySingle: boolean;
  turnTimerSteps: number;
}> = {}) {
  const kinds = opts.kinds ?? (["human", "human"] as Array<"human" | "bot">);
  return createTurnMachine({
    rules,
    seats: seats(kinds),
    seed: opts.seed ?? 1,
    rng: mulberry32(opts.seed ?? 1),
    autoplaySingle: opts.autoplaySingle,
    turnTimerSteps: opts.turnTimerSteps ?? 0,
  });
}

const run = (m: { step(): void }, n: number) => {
  for (let i = 0; i < n; i++) m.step();
};

test("a seat cannot roll twice for one turn", () => {
  const m = machine(toyRules({ tokens: 2 }));
  m.start();
  assert.equal(m.phase, "awaitingRoll");
  assert.equal(m.requestRoll(), true);

  // The whole reason this is a machine and not a `hasRolled` flag: every
  // moment between pressing roll and the turn ending must refuse a second one.
  assert.equal(m.requestRoll(), false, "while the dice are in the air");
  run(m, DICE_STEPS);
  assert.equal(m.phase, "awaitingMove");
  assert.equal(m.requestRoll(), false, "while a move is being chosen");

  m.chooseMove(m.moves[0]);
  assert.equal(m.phase, "animating");
  assert.equal(m.requestRoll(), false, "while the move is being drawn");
});

test("choosing a move that is not on offer changes nothing", () => {
  const m = machine(toyRules({ tokens: 2 }));
  m.start();
  m.requestRoll();
  run(m, DICE_STEPS);

  assert.equal(m.chooseMove({ token: 0, roll: 99 }), false);
  assert.equal(m.phase, "awaitingMove", "still waiting, not animating a forgery");
  assert.equal(m.chooseMove(m.moves[1]), true);
});

test("a forfeited roll ends the turn without a move", () => {
  // Seed 7's first roll on this RNG is what it is; force the outcome instead
  // of hunting a seed, which is the only honest way to test a branch.
  const rules = toyRules({ tokens: 1 });
  const forced: typeof rules = { ...rules, applyRoll: (_s, _id, roll) => ({ roll, forfeit: true, extraTurn: false }) };
  const m = machine(forced);
  m.start();
  m.requestRoll();
  run(m, DICE_STEPS);

  assert.equal(m.phase, "turnEnd");
  assert.deepEqual(m.moves, []);
  run(m, TURN_END_STEPS);
  assert.equal(m.activeSeat.id, 1, "the turn passed");
  assert.equal(m.state.pos[0], 0, "and seat 0 did not move");
});

test("no legal move is a normal turn, not a stall", () => {
  const rules = toyRules({ tokens: 1 });
  const none: typeof rules = { ...rules, getLegalMoves: () => [] };
  const m = machine(none);
  m.start();
  m.requestRoll();
  run(m, DICE_STEPS);
  assert.equal(m.phase, "turnEnd");
  run(m, TURN_END_STEPS);
  assert.equal(m.phase, "awaitingRoll");
  assert.equal(m.activeSeat.id, 1);
});

test("an extra turn keeps the same seat", () => {
  const rules = toyRules({ tokens: 1 });
  const extra: typeof rules = { ...rules, applyRoll: (_s, _id, roll) => ({ roll, forfeit: false, extraTurn: true }) };
  const m = machine(extra);
  m.start();
  assert.equal(m.activeSeat.id, 0);
  m.requestRoll();
  run(m, DICE_STEPS + AUTOPLAY_STEPS);
  m.animationDone();
  run(m, TURN_END_STEPS);
  assert.equal(m.activeSeat.id, 0, "seat 0 rolls again");
  assert.equal(m.phase, "awaitingRoll");
});

test("a single legal move plays itself, after a beat", () => {
  const m = machine(toyRules({ tokens: 1 }));
  m.start();
  m.requestRoll();
  run(m, DICE_STEPS);

  assert.equal(m.phase, "awaitingMove");
  assert.equal(m.moves.length, 1);
  run(m, AUTOPLAY_STEPS - 1);
  assert.equal(m.phase, "awaitingMove", "not instantly — the player must see the dice");
  m.step();
  assert.equal(m.phase, "animating");
});

test("autoplay off leaves the forced move to be tapped", () => {
  const m = machine(toyRules({ tokens: 1 }), { autoplaySingle: false });
  m.start();
  m.requestRoll();
  run(m, DICE_STEPS + AUTOPLAY_STEPS * 3);
  assert.equal(m.phase, "awaitingMove", "and it waits indefinitely, with no clock");
});

test("the turn clock rolls and then moves for an absent human", () => {
  const m = machine(toyRules({ tokens: 2 }), { turnTimerSteps: 60 });
  m.start();
  assert.equal(m.clock, 60);

  run(m, 60);
  assert.equal(m.phase, "rolling", "it rolled rather than skipping the turn");
  run(m, DICE_STEPS);
  assert.equal(m.phase, "awaitingMove");
  run(m, 60);
  assert.equal(m.phase, "animating", "and played the best-scoring move");
  assert.equal(m.state.pos[0] > 0, true);
});

test("a bot seat is never on the turn clock", () => {
  const m = machine(toyRules({ tokens: 2 }), {
    kinds: ["bot", "human"],
    turnTimerSteps: 60,
  });
  m.start();
  assert.equal(m.clock, null, "a bot has a think timer, not a deadline");
  run(m, 300);
  assert.equal(m.phase, "awaitingRoll", "and nothing auto-rolled for it");
});

test("the match ends when every seat has placed, and does not hang doing it", () => {
  // Goal 1 means one move places a seat, so both finish inside two turns and
  // `advance` runs out of unfinished seats — the case a `while (true)` search
  // for the next player would hang on.
  const m = machine(toyRules({ tokens: 1, goal: 1 }));
  m.start();

  for (let turn = 0; turn < 4 && m.phase !== "matchOver"; turn++) {
    if (m.phase === "awaitingRoll") m.requestRoll();
    run(m, DICE_STEPS + AUTOPLAY_STEPS);
    if (m.phase === "animating") m.animationDone();
    run(m, TURN_END_STEPS);
  }

  assert.equal(m.phase, "matchOver");
  assert.equal(m.rankings.length, 2);
});

test("events are handed over once", () => {
  const m = machine(toyRules({ tokens: 1 }));
  m.start();
  m.requestRoll();
  run(m, DICE_STEPS + AUTOPLAY_STEPS);

  const first = m.drainEvents();
  assert.equal(first.length, 1);
  assert.equal(first[0].kind, "step");
  assert.deepEqual(m.drainEvents(), [], "a second animator gets nothing");
});

test("the same seed plays the same dice", () => {
  const rolls = (seed: number) => {
    const m = machine(toyRules({ tokens: 1 }), { seed });
    const out: number[] = [];
    m.start();
    for (let i = 0; i < 6; i++) {
      // Read through `requestRoll`'s own answer rather than the phase: it is
      // the same guard, and it does not leave the checker believing the phase
      // is frozen across the `step` calls below.
      if (!m.requestRoll()) break;
      run(m, DICE_STEPS);
      out.push(m.roll ?? -1);
      run(m, AUTOPLAY_STEPS);
      m.animationDone();
      run(m, TURN_END_STEPS);
    }
    return out;
  };

  assert.deepEqual(rolls(40219), rolls(40219));
  assert.notDeepEqual(rolls(40219), rolls(40220));
  // Every face is a face. A roll of 0 or 7 is the classic off-by-one in
  // `1 + floor(rng() * faces)` and would be invisible in a UI.
  for (const r of rolls(40219)) {
    assert.equal(r >= 1 && r <= 6, true, `roll ${r} out of range`);
  }
});
