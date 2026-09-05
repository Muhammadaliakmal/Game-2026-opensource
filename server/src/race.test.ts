import { test } from "node:test";
import assert from "node:assert/strict";
import { Race, RACE } from "./race.ts";
import { SECTORS, START_LINE_Z, lapProgress } from "@/lib/race-track";

/**
 * Lap counting is the part of a race that is wrong silently. A lap that does
 * not count looks like lag; a lap that counts twice looks like someone
 * cheating. Neither throws.
 */

/** A world position at a given fraction round the lap, on the centreline. */
function atProgress(u: number): { x: number; z: number } {
  // lapProgress is atan2(x, z) normalised, so inverting it is a point on a
  // circle at that angle — radius does not matter to the sector test.
  const theta = u * Math.PI * 2;
  const r = START_LINE_Z;
  return { x: Math.sin(theta) * r, z: Math.cos(theta) * r };
}

/** Drive a rider once round the lap, hitting every sector in order. */
function driveLap(race: Race, id: string, now = 0) {
  for (let i = 0; i < SECTORS; i++) {
    // Land mid-sector, so rounding can never put us in a neighbour.
    const p = atProgress((i + 0.5) / SECTORS);
    race.move(id, { x: p.x, y: 1, z: p.z, yaw: 0 }, now);
  }
}

function startedRace(riders = 2) {
  const race = new Race();
  for (let i = 0; i < riders; i++) race.join(`r${i}`, `Rider ${i}`, 0);
  race.tick(RACE.countdownMs);
  return race;
}

test("a race arms itself once a second rider arrives", () => {
  const race = new Race();
  race.join("a", "A", 0);
  assert.equal(race.phase, "waiting", "one rider is not a race");

  race.join("b", "B", 0);
  assert.equal(race.phase, "countdown");
  assert.equal(race.startsAt, RACE.countdownMs);

  // And the lights actually go green.
  assert.equal(race.tick(RACE.countdownMs - 1), false);
  assert.equal(race.tick(RACE.countdownMs), true);
  assert.equal(race.phase, "racing");
});

test("a lone rider can start a practice run by asking", () => {
  const race = new Race();
  race.join("a", "A", 0);
  assert.equal(race.arm(0), true);
  assert.equal(race.phase, "countdown");
  // Arming twice must not restart the countdown under everyone.
  assert.equal(race.arm(500), false);
  assert.equal(race.startsAt, RACE.countdownMs);
});

test("riders start on the grid, behind the line, in their own slots", () => {
  const race = new Race();
  const a = race.join("a", "A", 0)!;
  const b = race.join("b", "B", 0)!;
  assert.notDeepEqual([a.x, a.z], [b.x, b.z], "two riders cannot share a slot");
  for (const r of [a, b]) {
    assert.ok(r.x < 0, "the grid is behind the line, which is -X");
    assert.equal(r.lap, 0);
    assert.equal(r.sector, SECTORS - 1, "the grid is in the last sector");
  }
});

test("the grid is full at four", () => {
  const race = new Race();
  for (let i = 0; i < RACE.maxRiders; i++) {
    assert.ok(race.join(`r${i}`, "R", 0), `rider ${i} should fit`);
  }
  assert.equal(race.join("extra", "Extra", 0), null);
});

test("crossing the line starts lap one rather than completing one", () => {
  const race = startedRace();
  // First crossing: into sector 0.
  const p = atProgress(0.5 / SECTORS);
  race.move("r0", { x: p.x, y: 1, z: p.z, yaw: 0 }, 0);
  assert.equal(race.riders.get("r0")!.lap, 1, "on lap 1, not one lap done");
  assert.equal(race.riders.get("r0")!.place, 0, "nobody has finished");
});

test("three laps finishes the race", () => {
  const race = startedRace();
  for (let lap = 0; lap < RACE.laps; lap++) driveLap(race, "r0");
  assert.equal(race.riders.get("r0")!.lap, RACE.laps);
  assert.equal(race.riders.get("r0")!.place, 0, "still one crossing short");

  // The crossing that completes the third lap.
  const p = atProgress(0.5 / SECTORS);
  const res = race.move("r0", { x: p.x, y: 1, z: p.z, yaw: 0 }, 5000);
  assert.equal(res.finished, true);
  const r = race.riders.get("r0")!;
  assert.equal(r.place, 1);
  assert.equal(r.lap, RACE.laps, "the counter must not read 4 of 3");
  assert.equal(r.timeMs, 5000 - RACE.countdownMs);
});

test("nudging back and forth over the line counts nothing", () => {
  const race = startedRace();
  const before = atProgress(1 - 0.5 / SECTORS); // last sector, behind the line
  const after = atProgress(0.5 / SECTORS); // first sector, past it

  race.move("r0", { x: after.x, y: 1, z: after.z, yaw: 0 }, 0);
  assert.equal(race.riders.get("r0")!.lap, 1);

  // Reversing back over and forward again must not tick the lap.
  for (let i = 0; i < 5; i++) {
    race.move("r0", { x: before.x, y: 1, z: before.z, yaw: 0 }, 0);
    race.move("r0", { x: after.x, y: 1, z: after.z, yaw: 0 }, 0);
  }
  assert.equal(race.riders.get("r0")!.lap, 1, "still lap 1");
});

test("cutting the course does not advance a lap", () => {
  const race = startedRace();
  // Straight from the grid to two thirds round, skipping the sectors between.
  const cut = atProgress(0.66);
  for (let i = 0; i < 10; i++) {
    race.move("r0", { x: cut.x, y: 1, z: cut.z, yaw: 0 }, 0);
  }
  assert.equal(race.riders.get("r0")!.lap, 0, "no lap for a shortcut");

  // Rejoining where they left off still works — they are not stranded forever.
  driveLap(race, "r0");
  assert.equal(race.riders.get("r0")!.lap, 1);
});

test("laps do not count before the lights or after finishing", () => {
  const race = new Race();
  race.join("a", "A", 0);
  race.join("b", "B", 0);
  assert.equal(race.phase, "countdown");

  driveLap(race, "a");
  assert.equal(race.riders.get("a")!.lap, 0, "no jumping the start");

  race.tick(RACE.countdownMs);
  for (let lap = 0; lap <= RACE.laps; lap++) driveLap(race, "a");
  const a = race.riders.get("a")!;
  assert.equal(a.place, 1);

  const lapAtFinish = a.lap;
  driveLap(race, "a");
  assert.equal(a.lap, lapAtFinish, "a finisher cannot keep scoring laps");
});

test("places are handed out in crossing order", () => {
  const race = startedRace(3);
  for (let lap = 0; lap <= RACE.laps; lap++) driveLap(race, "r1");
  for (let lap = 0; lap <= RACE.laps; lap++) driveLap(race, "r2");
  assert.equal(race.riders.get("r1")!.place, 1);
  assert.equal(race.riders.get("r2")!.place, 2);
  assert.equal(race.riders.get("r0")!.place, 0);
  assert.equal(race.phase, "racing", "one rider is still out there");

  // Everybody home ends it.
  for (let lap = 0; lap <= RACE.laps; lap++) driveLap(race, "r0");
  assert.equal(race.riders.get("r0")!.place, 3);
  assert.equal(race.phase, "finished");
});

test("the race ends on its own if a straggler never finishes", () => {
  const race = startedRace();
  for (let lap = 0; lap <= RACE.laps; lap++) driveLap(race, "r0", 1000);
  assert.equal(race.phase, "racing");

  assert.equal(race.tick(1000 + RACE.finishGraceMs - 1), false);
  assert.equal(race.tick(1000 + RACE.finishGraceMs), true);
  assert.equal(race.phase, "finished");
  assert.equal(race.riders.get("r1")!.place, 2, "the straggler is classified");
});

test("standings rank by distance round the track", () => {
  const race = startedRace(3);
  // r0 furthest, then r2, then r1.
  driveLap(race, "r0");
  driveLap(race, "r0");
  driveLap(race, "r2");
  const half = atProgress(0.5);
  race.move("r1", { x: half.x, y: 1, z: half.z, yaw: 0 }, 0);

  assert.deepEqual(
    race.standings().map((r) => r.id),
    ["r0", "r2", "r1"]
  );
});

test("a rematch puts everyone back on the grid", () => {
  const race = startedRace();
  for (let lap = 0; lap <= RACE.laps; lap++) driveLap(race, "r0");

  race.rematch(0);
  assert.equal(race.phase, "countdown", "two riders re-arm immediately");
  for (const r of race.riders.values()) {
    assert.equal(r.lap, 0);
    assert.equal(r.place, 0);
    assert.equal(r.sector, SECTORS - 1);
    assert.ok(r.x < 0);
  }
});

test("an empty race falls back to waiting", () => {
  const race = startedRace();
  race.leave("r0");
  race.leave("r1");
  assert.equal(race.phase, "waiting");
  assert.equal(race.riders.size, 0);
});

test("the grid sits where lapProgress says it should", () => {
  // The whole sector scheme rests on the grid being behind the line. If a slot
  // ever moved past it, riders would start a lap up and nothing would say so.
  const race = new Race();
  const r = race.join("a", "A", 0)!;
  const u = lapProgress(r.x, r.z);
  assert.ok(u > (SECTORS - 1) / SECTORS, `grid at ${u} should be in the last sector`);
});

/**
 * Grid size.
 *
 * The behaviour these pin is the one somebody asked for out loud: you say the
 * race is for four, you send the code to three friends, and the lights do not
 * go the moment the first of them arrives.
 */

test("a grid set to four waits for four riders, not two", () => {
  const race = new Race();
  race.setTarget(4, 0);

  race.join("a", "A", 0);
  race.join("b", "B", 0);
  assert.equal(race.phase, "waiting", "two riders must not start a four-up");

  race.join("c", "C", 0);
  assert.equal(race.phase, "waiting");

  race.join("d", "D", 0);
  assert.equal(race.phase, "countdown", "the fourth rider fills the grid");
});

test("a grid with no size stated still arms at two", () => {
  // The default has to be the old behaviour, or every room created before this
  // existed changes meaning.
  const race = new Race();
  assert.equal(race.target, RACE.minAutoStart);
  race.join("a", "A", 0);
  race.join("b", "B", 0);
  assert.equal(race.phase, "countdown");
});

test("shrinking the grid to what has already arrived starts the race", () => {
  const race = new Race();
  race.setTarget(4, 0);
  race.join("a", "A", 0);
  race.join("b", "B", 0);
  assert.equal(race.phase, "waiting");

  // Two people gave up waiting for the other two. They should not have to
  // also find the start button.
  race.setTarget(2, 0);
  assert.equal(race.phase, "countdown");
});

test("a lone rider on a four-up grid can still start alone", () => {
  // The target must never be a lock: a grid that only ever got one rider has
  // to remain a time trial somebody can actually run.
  const race = new Race();
  race.setTarget(4, 0);
  race.join("a", "A", 0);
  assert.equal(race.phase, "waiting");
  assert.equal(race.arm(0), true);
  assert.equal(race.phase, "countdown");
});

test("the grid size cannot be changed once the lights are running", () => {
  const race = new Race();
  race.join("a", "A", 0);
  race.join("b", "B", 0);
  assert.equal(race.phase, "countdown");
  assert.equal(race.setTarget(4, 0), false, "a running race has no grid to size");
  assert.equal(race.target, RACE.minAutoStart);
});

test("the grid size is clamped to a real grid", () => {
  const race = new Race();
  race.setTarget(99, 0);
  assert.equal(race.target, RACE.maxRiders, "never more than the grid holds");
  race.setTarget(0, 0);
  assert.equal(race.target, 1, "a race for nobody is not a race");
});

test("a rematch waits for the grid it was set to", () => {
  const race = new Race();
  race.setTarget(4, 0);
  race.join("a", "A", 0);
  race.join("b", "B", 0);
  race.arm(0);
  race.tick(RACE.countdownMs);
  assert.equal(race.phase, "racing");

  race.rematch(0);
  // Still two riders against a grid of four, so the rematch waits — the same
  // rule the first race followed, rather than a second special case.
  assert.equal(race.phase, "waiting");
});
