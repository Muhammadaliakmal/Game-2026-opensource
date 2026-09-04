import { test } from "node:test";
import assert from "node:assert/strict";
import { FACING } from "./course-kit";
import { yawTowards } from "@/components/play/camera-rig";
import { TIERED_COURSES } from "./courses";
import { parkourWorldDoc } from "./parkour";
import type { WorldDoc } from "./worlddoc";

/**
 * Which way a stored yaw actually points.
 *
 * ── Why this test exists ─────────────────────────────────────────────────
 *
 * `FACING` shipped with every value exactly half a turn wrong. It was written
 * against WorldDoc's own comment, which said the player's forward is
 * `(sin yaw, cos yaw)` — but the look rig places the eye at `+(sin, cos)` from
 * the character and then looks BACK down that offset, so forward is the
 * negation of it. Nothing caught it: the schema is happy with any number, the
 * course tests only ask whether a surface can be reached, and on screen the
 * symptom was a checkpoint that spun you round to face the climb you had just
 * finished, which reads as a camera quirk rather than as a wrong constant.
 *
 * The rig owns the convention, so `yawTowards` is the authority here and
 * `FACING` is checked against it rather than against four numbers typed twice.
 * `course-kit.ts` cannot import the rig — it is pulled in by the headless room
 * server, which must not drag three.js behind it — so the duplication is
 * deliberate and this is what stops it drifting.
 */

/** Unit direction a runner holding this yaw is looking along. */
function forward(yaw: number): [number, number] {
  return [-Math.sin(yaw), -Math.cos(yaw)];
}

const near = (a: number, b: number) => Math.abs(a - b) < 1e-9;

test("FACING matches the look rig's own convention", () => {
  assert.ok(near(FACING.north, yawTowards(0, 1)));
  assert.ok(near(FACING.east, yawTowards(1, 0)));
  assert.ok(near(FACING.south, yawTowards(0, -1)));
  assert.ok(near(FACING.west, yawTowards(-1, 0)));
});

test("each FACING looks along the axis it is named for", () => {
  const cases: [number, [number, number]][] = [
    [FACING.north, [0, 1]],
    [FACING.east, [1, 0]],
    [FACING.south, [0, -1]],
    [FACING.west, [-1, 0]],
  ];
  for (const [yaw, [dx, dz]] of cases) {
    const [fx, fz] = forward(yaw);
    assert.ok(near(fx, dx), `x: ${fx} != ${dx}`);
    assert.ok(near(fz, dz), `z: ${fz} != ${dz}`);
  }
});

/**
 * The check that would have caught the original bug on its own.
 *
 * A course's checkpoints are strung along it in order, so the direction from
 * one to the next is where the runner was going when they banked it. Resuming
 * must not point them the other way — that is the entire reason a checkpoint
 * carries a yaw at all. A right angle is allowed (courses turn corners); more
 * than that is the run starting backwards.
 */
function docs(): WorldDoc[] {
  return [
    parkourWorldDoc("parkour", "test"),
    ...TIERED_COURSES.map((c) => c.build("test")),
  ];
}

test("no checkpoint resumes facing back down the course", () => {
  for (const doc of docs()) {
    const cps = doc.checkpoints ?? [];
    assert.ok(cps.length > 0, `${doc.name} has no checkpoints`);

    for (let i = 0; i < cps.length; i++) {
      // The last one is measured against the goal, which is where the run is
      // still going after the final resume point.
      const next = cps[i + 1]?.pos ?? doc.goal;
      assert.ok(next, `${doc.name} has no goal to aim the last checkpoint at`);
      const dx = next[0] - cps[i].pos[0];
      const dz = next[2] - cps[i].pos[2];
      if (Math.hypot(dx, dz) < 1e-6) continue;

      const [fx, fz] = forward(cps[i].yaw);
      const len = Math.hypot(dx, dz);
      const alignment = (fx * dx + fz * dz) / len;
      assert.ok(
        alignment > 0,
        `${doc.name} checkpoint ${i} faces away from what comes next ` +
          `(alignment ${alignment.toFixed(2)})`
      );
    }
  }
});

test("a course's spawn faces the course", () => {
  for (const doc of docs()) {
    assert.equal(
      typeof doc.spawnYaw,
      "number",
      `${doc.name} states no spawn facing`
    );
    const first = doc.checkpoints?.[0]?.pos ?? doc.goal;
    assert.ok(first, `${doc.name} has nothing ahead of its spawn`);
    const dx = first[0] - doc.spawn[0];
    const dz = first[2] - doc.spawn[2];
    const [fx, fz] = forward(doc.spawnYaw!);
    const alignment = (fx * dx + fz * dz) / Math.hypot(dx, dz);
    assert.ok(
      alignment > 0,
      `${doc.name} spawns facing away from its own course ` +
        `(alignment ${alignment.toFixed(2)})`
    );
  }
});
