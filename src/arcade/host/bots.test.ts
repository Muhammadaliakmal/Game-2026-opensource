import test from "node:test";
import assert from "node:assert/strict";
import { mulberry32 } from "./rng";
import type { RulesModule, Seat } from "./rules";
import { createTurnMachine, type TurnMachine } from "./turn";
import {
  BLUNDER_RATE,
  BOT_NAMES,
  REACH_STEPS,
  THINK_STEPS,
  createBotDriver,
  fillSeats,
} from "./bots";

/**
 * The bots, over a toy game.
 *
 * Deliberately not over Ludo. What is being tested here is how long a seat
 * waits and how often it is wrong, and both are properties of this file — a
 * test that had to set up a capture to check a blunder rate would be a test
 * that fails when Ludo's weights are retuned.
 *
 * Three moves, scored 0, 1, 2, so "the best move" is a number and a blunder is
 * countable.
 */

interface ToyState {
  picked: number[];
}

type ToyMove = { token: number };

const toyRules: RulesModule<ToyState, ToyMove> = {
  id: "toy",
  seats: { min: 2, max: 4 },
  dice: { faces: 6, count: 1 },
  createInitialState: () => ({ picked: [] }),
  applyRoll: (_s, _seat, roll) => ({ roll, forfeit: false, extraTurn: false }),
  getLegalMoves: () => [{ token: 0 }, { token: 1 }, { token: 2 }],
  applyMove: (state, _seat, move) => {
    state.picked.push(move.token);
    return { events: [], extraTurn: false };
  },
  // Never over: these tests want a machine that keeps dealing turns.
  isTerminal: () => false,
  rankings: () => [],
  scoreMove: (_s, _seat, move) => move.token,
};

/** One legal move, so there is nothing to get wrong. */
const forcedRules: RulesModule<ToyState, ToyMove> = {
  ...toyRules,
  getLegalMoves: () => [{ token: 7 }],
};

const seatsOf = (kinds: Array<"human" | "bot">): Seat[] =>
  kinds.map((kind, id) => ({
    id,
    name: `S${id}`,
    kind,
    ...(kind === "bot" ? { difficulty: "normal" as const } : {}),
  }));

function table(opts: {
  rules?: RulesModule<ToyState, ToyMove>;
  kinds?: Array<"human" | "bot">;
  difficulty?: "easy" | "normal" | "hard";
  seed?: number;
  /** Fixed rng, for counting steps rather than sampling them. */
  rng?: () => number;
}) {
  const rules = opts.rules ?? toyRules;
  const seats = seatsOf(opts.kinds ?? ["bot", "bot"]).map((s) =>
    s.kind === "bot" && opts.difficulty ? { ...s, difficulty: opts.difficulty } : s
  );
  const rng = opts.rng ?? mulberry32(opts.seed ?? 1);
  const machine = createTurnMachine<ToyState, ToyMove>({
    rules,
    seats,
    seed: opts.seed ?? 1,
    rng,
    turnTimerSteps: 0,
  });
  const driver = createBotDriver({ machine, rules, rng });
  machine.start();
  return { machine, driver };
}

/**
 * One frame: the machine's timers, then the seats, then the drawing.
 *
 * The third line is not optional. `animating` has no timer of its own — the
 * animator is the only thing that knows how many cells are left to hop — so a
 * harness that skips it leaves the machine parked on the first move forever,
 * with the bot correctly refusing to act because it is not anybody's turn.
 */
function frame(m: TurnMachine<ToyState, ToyMove>, d: { step(): void }) {
  m.step();
  d.step();
  if (m.phase === "animating") m.animationDone();
}

function run(m: TurnMachine<ToyState, ToyMove>, d: { step(): void }, n: number) {
  for (let i = 0; i < n; i++) frame(m, d);
}

// ── Waiting ──────────────────────────────────────────────────────────────

test("a bot pauses before it reaches for the dice", () => {
  // A fixed rng takes the bottom of every range, so the wait is a number this
  // test can count rather than sample.
  const { machine, driver } = table({ rng: () => 0 });
  assert.equal(machine.phase, "awaitingRoll");

  run(machine, driver, REACH_STEPS.min);
  assert.equal(machine.phase, "awaitingRoll", "still deciding to reach");

  // The step after the wait is the one it acts on.
  run(machine, driver, 1);
  assert.equal(machine.phase, "rolling");
});

test("and pauses longer over the move than over the dice", () => {
  // Different lengths because they are different acts: one is thought, the
  // other is only there so you can see whose turn it became.
  assert.ok(THINK_STEPS.min > REACH_STEPS.min);
  assert.ok(THINK_STEPS.max > REACH_STEPS.max);

  const { machine, driver } = table({ rng: () => 0 });
  // Past the reach, the roll, and the dice tumble, up to the move — and out
  // before the driver has seen the new phase, so the wait is counted from the
  // first step it is armed on rather than from the second.
  let guard = 0;
  while (guard++ < 10_000) {
    machine.step();
    if (machine.phase === "awaitingMove") break;
    driver.step();
    if (machine.phase === "animating") machine.animationDone();
  }
  assert.equal(machine.phase, "awaitingMove");

  run(machine, driver, THINK_STEPS.min);
  assert.equal(machine.phase, "awaitingMove", "not yet");
  run(machine, driver, 1);
  assert.equal(machine.state.picked.length, 1);
});

test("a bot that is not being stepped is a bot that is not thinking", () => {
  // The whole of §2C in one assertion. On the `setTimeout` implementation this
  // passes time and the move happens anyway, which is what a backgrounded tab
  // and a paused game both look like from in here.
  const { machine, driver } = table({ rng: () => 0 });
  run(machine, driver, 2);
  const before = machine.phase;

  return new Promise<void>((resolve) => {
    setTimeout(() => {
      assert.equal(machine.phase, before, "wall-clock time moved the game on");
      assert.equal(machine.state.picked.length, 0);
      resolve();
    }, 40);
  });
});

test("a wait does not carry over to the next seat", () => {
  // Armed for one phase and disarmed the moment it is not that phase, so the
  // next bot cannot inherit the thinking the last one had already done.
  const { machine, driver } = table({ rng: () => 0 });
  run(machine, driver, REACH_STEPS.min); // seat 0, nearly ready to roll
  let guard = 0;
  while (machine.activeSeat.id === 0 && guard++ < 10_000) frame(machine, driver);
  assert.equal(machine.activeSeat.id, 1);
  const at = machine.state.picked.length;
  run(machine, driver, REACH_STEPS.min);
  assert.equal(machine.state.picked.length, at, "seat 1 started its own wait");
});

test("the driver never acts for a human", () => {
  const { machine, driver } = table({ kinds: ["human", "human"] });
  run(machine, driver, 2000);
  assert.equal(machine.phase, "awaitingRoll");
  assert.equal(machine.state.picked.length, 0);
});

// ── Being wrong ──────────────────────────────────────────────────────────

/** Play until `n` moves have been made, and report what was chosen. */
function sample(difficulty: "easy" | "normal" | "hard", n: number, seed = 3) {
  const { machine, driver } = table({ difficulty, seed });
  let guard = 0;
  while (machine.state.picked.length < n && guard++ < 500_000) frame(machine, driver);
  return machine.state.picked;
}

test("a hard bot always takes the best move on offer", () => {
  const picks = sample("hard", 120);
  assert.equal(picks.length, 120);
  assert.ok(
    picks.every((p) => p === 2),
    "the highest-scoring token, every time"
  );
});

test("an easy bot is wrong about as often as the table says", () => {
  // Seeded, so this is a fixed number rather than a coin flip in CI. The band
  // is wide because the point is that the rate is roughly the one declared,
  // not that this particular seed lands on it.
  const n = 400;
  const picks = sample("easy", n);
  const blunders = picks.filter((p) => p !== 2).length / n;
  assert.ok(
    Math.abs(blunders - BLUNDER_RATE.easy) < 0.08,
    `blundered ${(blunders * 100).toFixed(0)}% of the time`
  );
});

test("a blunder is a different move, not a re-roll of the same one", () => {
  // The naive version picks uniformly from *all* moves when the dice say to
  // blunder, which quietly lands back on the best move a third of the time
  // here and makes the tier numbers mean nothing.
  const easy = sample("easy", 400).filter((p) => p !== 2).length / 400;
  const normal = sample("normal", 400).filter((p) => p !== 2).length / 400;
  assert.ok(easy > normal, "the tiers are still ordered");
  assert.ok(Math.abs(normal - BLUNDER_RATE.normal) < 0.08);
});

test("a forced move cannot be blundered", () => {
  // A bot that hesitates and then plays the only legal move has not made a
  // mistake, it has performed one.
  const { machine, driver } = table({ rules: forcedRules, difficulty: "easy", seed: 5 });
  let guard = 0;
  while (machine.state.picked.length < 40 && guard++ < 100_000) frame(machine, driver);
  assert.equal(machine.state.picked.length, 40);
  assert.ok(machine.state.picked.every((p) => p === 7));
});

test("the same seed plays the same match", () => {
  // The claim the whole arcade rests on, extended to the seats: a replay from
  // a seed has to seat the same bots making the same mistakes.
  assert.deepEqual(sample("easy", 60, 11), sample("easy", 60, 11));
  assert.notDeepEqual(sample("easy", 60, 11), sample("easy", 60, 12));
});

// ── Dealing the table ────────────────────────────────────────────────────

test("the local player sits first, and the rest are filled", () => {
  const seats = fillSeats({ total: 4, rng: mulberry32(2), difficulty: "hard" });
  assert.equal(seats.length, 4);
  assert.equal(seats[0].kind, "human");
  assert.equal(seats[0].name, "You");
  assert.ok(seats.slice(1).every((s) => s.kind === "bot"));
  assert.ok(seats.slice(1).every((s) => s.difficulty === "hard"));
  assert.equal(seats[0].difficulty, undefined, "a human is not on a tier");
});

test("no two seats share a name", () => {
  for (let seed = 1; seed <= 50; seed++) {
    const seats = fillSeats({ total: 4, rng: mulberry32(seed) });
    const names = new Set(seats.map((s) => s.name));
    assert.equal(names.size, 4, `seed ${seed} dealt a duplicate`);
  }
});

test("a bot is named like a player, because the disclosure is not its name", () => {
  const seats = fillSeats({ total: 4, rng: mulberry32(9) });
  assert.ok(seats.slice(1).every((s) => BOT_NAMES.includes(s.name)));
  assert.ok(
    seats.every((s) => !/bot|cpu|ai/i.test(s.name)),
    "the lobby says it once, in words"
  );
});

test("seat ids are their index, whatever the table size", () => {
  for (const total of [2, 3, 4]) {
    const seats = fillSeats({ total, rng: mulberry32(4) });
    assert.deepEqual(
      seats.map((s) => s.id),
      Array.from({ length: total }, (_, i) => i)
    );
  }
});
