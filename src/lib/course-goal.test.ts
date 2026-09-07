import { test } from "node:test";
import assert from "node:assert/strict";
import { BUILT_IN_WORLDS } from "./built-in-worlds";
import { parkourParts, PARKOUR_GOAL, PARKOUR_SPAWN } from "./parkour";
import { parseWorldDoc } from "./worlddoc";
import { formatTime } from "@/components/play/course";

/**
 * The finish of a course is geometry plus a radius, and every way it can be
 * wrong is silent: a goal floating over nothing, a goal you trip over on the
 * way past, or one you can only reach by standing on a single cell you were
 * never told about. None of that shows up in a screenshot of the tower.
 *
 * These mirror the constants in GoalZone. If they move there they must move
 * here, which is the point — the numbers are a contract with the level.
 */
const GOAL_RADIUS = 2.4;
const GOAL_ABOVE = 2.5;
const GOAL_BELOW = 1.6;

/** The same cylinder test GoalZone runs each frame. */
function reached(pos: [number, number, number], goal: readonly number[]) {
  const dx = pos[0] - goal[0];
  const dz = pos[2] - goal[2];
  if (dx * dx + dz * dz > GOAL_RADIUS * GOAL_RADIUS) return false;
  const dy = pos[1] - goal[1];
  return dy <= GOAL_ABOVE && dy >= -GOAL_BELOW;
}

test("courses have a goal and sandboxes do not", () => {
  // A goal on the island or the cottage would invent a failure state for
  // worlds whose whole point is not having one. `tier` is what separates the
  // two — a world in the ladder is a world with a finish, and the test says
  // that rather than naming a slug, so adding another map cannot make this
  // fail for the wrong reason.
  for (const w of BUILT_IN_WORLDS) {
    const doc = w.build("u");
    if (w.tier) {
      assert.ok(doc.goal, `${w.slug} is in the ladder and needs a goal`);
      assert.ok(
        (doc.checkpoints?.length ?? 0) > 0,
        `${w.slug} is in the ladder and needs checkpoints`
      );
    } else {
      assert.equal(doc.goal, undefined, `${w.slug} must not have a goal`);
      assert.equal(doc.checkpoints, undefined, `${w.slug} must not have checkpoints`);
    }
  }
});

test("every course's goal is close enough to its podium to trigger", () => {
  // `reached` is GoalZone's own cylinder. A marker placed two cells above the
  // deck it belongs to passes every other test in the suite — the parts are
  // valid, the deck is solid, the route gets there — and then the run never
  // completes, because the player's body never enters the zone.
  for (const w of BUILT_IN_WORLDS.filter((x) => x.tier)) {
    const doc = w.build("u");
    const solid = new Set(doc.parts.map((p) => `${p[0]},${p[1]},${p[2]}`));
    const gx = Math.floor(doc.goal![0]);
    const gz = Math.floor(doc.goal![2]);

    let surface: number | null = null;
    for (let y = Math.floor(doc.goal![1]); y >= 0; y--) {
      if (solid.has(`${gx},${y},${gz}`)) {
        surface = y + 1;
        break;
      }
    }
    assert.ok(surface !== null, `${w.slug}: nothing under the goal marker`);
    // Standing on that surface: the capsule's centre rides about 0.8 above it.
    assert.ok(
      reached([gx + 0.5, surface! + 0.8, gz + 0.5], doc.goal!),
      `${w.slug}: standing on the finish block does not finish the course`
    );
  }
});

test("the goal survives a WorldDoc round trip", () => {
  // It travels through zod on every load, and through the editor store on
  // every save — dropping it there would silently un-finish any remix.
  const doc = parseWorldDoc(BUILT_IN_WORLDS[0].build("u"));
  assert.deepEqual(doc.goal, PARKOUR_GOAL);

  const noGoal = parseWorldDoc(
    BUILT_IN_WORLDS.find((w) => w.slug === "island")!.build("u")
  );
  assert.equal(noGoal.goal, undefined);
});

test("the goal sits on the finish tower, not in the air", () => {
  const solid = new Set(
    parkourParts().map((p) => `${p[0]},${p[1]},${p[2]}`)
  );
  const cx = Math.floor(PARKOUR_GOAL[0]);
  const cz = Math.floor(PARKOUR_GOAL[2]);

  let ground: number | null = null;
  for (let y = Math.floor(PARKOUR_GOAL[1]); y >= 0; y--) {
    if (solid.has(`${cx},${y},${cz}`)) {
      ground = y;
      break;
    }
  }
  assert.ok(ground !== null, "there must be something to stand on at the goal");
  // The lit marker is the top of the tower at y=9, so its surface is y=10.
  assert.equal(ground, 9);
});

test("standing anywhere on the podium finishes the course", () => {
  // The podium is the 3x3 at y=8, surface y=9, so a player standing on it has
  // its body centre around y=9.8. Every cell of it must count — losing a run
  // to a one-cell hop nobody asked for is the cheapest kind of bad.
  for (let x = 87; x <= 89; x++) {
    for (let z = -1; z <= 1; z++) {
      assert.ok(
        reached([x + 0.5, 9.8, z + 0.5], PARKOUR_GOAL),
        `podium cell ${x},${z} should finish the course`
      );
    }
  }
  // And so must standing on the lit block itself, one higher.
  assert.ok(reached([88.5, 10.8, 0.5], PARKOUR_GOAL), "the marker itself");
});

test("the goal cannot be triggered from the wrong place", () => {
  const cases: [string, [number, number, number]][] = [
    ["the spawn plaza", [PARKOUR_SPAWN[0], PARKOUR_SPAWN[1], PARKOUR_SPAWN[2]]],
    ["the ground under the tower", [88.5, 1, 0.5]],
    ["walking past the base", [88.5, 0.8, 0.5]],
    ["the far side of the course", [40, 6, 0]],
    ["just outside the ring", [88.5 + 3.2, 9.8, 0.5]],
    ["far above the marker", [88.5, 14, 0.5]],
  ];
  for (const [what, pos] of cases) {
    assert.equal(reached(pos, PARKOUR_GOAL), false, `${what} must not finish`);
  }
});

test("times read as times", () => {
  assert.equal(formatTime(0), "0:00.00");
  assert.equal(formatTime(1234), "0:01.23");
  assert.equal(formatTime(61_500), "1:01.50");
  assert.equal(formatTime(600_000), "10:00.00");
  // A negative can only come from a clock going backwards; clamp, don't crash.
  assert.equal(formatTime(-5), "0:00.00");
});
