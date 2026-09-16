import { test } from "node:test";
import assert from "node:assert/strict";
import { MAX_MATCH_REWARD, matchReward } from "./match-reward";
import { DAILY_HARD_CAP } from "./arcade-payout";
import { valueOf } from "./coins";

test("a race pays by place, and a better place pays more", () => {
  const first = matchReward({ mode: "race", place: 1, entrants: 4 });
  const second = matchReward({ mode: "race", place: 2, entrants: 4 });
  const last = matchReward({ mode: "race", place: 4, entrants: 4 });
  assert.ok(first > second && second > last && last > 0);
});

test("a race of one is a time trial: the finish pays, the place does not", () => {
  // Any rider can start the lights alone, so "1st" on an empty grid must not
  // be the best-paid thing in the game.
  const solo = matchReward({ mode: "race", place: 1, entrants: 1 });
  assert.ok(solo > 0, "the laps were still ridden");
  assert.ok(solo < matchReward({ mode: "race", place: 4, entrants: 4 }));
});

test("an unplaced rider is paid nothing", () => {
  assert.equal(matchReward({ mode: "race", place: 0, entrants: 3 }), 0);
  assert.equal(matchReward({ mode: "race", place: 7, entrants: 3 }), 0);
});

test("no single match outpays a Gold on a course, and many fit under the day", () => {
  // A match is a flat payout for a relative result; the course ladder is the
  // game's spine and has to stay the better-paid thing to be good at.
  assert.ok(MAX_MATCH_REWARD < valueOf("gold"));
  // And the day's ceiling — shared with the arcade — bounds any grind.
  assert.ok(MAX_MATCH_REWARD * 10 < DAILY_HARD_CAP);
});
