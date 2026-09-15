import { test } from "node:test";
import assert from "node:assert/strict";
import { BUILT_IN_WORLDS } from "./built-in-worlds";
import {
  AUTHOR_MS,
  authorFromFloor,
  authorMsFor,
  betterMedal,
  floorFromAuthor,
  medalFor,
  medalTimes,
  medalTimesFor,
  MEDALS,
  MIN_RUN_FRACTION,
  minRunMs,
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

test("a course somebody built gets the same ladder, off its own geometry", () => {
  // The acceptance test for the whole of 7b. A world row is a uuid with no
  // entry in AUTHOR_MS; its Author time comes from the floor the server
  // solved and stored (see lib/course-floor.ts). Give it the floor of a
  // shipped course and it must produce that course's ladder exactly.
  const id = "6f1b8f2e-0000-4000-8000-000000000000";
  const floor = routeFloorMs(BUILT_IN_WORLDS.find((w) => w.slug === "parkour")!.build("u"));

  assert.equal(authorMsFor(id, floor!), AUTHOR_MS.parkour);
  assert.deepEqual(medalTimesFor(authorMsFor(id, floor!)!), medalTimes("parkour"));

  // No floor stored is not a course — a sandbox world, or a goal nothing can
  // reach — and gets no medals rather than an invented ladder.
  assert.equal(authorMsFor(id, null), null);
  assert.equal(authorMsFor(id, undefined), null);
});

test("a shipped course ignores any floor handed to it", () => {
  // AUTHOR_MS is the measurement of record for the twenty that ship, and the
  // table wins over anything a row happens to carry — otherwise a remix's
  // stored floor could quietly retune the ladder people are ranked on.
  assert.equal(authorMsFor("parkour", 1), AUTHOR_MS.parkour);
  assert.equal(authorMsFor("parkour", null), AUTHOR_MS.parkour);
});

test("both kinds of course are checked against the same floor, to a millisecond", () => {
  // `POST /runs` gets its floor two ways: derived back out of `AUTHOR_MS` for
  // a shipped slug, and read off the row for a course somebody built. Those
  // are different arithmetic — `authorFromFloor` rounds, `floorFromAuthor`
  // divides and floors — so they are inverses only to within the rounding.
  //
  // The direction is what matters, and it is asserted rather than assumed: the
  // derived floor is never ABOVE the solved one, so the shipped guard can only
  // ever be a millisecond more generous, never a millisecond stricter. A guard
  // that rejected a run somebody actually did would be the bad failure here.
  for (const w of BUILT_IN_WORLDS.filter((x) => x.tier)) {
    const solved = routeFloorMs(w.build("u"))!;
    const derived = floorFromAuthor(AUTHOR_MS[w.slug]);
    assert.ok(
      derived <= solved && solved - derived <= 1,
      `${w.slug}: derived floor ${derived} vs solved ${solved}`
    );
    assert.equal(authorFromFloor(solved), AUTHOR_MS[w.slug], w.slug);
  }
});

test("the submission guard sits well under the route floor, not on it", () => {
  // The floor is a model of the course, and the board filled with genuine
  // runs within a percent of it (`steps` 29,382 against a floor of 29,200).
  // A guard AT the floor therefore refused the fastest real runs, and the
  // board stopped moving for exactly the players who had got good. The
  // guard's job is a `fetch` with a zero in it; this pins that it does that
  // job and nothing more.
  assert.ok(MIN_RUN_FRACTION < 1, "the guard must leave room under the floor");
  assert.ok(MIN_RUN_FRACTION > 0, "the guard must still refuse a zero");

  for (const w of BUILT_IN_WORLDS.filter((x) => x.tier)) {
    const floor = floorFromAuthor(AUTHOR_MS[w.slug]);
    const min = minRunMs(floor)!;
    // A run that beats the model by a tenth is a run somebody did.
    assert.ok(Math.round(floor * 0.9) >= min, `${w.slug}: 90% of floor refused`);
    // A zero, or anything near it, is not.
    assert.ok(min > 0, `${w.slug}: a zero would be accepted`);
    assert.ok(1 < min, `${w.slug}: one millisecond would be accepted`);
  }

  // A world with no floor has no guard, and that is the same answer for both
  // ways a floor can be missing.
  assert.equal(minRunMs(null), null);
  assert.equal(minRunMs(undefined), null);
});
