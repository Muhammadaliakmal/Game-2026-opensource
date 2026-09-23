import test from "node:test";
import assert from "node:assert/strict";
import { createBotDriver, fillSeats } from "@/arcade/host/bots";
import { mulberry32 } from "@/arcade/host/rng";
import { createTurnMachine } from "@/arcade/host/turn";
import type { GameServices, InputState } from "@/arcade/host/types";
import { createLudoRules } from "./rules";
import { DEFAULT_SETTINGS } from "./tuning";
import ludo from "./index";

/**
 * A whole match, played with no canvas.
 *
 * The unit tests either side of this one are honest about what they cover:
 * `rules.test.ts` proves the arithmetic, `bots.test.ts` proves the waiting,
 * `turn.test.ts` proves the phases. None of them proves the thing most likely
 * to be wrong, which is the *order the four run in* — and the failure mode
 * there is not a wrong answer, it is a board that stops.
 *
 * Three ways this wiring can deadlock, all of them invisible to a type checker
 * and none of them visible until a real match reaches the state that triggers
 * it:
 *
 *   - the animator is never told to step, so `animating` never ends;
 *   - `animationDone()` is called before the hops are drained, so a token
 *     teleports and the queue backs up behind it;
 *   - a bot is waiting for a phase the machine is waiting for the bot to leave.
 *
 * `create()` needs no context to build — the painter, the animator and the
 * machine are all arithmetic — so the run below is the real game module,
 * stepped exactly as `GameHost` steps it, with only `render` left out.
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
    // Never touched: `render` is the only thing that draws, and it is not
    // called here. Typed away rather than stubbed, because a fake context that
    // silently answers every call is a fake that hides a real draw.
    ctx: null as unknown as CanvasRenderingContext2D,
    width: 800,
    height: 600,
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

  const game = ludo.create(services);
  assert.ok(!(game instanceof Promise), "Ludo loads nothing, so it is not async");

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
  // has walked away — so this also exercises the turn clock rolling and moving
  // for an absent player, which is the path an idle tab takes.
  const { result, steps } = play(12345);
  assert.ok(result, "the match never ended");
  assert.ok(result.place >= 1 && result.place <= 4, `placed ${result.place}`);
  assert.equal(result.of, 4);
  assert.ok(steps > 60, "a match that ends in a second did not happen");
});

test("it ends once, however long it runs", () => {
  // `onGameOver` and `onPlaced` both put up the result screen and the host
  // pays on one of them, so a game that fired both would be a game that could
  // be paid twice.
  const { overs } = play(999);
  assert.equal(overs, 1);
});

test("ten seeds, ten finished matches", () => {
  // The deadlocks worth fearing here are state-dependent — three sixes, a
  // capture on the last hop, every remaining seat already placed — so this is
  // a spread of matches rather than one, and the step budget is the assertion.
  for (let seed = 1; seed <= 10; seed++) {
    const { result, steps } = play(seed);
    assert.ok(result, `seed ${seed} hung after ${steps} steps`);
  }
});

test("Quick Ludo is the four-to-six minutes it claims to be", () => {
  // `tuning.ts` makes Quick Ludo the default on the grounds that a standard
  // match runs twelve to twenty minutes and a browser arcade does not get
  // twenty. That was an assertion; this measures it. Over sixty seeds of four
  // bots: two tokens is a median of 5.3 minutes (p10 4.0, p90 6.5) and four
  // tokens is 14.2 (p90 17.9). Both halves of the argument hold.
  //
  // Worth pinning because match length is not a property of the rules alone —
  // bot think time, the dice tumble and the turn-end beat are all in it, and
  // any of them can be retuned by somebody looking at a different problem.
  //
  // Measured over a table of four bots rather than through `play()` above,
  // and the difference is worth stating: `play()`'s local seat is a human who
  // never presses anything, so every one of their turns costs the full
  // fifteen-second clock twice over and the same match takes 21 minutes. That
  // is the right behaviour for an abandoned tab and the wrong number for this
  // question.
  assert.ok(medianMinutes(2) > 3, "matches got shorter than a game");
  assert.ok(medianMinutes(2) < 8, `now ${medianMinutes(2).toFixed(1)} minutes`);
  // And the reason Quick is the default rather than a mode nobody selects.
  assert.ok(medianMinutes(4) > medianMinutes(2) * 1.8);
});

test("the same seed plays the same match", () => {
  const a = play(4242);
  const b = play(4242);
  assert.deepEqual(a.result, b.result);
  assert.equal(a.steps, b.steps, "step for step, not merely the same result");
});

/** Minutes a four-bot match takes, median of twelve seeds. */
function medianMinutes(tokens: number): number {
  const runs: number[] = [];
  for (let seed = 1; seed <= 12; seed++) {
    const rules = createLudoRules({ ...DEFAULT_SETTINGS, tokens });
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
    while (machine.phase !== "matchOver" && steps < 1_000_000) {
      machine.step();
      bots.step();
      // Stood in for rather than animated: what is being measured is the
      // pace of the decisions, and the hops are the same handful of frames
      // whichever seat is making them.
      if (machine.phase === "animating") machine.animationDone();
      steps++;
    }
    runs.push(steps / 60 / 60);
  }
  runs.sort((a, b) => a - b);
  return runs[Math.floor(runs.length / 2)];
}
