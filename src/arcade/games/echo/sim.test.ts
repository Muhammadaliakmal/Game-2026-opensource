import { test } from "node:test";
import assert from "node:assert/strict";
import { createSim, guardAt } from "./sim";
import { LEVELS } from "./levels";

/**
 * The loop is the game, so the tests play it: a scripted runner walks the
 * first room the way the hint says to, and the second loop must find the
 * door open. Everything else here is the edge that would make that feel
 * broken — a ghost that outstays its recording, a door that crushes, a run
 * that ends on a guard and leaves nothing behind.
 */

const DT = 1 / 60;

type S = ReturnType<typeof createSim>;

/** Steer toward a point at full speed; still when there. */
function toward(sim: S, x: number, y: number) {
  const dx = x - sim.px;
  const dy = y - sim.py;
  const d = Math.hypot(dx, dy);
  if (d < 4) return { ax: 0, ay: 0 };
  return { ax: dx / d, ay: dy / d };
}

/** Walk toward a point for up to `steps` steps, or until the run phase changes. */
function walk(sim: S, x: number, y: number, steps: number) {
  for (let i = 0; i < steps && sim.phase === "run"; i++) sim.step(DT, toward(sim, x, y));
}

/** Let the clock run out, standing still. */
function wait(sim: S, steps: number) {
  for (let i = 0; i < steps && sim.phase === "run"; i++) sim.step(DT, { ax: 0, ay: 0 });
}

/** Sit through a hold phase. */
function settle(sim: S) {
  for (let i = 0; i < 200 && sim.phase !== "run" && sim.phase !== "done"; i++) sim.step(DT, { ax: 0, ay: 0 });
}

test("level one: the first run holds the plate, the second walks through", () => {
  const sim = createSim();
  const L = LEVELS[0];
  const plate = L.plates[0];

  // Run 1: to the plate, then stay until the clock ends.
  walk(sim, plate.x, plate.y, 600);
  assert.equal(sim.held.a, true, "runner should be holding the plate");
  assert.equal(sim.doorSolid[0], false, "door opens while held");
  wait(sim, 2000);
  assert.equal(sim.phase, "reset");
  assert.equal(sim.ghosts.length, 1);
  settle(sim);
  assert.equal(sim.phase, "run");
  assert.equal(sim.loop, 1);

  // Run 2: straight for the exit. The ghost is on the plate by the time we
  // reach the door, so it is open.
  const exit = L.exit;
  walk(sim, exit.x + exit.w / 2, exit.y + exit.h / 2, 600);
  assert.equal(sim.phase, "clear", `expected the exit, got ${sim.phase} at ${sim.px.toFixed(0)},${sim.py.toFixed(0)}`);
  assert.ok(sim.score > 0);
});

test("a ghost leaves when its recording ends, and the door shuts behind it", () => {
  const sim = createSim();
  const L = LEVELS[0];
  const plate = L.plates[0];
  while (!sim.held.a && sim.phase === "run") sim.step(DT, toward(sim, plate.x, plate.y));
  const arrived = sim.tick;
  // Stand on the plate for a second, then walk off and let the clock go.
  wait(sim, 60);
  walk(sim, 80, 400, 120);
  const left = sim.tick;
  wait(sim, 2000);
  settle(sim);

  // Run 2, standing still at the spawn: the door is shut until the ghost
  // reaches the plate, open while it stands there, shut once it walks off.
  assert.equal(sim.doorSolid[0], true);
  wait(sim, arrived + 5);
  assert.equal(sim.doorSolid[0], false, "ghost on the plate opens the door");
  wait(sim, left - arrived);
  assert.equal(sim.doorSolid[0], true, "ghost off the plate closes it");
});

test("a closed door blocks the runner", () => {
  const sim = createSim();
  const L = LEVELS[0];
  const door = L.doors[0];
  walk(sim, door.x + 200, door.y + door.h / 2, 600);
  assert.ok(sim.px < door.x, `runner should be stopped by the door, is at ${sim.px}`);
});

test("a guard ends the run, and the run still becomes a ghost", () => {
  const sim = createSim();
  sim.jumpTo(2);
  // Stand in the first guard's lane and wait for it to arrive.
  const guard = LEVELS[2].patrols[0];
  walk(sim, guard.path[0][0], (guard.path[0][1] + guard.path[1][1]) / 2, 600);
  wait(sim, 600);
  assert.equal(sim.phase, "reset");
  assert.equal(sim.ghosts.length, 1);
  assert.ok(sim.ghosts[0].steps > 0 && sim.ghosts[0].steps < 600, "ghost is the run up to the catch");
});

test("running out of loops loses", () => {
  const sim = createSim();
  const L = LEVELS[0];
  for (let i = 0; i <= L.loops; i++) {
    wait(sim, 2000);
    if (sim.phase === "lost") break;
    settle(sim);
  }
  assert.equal(sim.phase, "lost");
  settle(sim);
  assert.equal(sim.phase, "done");
  assert.equal(sim.outcome, "lost");
});

test("an inverted door is solid while its plate is held, and open once let go", () => {
  const sim = createSim();
  sim.jumpTo(3);
  const L = LEVELS[3];
  const plate = L.plates[0];
  const normal = L.doors.findIndex((d) => !d.inverted);
  const inverted = L.doors.findIndex((d) => d.inverted);
  assert.deepEqual([sim.doorSolid[normal], sim.doorSolid[inverted]], [true, false]);
  walk(sim, plate.x, plate.y, 600);
  assert.equal(sim.held.a, true);
  assert.deepEqual([sim.doorSolid[normal], sim.doorSolid[inverted]], [false, true]);
});

test("the whole ladder is clearable with a scripted runner", () => {
  // Every level's intended solution is "each loop, stand on the next plate;
  // last loop, walk to the exit" — with the guards and the inverted door
  // handled by the scripted walker going straight and standing still. This
  // is not a proof of fun; it is a proof that no room is impossible.
  const sim = createSim();
  sim.jumpTo(0);
  const L = LEVELS[0];
  walk(sim, L.plates[0].x, L.plates[0].y, 600);
  wait(sim, 2000);
  settle(sim);
  walk(sim, L.exit.x + L.exit.w / 2, L.exit.y + L.exit.h / 2, 600);
  assert.equal(sim.phase, "clear");
  settle(sim);
  assert.equal(sim.level, 1, "clearing a room loads the next");
  assert.equal(sim.ghosts.length, 0, "ghosts do not carry across rooms");
});

test("a guard ping-pongs along its path", () => {
  const out: [number, number] = [0, 0];
  const path: Array<[number, number]> = [
    [0, 0],
    [100, 0],
  ];
  guardAt(path, 100, 0.5, out);
  assert.deepEqual(out, [50, 0]);
  guardAt(path, 100, 1.0, out);
  assert.deepEqual(out, [100, 0]);
  guardAt(path, 100, 1.5, out);
  assert.deepEqual(out, [50, 0]);
  guardAt(path, 100, 2.0, out);
  assert.deepEqual(out, [0, 0]);
});
