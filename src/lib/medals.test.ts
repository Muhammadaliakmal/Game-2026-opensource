import { test } from "node:test";
import assert from "node:assert/strict";
import { BUILT_IN_WORLDS } from "./built-in-worlds";
import {
  AUTHOR_MS,
  authorFromFloor,
  betterMedal,
  medalFor,
  medalTimes,
  MEDALS,
  nextMedal,
  routeFloorMs,
} from "./medals";

test("every ladder map has an Author time, and it matches its geometry", () => {
  // The table in medals.ts is a cache of a Dijkstra over each course. This is
  // its invalidator: edit a course and this fails with the number to write.
  for (const w of BUILT_IN_WORLDS.filter((x) => x.tier)) {
    const floor = routeFloorMs(w.build("u"));
    assert.ok(floor !== null, `${w.slug}: no route to its own goal`);
    assert.equal(
      AUTHOR_MS[w.slug],
      authorFromFloor(floor!),
      `${w.slug}: the course changed — write this Author time into AUTHOR_MS`
    );
  }
});

test("a sandbox world has no medals", () => {
  for (const w of BUILT_IN_WORLDS.filter((x) => !x.tier)) {
    assert.equal(medalTimes(w.slug), null);
    assert.equal(medalFor(w.slug, 1000), null);
  }
  // And neither does a player's own world, whose id is a uuid.
  assert.equal(medalTimes("6f1b8f2e-0000-4000-8000-000000000000"), null);
});

test("the ladder gets harder in the right direction", () => {
  const times = medalTimes("parkour")!;
  assert.deepEqual(times.map((t) => t.medal), [...MEDALS]);
  for (let i = 1; i < times.length; i++) {
    assert.ok(times[i].ms > times[i - 1].ms, "each medal must be slower");
  }
});

test("a time earns the best medal it clears, and a slow finish earns none", () => {
  const [author, gold, silver, bronze] = medalTimes("parkour")!;
  assert.equal(medalFor("parkour", author.ms), "author");
  assert.equal(medalFor("parkour", author.ms + 1), "gold");
  assert.equal(medalFor("parkour", gold.ms), "gold");
  assert.equal(medalFor("parkour", silver.ms), "silver");
  assert.equal(medalFor("parkour", bronze.ms), "bronze");
  assert.equal(medalFor("parkour", bronze.ms + 1), null, "finishing is not a medal");
});

test("the target on screen is the next one up, not the top one", () => {
  assert.equal(nextMedal("parkour", null)!.medal, "bronze");
  assert.equal(nextMedal("parkour", "bronze")!.medal, "silver");
  assert.equal(nextMedal("parkour", "gold")!.medal, "author");
  assert.equal(nextMedal("parkour", "author"), null, "nothing left to chase");
});

test("medals compare, and no medal is worse than any medal", () => {
  assert.ok(betterMedal("gold", "silver"));
  assert.ok(betterMedal("bronze", null));
  assert.ok(!betterMedal(null, "bronze"));
  assert.ok(!betterMedal("silver", "gold"));
});
