import { test } from "node:test";
import assert from "node:assert/strict";
import { coinAward, MAX_PER_COURSE, valueOf } from "./coins";
import { CHARACTERS } from "./characters";
import { MEDALS } from "./medals";

test("a first finish pays, medal or not", () => {
  assert.ok(coinAward(undefined, null) > 0, "finishing is worth something");
  assert.ok(coinAward(undefined, "bronze") > coinAward(undefined, null));
});

test("a course pays the same total however it is climbed", () => {
  // The property that makes this fair rather than merely un-farmable: five
  // runs from a bare finish up to Author must pay exactly what one Author run
  // pays, or the fastest players would be the worst paid.
  const inOneGo = coinAward(undefined, "author");

  let stepByStep = coinAward(undefined, null);
  let held: (typeof MEDALS)[number] | null = null;
  for (const medal of [...MEDALS].reverse()) {
    stepByStep += coinAward(held, medal);
    held = medal;
  }

  assert.equal(stepByStep, inOneGo);
  assert.equal(inOneGo, MAX_PER_COURSE);
});

test("running the same course again pays nothing", () => {
  // The whole point. Re-finishing, and even re-finishing faster without
  // changing tier, must be worth zero or the easiest course is a vending
  // machine.
  for (const medal of MEDALS) assert.equal(coinAward(medal, medal), 0);
  assert.equal(coinAward(null, null), 0);
  // A medal already held is not paid for again by a finish that earns none,
  // which cannot happen anyway — the run is not stored unless it is better.
  assert.equal(coinAward("gold", null), 0);
  assert.equal(coinAward("gold", "silver"), 0, "never negative");
});

test("each step up pays the gap and nothing more", () => {
  assert.equal(coinAward("silver", "gold"), valueOf("gold") - valueOf("silver"));
  assert.equal(coinAward("bronze", "author"), valueOf("author") - valueOf("bronze"));
});

test("the ladder is worth more the harder it gets", () => {
  // Ordered the same way the medals are, so a better medal can never be worth
  // less than a worse one — the thing that would make improving a punishment.
  const values = MEDALS.map(valueOf);
  for (let i = 1; i < values.length; i++) {
    assert.ok(values[i] < values[i - 1], `${MEDALS[i]} must be worth less than ${MEDALS[i - 1]}`);
  }
});

test("the shop is reachable, and not in one course", () => {
  // A price nobody can pay is a locked door with a number on it, and a price
  // one course covers makes the other nineteen pointless. Both ends are
  // asserted so a retuned ladder cannot quietly break the economy.
  const prices = CHARACTERS.filter((c) => c.price > 0).map((c) => c.price);
  assert.ok(prices.length > 0, "something has to be for sale");
  for (const price of prices) {
    assert.ok(price > MAX_PER_COURSE, `${price} is one course's payout`);
    // Twenty shipped courses at their top tier is the ceiling on the ladder.
    assert.ok(price < MAX_PER_COURSE * 20, `${price} is more than the game pays`);
  }
});

test("the default character costs nothing and is the only free one", () => {
  const free = CHARACTERS.filter((c) => c.price === 0);
  assert.deepEqual(
    free.map((c) => c.id),
    ["courier"],
    "a second free character would be a shop entry nobody ever buys"
  );
});
