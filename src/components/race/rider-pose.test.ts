import test from "node:test";
import assert from "node:assert/strict";
import * as THREE from "three";
import { BARS, PEGS } from "./bike-anchors";
import { LEAN, TUCK } from "./ride";
import {
  FORE,
  GRIP_X,
  HIP,
  ROOT_Y,
  ROOT_Z,
  SHIN,
  SHOULDER,
  THIGH,
  TORSO_PITCH,
  UPPER,
} from "./rider-pose";

/**
 * Can the rider reach the bike?
 *
 * ── What this checks, and what `arm-ik.test.ts` checks ───────────────────
 *
 * The solver's own test proves that a REACHABLE target gets the hand exactly.
 * It says nothing about whether the handlebars are reachable from where this
 * particular rider's shoulder actually is — and that was the other half of
 * the bug: the arm was 0.34 long against a 0.59 gap, so no rotation of it,
 * correct sign or not, could have put a hand on a grip.
 *
 * So this is the missing half. It rebuilds the joint's position through the
 * same transforms the component applies — root offset, lean roll, torso
 * pitch — and asserts the target stays inside the annulus the two bones can
 * cover, across every pose the rider can be in: parked upright, folded into
 * a full tuck, and leaned over at full lock either way.
 *
 * Together the two give the guarantee. Reachable at every pose, plus exact
 * whenever reachable, is "the hands are on the bars".
 *
 * ── Why it is not a render test ──────────────────────────────────────────
 *
 * It could be, with a WebGL context and a headless GPU, and it would then be
 * checking the same arithmetic through four more layers. `character-rig.ts`'s
 * own test makes this argument at more length: the claims here are geometric,
 * and a glTF node tree — or in this case a handful of constants — is the
 * level they are actually decided at. The four tests in that file are also
 * currently SKIPPED, because the roster went procedural and left them with no
 * GLB to walk. These run.
 */

/** The arm's reach, as the annulus two bones can put a hand in. */
const ARM_MAX = UPPER + FORE;
const ARM_MIN = Math.abs(UPPER - FORE);
const LEG_MAX = THIGH + SHIN;
const LEG_MIN = Math.abs(THIGH - SHIN);

/**
 * Where a joint ends up, through the transforms `VoxelRider` nests.
 *
 * root(0, ROOT_Y, ROOT_Z) → lean(roll about Z) → torso(pitch about X) → joint.
 * The legs hang off `lean` rather than `torso`, which `inTorso` selects.
 */
function jointAt(
  local: THREE.Vector3,
  lean: number,
  pitch: number,
  inTorso: boolean
): THREE.Vector3 {
  const root = new THREE.Group();
  root.position.set(0, ROOT_Y, ROOT_Z);
  const roll = new THREE.Group();
  roll.rotation.z = lean;
  root.add(roll);

  const parent = new THREE.Group();
  if (inTorso) parent.rotation.x = pitch;
  roll.add(parent);

  const joint = new THREE.Object3D();
  joint.position.copy(local);
  parent.add(joint);

  root.updateMatrixWorld(true);
  return joint.getWorldPosition(new THREE.Vector3());
}

/** Every pose the rider can actually hold: rest/tuck × full lock either way. */
const POSES: Array<{ name: string; lean: number; pitch: number }> = [
  { name: "parked, upright", lean: 0, pitch: TORSO_PITCH },
  { name: "full tuck, straight", lean: 0, pitch: TORSO_PITCH + TUCK },
  { name: "full tuck, leaned left", lean: LEAN, pitch: TORSO_PITCH + TUCK },
  { name: "full tuck, leaned right", lean: -LEAN, pitch: TORSO_PITCH + TUCK },
  { name: "upright, leaned left", lean: LEAN, pitch: TORSO_PITCH },
  { name: "upright, leaned right", lean: -LEAN, pitch: TORSO_PITCH },
];

test("the handlebars are within the rider's reach in every pose", () => {
  for (const { name, lean, pitch } of POSES) {
    for (const side of [-1, 1] as const) {
      const shoulder = jointAt(
        new THREE.Vector3(side * SHOULDER.x, SHOULDER.y, SHOULDER.z),
        lean,
        pitch,
        true
      );
      const grip = new THREE.Vector3(side * GRIP_X, BARS.y, BARS.z);
      const d = shoulder.distanceTo(grip);

      assert.ok(
        d < ARM_MAX,
        `${name}, ${side < 0 ? "left" : "right"}: the grip is ${d.toFixed(3)} ` +
          `away and the arm is ${ARM_MAX.toFixed(3)} long, so the hand cannot ` +
          `reach it. Lengthen the arm or move ROOT_Z forward.`
      );
      assert.ok(
        d > ARM_MIN,
        `${name}: the grip is ${d.toFixed(3)} away, inside the fold the arm ` +
          `can make (${ARM_MIN.toFixed(3)}) — the elbow would invert.`
      );
    }
  }
});

test("the rider is not reaching with a locked-straight arm", () => {
  // Reachable is not enough: an arm at 99% of its length is a mannequin, and
  // it is also one retune of TORSO_PITCH away from not reaching at all. There
  // has to be slack in the worst pose.
  let worst = 0;
  for (const { lean, pitch } of POSES) {
    for (const side of [-1, 1] as const) {
      const shoulder = jointAt(
        new THREE.Vector3(side * SHOULDER.x, SHOULDER.y, SHOULDER.z),
        lean,
        pitch,
        true
      );
      worst = Math.max(worst, shoulder.distanceTo(new THREE.Vector3(side * GRIP_X, BARS.y, BARS.z)));
    }
  }
  assert.ok(
    worst < ARM_MAX * 0.97,
    `the worst pose reaches ${worst.toFixed(3)} of ${ARM_MAX.toFixed(3)} — ` +
      `no bend left in the elbow`
  );
});

test("the footpegs are within the rider's reach in every pose", () => {
  for (const { name, lean, pitch } of POSES) {
    for (const side of [-1, 1] as const) {
      // Legs hang off the lean group: hips do not fold with the chest.
      const hip = jointAt(
        new THREE.Vector3(side * HIP.x, HIP.y, HIP.z),
        lean,
        pitch,
        false
      );
      const peg = new THREE.Vector3(side * PEGS.x, PEGS.y, PEGS.z);
      const d = hip.distanceTo(peg);

      assert.ok(d < LEG_MAX, `${name}: the peg is ${d.toFixed(3)} away, leg is ${LEG_MAX.toFixed(3)}`);
      assert.ok(
        d > LEG_MIN,
        `${name}: the peg is ${d.toFixed(3)} away, inside the leg's fold (${LEG_MIN.toFixed(3)})`
      );
    }
  }
});

test("the rider sits on the saddle rather than through the tank", () => {
  // ROOT_Z was moved forward to bring the bars into reach, and the failure
  // mode of overdoing that is a rider standing on the fuel cap. The seat is
  // 0.5 long centred near z -0.34, so the hips belong behind its front edge.
  assert.ok(ROOT_Z < -0.09, `hips at z ${ROOT_Z} are off the front of the seat`);
  assert.ok(ROOT_Z > -0.45, `hips at z ${ROOT_Z} are off the back of the seat`);
});

test("an arm is about the right length for the body it is on", () => {
  // The old arm was 0.34 — 27% of this body's height — which is the number
  // that made the reach impossible. A human arm is a little under half.
  const height = THIGH + SHIN + 0.44 + 0.34; // legs + torso + head
  const ratio = (UPPER + FORE) / height;
  assert.ok(ratio > 0.4 && ratio < 0.55, `arm is ${(ratio * 100).toFixed(0)}% of height`);
});
