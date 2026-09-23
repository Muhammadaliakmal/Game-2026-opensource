import test from "node:test";
import assert from "node:assert/strict";
import { createBotDriver, fillSeats } from "@/arcade/host/bots";
import { mulberry32 } from "@/arcade/host/rng";
import { createTurnMachine } from "@/arcade/host/turn";
import type { GameServices, InputState } from "@/arcade/host/types";
import { HAND_LIMIT, SQUARES } from "./board";
import { createSnakesRules } from "./rules";
import { DEFAULT_SETTINGS } from "./tuning";
import snakes from "./index";

/**
 * A whole match, played with no canvas.
 *
 * The same argument `ludo/match.test.ts` makes, and it applies twice over here
 * because this cabinet adds a fifth thing to the order: the rules, the
 * machine, the animator, the bots — and now a hand that is written by
 * `applyMove` and read by `getLegalMoves` on the very next turn. The failure
 * mode of getting that order wrong is not a wrong answer, it is a board that
 * stops.
 *
 * `create()` needs no context to build, so the run below is the real game
 * module stepped exactly as `GameHost` steps it, with only `render` left out.
 */

const input: InputState = {
  keys: {},
  pointer: { x: 0, y: 0, down: false },
  axis: { x: 0, y: 0 },
  touches: [],
};

interface Result {
  place: number;
  of: number;
}

function play(seed: number, maxSteps = 200_000) {
  let result: Result | null = null;
  let overs = 0;

  const services: GameServices = {
    // Never touched: `render` is the only thing that draws and it is not called
    // here. Typed away rather than stubbed, because a fake context that
    // silently answers every call is a fake that hides a real draw.
    ctx: null as unknown as CanvasRenderingContext2D,
    width: 900,
    height: 640,
    input,
    rng: mulberry32(seed),
    sfx: () => {},
    onScore: () => {
      throw new Error("a board cabinet has no score to push");
    },
    onGameOver: () => {
      overs++;
    },
    onPlaced: (place, of) => {
      overs++;
      result = { place, of };
    },
  };

  const game = snakes.create(services);
  assert.ok(!(game instanceof Promise), "Snakes loads nothing, so it is not async");

  let steps = 0;
  const g = game as Exclude<typeof game, Promise<unknown>>;
  while (result === null && steps < maxSteps) {
    g.step(1 / 60, services);
    steps++;
  }
  g.destroy();

  return { result: result as Result | null, steps, overs };
}

test("a match plays itself to a placement, with nobody touching it", () => {
  // Every seat but the local one is a bot, and the local seat is a human who
  // has walked away — so this also exercises the turn clock rolling and playing
  // the best move for an absent player, which is the path an idle tab takes.
  const { result, steps } = play(12345);
  assert.ok(result, "the match never ended");
  assert.ok(result.place >= 1 && result.place <= 4, `placed ${result.place}`);
  assert.equal(result.of, 4);
  assert.ok(steps > 60, "a match that ends in a second did not happen");
});

test("it ends once, however long it runs", () => {
  const { overs } = play(999);
  assert.equal(overs, 1);
});

test("twelve seeds, twelve finished matches", () => {
  // The deadlocks worth fearing are state-dependent — a hand that fills on the
  // turn it is spent, a swap on the last move, a bounce off a hundred into a
  // snake — so this is a spread of matches and the step budget is the
  // assertion.
  for (let seed = 1; seed <= 12; seed++) {
    const { result, steps } = play(seed);
    assert.ok(result, `seed ${seed} hung after ${steps} steps`);
  }
});

test("the same seed plays the same match", () => {
  const a = play(4242);
  const b = play(4242);
  assert.deepEqual(a.result, b.result);
  assert.equal(a.steps, b.steps, "step for step, not merely the same result");
});

test("a match is about two minutes, which is what this cabinet is for", () => {
  // Measured rather than claimed, exactly as Quick Ludo's length was. Over
  // sixty seeded four-bot tables: a median of 2.0 minutes, p10 1.3, p90 3.4,
  // at about 68 rolls a match. That is less than half Quick Ludo's 5.3, and
  // the gap is the right way round — one token and no yard to escape from
  // means the dice come round faster — but it is also the number the payout
  // is set against, because a shorter board game that paid the same per match
  // would simply be the one to grind. See `lib/arcade-payout.ts`.
  //
  // Worth pinning because match length is not a property of the rules alone.
  // Bot think time, the dice tumble, the turn-end beat and the length of a hop
  // chain are all in it, and any of them can be retuned by somebody looking at
  // a different problem. A deck reweighted towards Reverse would move it too.
  const median = medianMinutes();
  assert.ok(median > 1, `matches got shorter than a game: ${median.toFixed(1)}`);
  assert.ok(median < 5, `matches got longer than a session: ${median.toFixed(1)}`);
});

test("nobody ends a match holding more cards than the hand allows", () => {
  // The hand is the one piece of state a bug here could inflate, and it is
  // written in `applyMove` and read in `getLegalMoves` on the next turn — the
  // two ends of the order this file exists to check.
  const { state, at } = playBots(31);
  for (let s = 0; s < 4; s++) {
    assert.ok(state.hands[s].length <= HAND_LIMIT, `seat ${s} held too many`);
    assert.ok(at[s] >= 0 && at[s] <= SQUARES, `seat ${s} is off the board`);
  }
});

test("cards are spent, not hoarded", () => {
  // The other way the decision layer can fail silently: bots that never play a
  // card leave a game that is exactly the printed one, and every test above
  // would still pass. Counted across a whole match rather than asserted per
  // turn, because most turns correctly have nothing worth spending.
  // Seven a match is what the measurement above found; twelve across six is a
  // floor well under it that still fails outright if the layer stops working.
  let spent = 0;
  for (let seed = 1; seed <= 6; seed++) spent += playBots(seed).spent;
  assert.ok(spent >= 12, `only ${spent} cards played across six matches`);
});

/** A four-bot match, run to the end, with the state handed back. */
function playBots(seed: number) {
  const rules = createSnakesRules(DEFAULT_SETTINGS);
  const rng = mulberry32(seed);
  const seats = fillSeats({ total: 4, rng, difficulty: "normal" }).map((s) => ({
    ...s,
    kind: "bot" as const,
    difficulty: "normal" as const,
  }));
  const machine = createTurnMachine({ rules, seats, seed, rng });
  const bots = createBotDriver({ machine, rules, rng });
  machine.start();

  let steps = 0;
  let spent = 0;
  while (machine.phase !== "matchOver" && steps < 1_000_000) {
    machine.step();
    bots.step();
    for (const e of machine.drainEvents()) if (e.kind === "spend") spent++;
    // Stood in for rather than animated: what is being measured is the pace of
    // the decisions, and the hops are the same handful of frames whoever is
    // making them.
    if (machine.phase === "animating") machine.animationDone();
    steps++;
  }
  return { steps, spent, state: machine.state, at: machine.state.at };
}

/** Minutes a four-bot match takes, median of twelve seeds. */
function medianMinutes(): number {
  const runs: number[] = [];
  for (let seed = 1; seed <= 12; seed++) runs.push(playBots(seed).steps / 60 / 60);
  runs.sort((a, b) => a - b);
  return runs[Math.floor(runs.length / 2)];
}
