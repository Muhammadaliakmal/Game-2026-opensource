import test from "node:test";
import assert from "node:assert/strict";
import { mulberry32 } from "@/arcade/host/rng";
import * as R from "./ragdoll";
import { createMatch, type Difficulty } from "./match";
import { createAi, PROFILES } from "./ai";

/**
 * The difficulty ladder, measured rather than asserted.
 *
 * The tiers differ only in timing and accuracy (see `ai.ts`), so the claim
 * "Hard is harder than Medium" is not a setting anybody can read off a
 * profile — it is a thing that either happens on the arena or does not.
 * These play whole matches between tiers, with the sides swapped every other
 * match so the left bank cannot carry a result, on fixed seeds so a failure
 * reproduces.
 */

const DT = 1 / 60;
const NEUTRAL: R.FighterInput = { x: 0, y: 0, jump: false, heavy: false };

function bout(left: Difficulty | null, right: Difficulty | null, seed: number) {
  const m = createMatch(mulberry32(seed));
  const a = left ? createAi(PROFILES[left], 0, mulberry32(seed ^ 0x1234)) : null;
  const b = right ? createAi(PROFILES[right], 1, mulberry32(seed ^ 0x9876)) : null;
  let steps = 0;
  let burns = 0;
  while (m.phase !== "over" && steps < 60 * 400) {
    const ia = a ? a.input(m) : NEUTRAL;
    const ib = b ? b.input(m) : NEUTRAL;
    m.step(DT, ia, ib);
    for (const e of m.events) if (e.type === "burn") burns++;
    steps++;
  }
  return { m, burns };
}

/** Wins for `strong` over `weak` in `n` matches, sides alternating. */
function ladder(strong: Difficulty, weak: Difficulty, n: number) {
  let won = 0;
  for (let i = 0; i < n; i++) {
    const flip = i % 2 === 1;
    const { m } = flip ? bout(weak, strong, 1000 + i) : bout(strong, weak, 1000 + i);
    if (m.winner === (flip ? 1 : 0)) won++;
  }
  return won;
}

test("Medium beats Easy, most of the time", () => {
  const n = 12;
  const won = ladder("medium", "easy", n);
  assert.ok(won >= 8, `Medium won ${won} of ${n}`);
});

test("Hard beats Medium, most of the time", () => {
  const n = 12;
  const won = ladder("hard", "medium", n);
  assert.ok(won >= 8, `Hard won ${won} of ${n}`);
});

test("every tier crosses the lava to reach somebody who will not come to it", () => {
  // The player on the far bank never moves. A CPU that cannot get to them
  // is a CPU that walks into the lava or stands still for a minute; either
  // is a tier that reads as broken rather than as easy.
  for (const tier of ["easy", "medium", "hard"] as const) {
    const { m } = bout(tier, null, 77);
    assert.equal(m.winner, 0, `${tier} did not beat a stationary opponent`);
    assert.ok(m.dealt[0] > 0, `${tier} never landed a hit`);
  }
});
