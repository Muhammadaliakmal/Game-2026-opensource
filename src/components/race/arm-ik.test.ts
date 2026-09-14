import test from "node:test";
import assert from "node:assert/strict";
import * as THREE from "three";
import { handPosition, solveArm } from "./arm-ik";

/**
 * The solver, checked the only way a geometric claim can be: by running the
 * chain forward and looking at where the hand came out.
 *
 * `character-rig.test.ts` makes the same argument at more length. The part
 * worth repeating is that every bug this replaces type-checked perfectly.
 */

const UPPER = 0.28;
const FORE = 0.27;
const POLE = new THREE.Vector3(0, -1, 0.35).normalize();

/** Solve, then run it forward and report where the hand landed. */
function reach(shoulder: THREE.Vector3, target: THREE.Vector3) {
  const upper = new THREE.Object3D();
  const fore = new THREE.Object3D();
  upper.add(fore);
  solveArm(upper, fore, shoulder, target, UPPER, FORE, POLE);
  return handPosition(shoulder, upper.quaternion, fore.quaternion, UPPER, FORE);
}

test("the hand lands on the target", () => {
  const shoulder = new THREE.Vector3(0.17, 0.15, 0.02);
  // A spread of reachable targets: forward, down, up, and off to the side.
  const targets = [
    new THREE.Vector3(0.17, -0.11, 0.42),
    new THREE.Vector3(0.17, -0.2, 0.3),
    new THREE.Vector3(0.2, 0.05, 0.45),
    new THREE.Vector3(0.1, -0.3, 0.2),
    new THREE.Vector3(0.25, -0.05, 0.35),
  ];
  for (const t of targets) {
    const hand = reach(shoulder, t);
    assert.ok(
      hand.distanceTo(t) < 1e-6,
      `hand at ${hand.toArray().map((n) => n.toFixed(4))} wanted ${t.toArray()}`
    );
  }
});

test("a target out of reach straightens the arm instead of returning NaN", () => {
  const shoulder = new THREE.Vector3(0, 0, 0);
  const far = new THREE.Vector3(0, 0, 10);
  const hand = reach(shoulder, far);
  assert.ok(Number.isFinite(hand.x + hand.y + hand.z), "NaN in the solution");
  // Straight arm: the hand is exactly the two bones away, pointing at it.
  assert.ok(Math.abs(hand.length() - (UPPER + FORE)) < 1e-6, "arm is not straight");
  assert.ok(hand.z > 0.5, "the straight arm points at the target");
});

test("a target inside the fold does not blow up either", () => {
  const shoulder = new THREE.Vector3(0, 0, 0);
  // Closer than the bones can fold to: |UPPER - FORE| is 0.01.
  const near = new THREE.Vector3(0, -0.001, 0);
  const hand = reach(shoulder, near);
  assert.ok(Number.isFinite(hand.x + hand.y + hand.z), "NaN in the solution");
});

test("a target on the shoulder leaves the arm alone rather than dividing by zero", () => {
  const shoulder = new THREE.Vector3(0.1, 0.2, 0.3);
  const upper = new THREE.Object3D();
  const fore = new THREE.Object3D();
  upper.add(fore);
  const before = upper.quaternion.clone();
  solveArm(upper, fore, shoulder, shoulder.clone(), UPPER, FORE, POLE);
  assert.ok(upper.quaternion.equals(before), "the arm was disturbed");
});

test("the elbow breaks toward the pole, not away from it", () => {
  // The two mirror solutions put the elbow on opposite sides of the line from
  // the shoulder to the target. Only one of them is a person.
  const shoulder = new THREE.Vector3(0, 0.15, 0);
  const target = new THREE.Vector3(0, -0.11, 0.42);
  const upper = new THREE.Object3D();
  const fore = new THREE.Object3D();
  upper.add(fore);
  solveArm(upper, fore, shoulder, target, UPPER, FORE, POLE);

  const elbow = new THREE.Vector3(0, -UPPER, 0).applyQuaternion(upper.quaternion).add(shoulder);
  // The chord from shoulder to target, and where the elbow sits off it.
  const chord = new THREE.Vector3().subVectors(target, shoulder).normalize();
  const off = new THREE.Vector3().subVectors(elbow, shoulder);
  off.addScaledVector(chord, -off.dot(chord));
  assert.ok(off.dot(POLE) > 0, "the elbow broke away from the pole");
});

test("solving twice with the same input gives the same answer", () => {
  // The module-level scratch vectors are shared by every arm on the grid. A
  // solver that left state behind would make one rider depend on the last.
  const shoulder = new THREE.Vector3(0.17, 0.15, 0.02);
  const target = new THREE.Vector3(0.17, -0.11, 0.42);
  const a = reach(shoulder, target);
  // A completely different arm in between, as the next rider would be.
  reach(new THREE.Vector3(-0.3, -0.4, -0.2), new THREE.Vector3(0.9, 0.9, 0.9));
  const b = reach(shoulder, target);
  assert.ok(a.distanceTo(b) < 1e-9, "the solver carried state between arms");
});
