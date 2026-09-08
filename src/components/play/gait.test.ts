import test from "node:test";
import assert from "node:assert/strict";
import * as THREE from "three";
import { Gait, type AvatarMotion } from "./gait";
import { FEEL } from "@/lib/feel";

/**
 * The walk cycle is pure maths on three numbers, so it is testable without a
 * renderer — and worth testing, because every one of its failures is a thing
 * somebody describes as "the character looks weird" rather than as a bug.
 *
 * `advance` takes an Object3D only to measure travel and facing off, so a bare
 * one standing at the origin is a character running on the spot: enough for
 * everything except the stride-direction test, which moves it.
 */

const STANDING: AvatarMotion = { moveSpeed: 0, isOnGround: true, verticalSpeed: 0 };
const RUNNING: AvatarMotion = {
  moveSpeed: FEEL.runSpeed,
  isOnGround: true,
  verticalSpeed: 0,
};

const DT = 1 / 60;

/** Run the cycle for a while and hand back every pose it passed through. */
function frames(motion: AvatarMotion, count: number, body = new THREE.Object3D()) {
  const gait = new Gait();
  const out: (typeof gait.pose)[] = [];
  for (let i = 0; i < count; i++) {
    gait.advance(body, motion, DT, i * DT);
    // The pose is one mutated object, so it has to be copied per frame or this
    // is `count` references to the last frame.
    out.push({ ...gait.pose });
  }
  return out;
}

test("standing still does not cycle the legs", () => {
  const poses = frames(STANDING, 240);
  for (const p of poses) {
    // `Math.abs` because the swing is negated for the right leg and node's
    // strict equality is Object.is, under which -0 is not 0.
    assert.equal(Math.abs(p.legL), 0, "a standing character must not take steps");
    assert.equal(Math.abs(p.legR), 0);
    assert.equal(p.gait, 0);
  }
});

test("standing still is not frozen", () => {
  // The shop shows a character with no speed at all. Idle motion is the only
  // thing that stops that reading as a photograph of a toy, and it is easy to
  // delete by accident because nothing else depends on it.
  const poses = frames(STANDING, 240);
  const moved = (pick: (p: (typeof poses)[number]) => number) => {
    const values = poses.map(pick);
    return Math.max(...values) - Math.min(...values);
  };
  assert.ok(moved((p) => p.bob) > 1e-3, "a standing character should breathe");
  assert.ok(moved((p) => p.armL) > 1e-3, "a standing character should sway");
  assert.ok(moved((p) => p.roll) > 1e-4, "a standing character should shift weight");
  // But not much: idle is a pose, not an animation.
  assert.ok(moved((p) => p.armL) < 0.2, "the idle sway must stay a sway");
});

test("knees only ever bend one way", () => {
  // The invariant the whole flex-versus-swing split in GaitPose exists for. A
  // knee that goes negative is a knee bending backwards, and it is far easier
  // to introduce here — with a stray sign — than it is to see in a renderer
  // that may itself be mirroring the value.
  for (const motion of [STANDING, RUNNING]) {
    for (const p of frames(motion, 400)) {
      assert.ok(p.kneeL >= 0, `kneeL went to ${p.kneeL}`);
      assert.ok(p.kneeR >= 0, `kneeR went to ${p.kneeR}`);
      assert.ok(p.elbowL >= 0, `elbowL went to ${p.elbowL}`);
      assert.ok(p.elbowR >= 0, `elbowR went to ${p.elbowR}`);
    }
  }
});

test("a running character actually folds its knees", () => {
  const poses = frames(RUNNING, 400);
  const peak = Math.max(...poses.map((p) => p.kneeL));
  assert.ok(peak > 0.7, `knees barely moved (peak ${peak.toFixed(2)}) — this is the skating look`);
  // And straightens them again: a knee held bent is a crouch, not a stride.
  const low = Math.min(...poses.map((p) => p.kneeL));
  assert.ok(low < 0.2, `knees never came back out (min ${low.toFixed(2)})`);
});

test("the knee folds while the leg is coming through, not while it is planted", () => {
  // The phase relationship is the difference between a run and a limp, and it
  // is a single constant (KNEE_LAG) away from being wrong. At the frame the
  // left knee is most folded, that leg must be behind the body and on its way
  // forward — which is exactly where a real one folds to clear the ground.
  const poses = frames(RUNNING, 400);
  let best = 0;
  for (let i = 1; i < poses.length; i++) {
    if (poses[i].kneeL > poses[best].kneeL) best = i;
  }
  assert.ok(poses[best].legL < 0, "the knee should peak while that leg is behind");
  assert.ok(
    poses[best].legL > poses[best - 1].legL,
    "and while it is swinging forwards, not still travelling back"
  );
});

test("leaving the ground tucks the knees rather than the hips", () => {
  const gait = new Gait();
  const body = new THREE.Object3D();
  for (let i = 0; i < 60; i++) gait.advance(body, RUNNING, DT, i * DT);
  const rising: AvatarMotion = { moveSpeed: 4, isOnGround: false, verticalSpeed: 6 };
  for (let i = 0; i < 30; i++) gait.advance(body, rising, DT, (60 + i) * DT);
  assert.ok(gait.pose.kneeL > 1, `airborne knee only reached ${gait.pose.kneeL.toFixed(2)}`);
});

test("a landing is absorbed by the knees", () => {
  const gait = new Gait();
  const body = new THREE.Object3D();
  // Airborne and falling hard, then ground under the feet on the next frame.
  gait.advance(body, { moveSpeed: 0, isOnGround: false, verticalSpeed: -FEEL.hardLandVel }, DT, 0);
  gait.advance(body, { moveSpeed: 0, isOnGround: true, verticalSpeed: -FEEL.hardLandVel }, DT, DT);
  assert.ok(gait.pose.squash > 0.9, "a hard landing should squash");
  assert.ok(gait.pose.kneeL > 0.4, "and the knees should take it");
});

test("backing up cycles the legs backwards", () => {
  // Pinned because it is the one part of the cycle that depends on measured
  // travel rather than on the speed handed in, and because the failure — a
  // moonwalking character under shift lock-on — is what put it here.
  const body = new THREE.Object3D();
  const gait = new Gait();
  const back = { moveSpeed: 4, isOnGround: true, verticalSpeed: 0 };
  // The body faces -Z (its own forward) and travels +Z: reversing.
  for (let i = 0; i < 20; i++) {
    body.position.z += 4 * DT;
    body.updateMatrixWorld(true);
    gait.advance(body, back, DT, i * DT);
  }
  const reversing = gait.pose.legL;

  const body2 = new THREE.Object3D();
  const gait2 = new Gait();
  for (let i = 0; i < 20; i++) {
    body2.position.z -= 4 * DT;
    body2.updateMatrixWorld(true);
    gait2.advance(body2, back, DT, i * DT);
  }
  assert.ok(
    Math.sign(reversing) !== Math.sign(gait2.pose.legL),
    "walking forwards and backing up must not cycle the same way"
  );
});
