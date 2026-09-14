import * as THREE from "three";

/**
 * A two-bone arm that ends where you tell it to.
 *
 * ── Why this exists ──────────────────────────────────────────────────────
 *
 * The rider's arms were three hand-tuned numbers — a shoulder offset and one
 * rotation — and they were wrong in both of the ways hand-tuned numbers go
 * wrong. The rotation was positive, which by the convention `character-rig.ts`
 * states carries a hanging limb's far end toward -Z, so the hands reached
 * BACKWARD; and the arm was 0.34 long against a 0.53 gap, so it could not have
 * reached the bars even pointing the right way. The hands finished 0.77 units
 * behind the handlebars — half the length of the bike — and nothing failed,
 * because nothing was checking.
 *
 * The fix is not a better number. A rider's hands are on the bars because the
 * bars are where they are: it is a constraint, not a pose. So the bars are the
 * input and the joint angles are solved from them, which means the arms stay
 * put when the torso folds into a tuck, when the rider leans into a corner,
 * and if anybody ever moves `BARS`.
 *
 * ── The solve ────────────────────────────────────────────────────────────
 *
 * Standard two-link IK. The triangle shoulder → elbow → target has all three
 * sides known (the two bone lengths and the distance to the target), so the
 * law of cosines gives the angle at the shoulder, and the elbow follows. The
 * `pole` decides which of the two mirror solutions is taken — an elbow can
 * bend up or down through the same two points, and only one of those is a
 * person.
 *
 * Out of reach is handled by the cosine clamp rather than by moving the
 * target: `acos` saturates at 0 and the arm comes out straight, pointing at
 * what it cannot touch. That is what an arm does.
 *
 * ── Quaternions, not Euler angles ────────────────────────────────────────
 *
 * The segments are boxes along their own -Y, so aiming one is
 * `setFromUnitVectors(DOWN, …)` — the minimal rotation that puts -Y on the
 * direction. Doing it as an X rotation instead would have been two more sign
 * conventions to get wrong, and would only have worked while the whole arm
 * stayed in the sagittal plane, which it does not once the rider leans.
 */

const DOWN = new THREE.Vector3(0, -1, 0);

/** Scratch, reused by every arm on the grid. Nothing here allocates per frame. */
const _d = new THREE.Vector3();
const _dir = new THREE.Vector3();
const _axis = new THREE.Vector3();
const _upperDir = new THREE.Vector3();
const _elbow = new THREE.Vector3();
const _foreDir = new THREE.Vector3();
const _inv = new THREE.Quaternion();
const _fallback = new THREE.Vector3();

/**
 * Point a two-bone chain at `target`.
 *
 * `upper` sits at `shoulder` in some parent space; `fore` is its child, parked
 * at `(0, -upperLen, 0)`; the hand is `(0, -foreLen, 0)` below that. `target`
 * and `pole` are in the SAME parent space as `shoulder` — the caller's job is
 * to bring the bars into that space, because only the caller knows what the
 * torso is doing this frame.
 *
 * Writes both quaternions and returns nothing. Called once per arm per frame.
 */
export function solveArm(
  upper: THREE.Object3D,
  fore: THREE.Object3D,
  shoulder: THREE.Vector3,
  target: THREE.Vector3,
  upperLen: number,
  foreLen: number,
  pole: THREE.Vector3
): void {
  _d.subVectors(target, shoulder);
  const dist = _d.length();
  // A target on top of the shoulder has no direction to aim at; leave the arm
  // wherever it was rather than dividing by zero.
  if (dist < 1e-6) return;
  _dir.copy(_d).divideScalar(dist);

  // The angle at the shoulder between the upper arm and the line to the
  // target. Clamped, so a target out of reach straightens the arm instead of
  // producing NaN.
  const cosB =
    (upperLen * upperLen + dist * dist - foreLen * foreLen) / (2 * upperLen * dist);
  const bend = Math.acos(THREE.MathUtils.clamp(cosB, -1, 1));

  // Which way the elbow breaks. `dir × pole` is the axis to swing about; if
  // the pole happens to be parallel to the reach there is no such axis, and
  // any perpendicular will do rather than a NaN.
  _axis.crossVectors(_dir, pole);
  if (_axis.lengthSq() < 1e-12) {
    _fallback.set(1, 0, 0);
    if (Math.abs(_dir.x) > 0.9) _fallback.set(0, 0, 1);
    _axis.crossVectors(_dir, _fallback);
  }
  _axis.normalize();

  // Positive, not negative: with `axis = dir × pole`, a positive rotation
  // carries `dir` toward the pole, which is the side the elbow belongs on.
  _upperDir.copy(_dir).applyAxisAngle(_axis, bend);
  _elbow.copy(_upperDir).multiplyScalar(upperLen).add(shoulder);
  _foreDir.subVectors(target, _elbow);
  if (_foreDir.lengthSq() < 1e-12) _foreDir.copy(_upperDir);
  _foreDir.normalize();

  upper.quaternion.setFromUnitVectors(DOWN, _upperDir);
  // The forearm is a CHILD of the upper arm, so its rotation is relative:
  // take the direction it needs in the parent's space back through the upper
  // arm's own rotation first.
  _inv.copy(upper.quaternion).invert();
  fore.quaternion.setFromUnitVectors(DOWN, _foreDir.applyQuaternion(_inv));
}

/**
 * Where the hand ends up, for a chain that has been solved.
 *
 * Exists for the test, and for the same reason the rig test runs forward
 * kinematics rather than trusting the angles: "the hand is on the bar" is a
 * claim about a position, so it has to be checked as one.
 */
export function handPosition(
  shoulder: THREE.Vector3,
  upperQ: THREE.Quaternion,
  foreQ: THREE.Quaternion,
  upperLen: number,
  foreLen: number,
  out = new THREE.Vector3()
): THREE.Vector3 {
  const up = new THREE.Object3D();
  up.position.copy(shoulder);
  up.quaternion.copy(upperQ);
  const fo = new THREE.Object3D();
  fo.position.set(0, -upperLen, 0);
  fo.quaternion.copy(foreQ);
  const hand = new THREE.Object3D();
  hand.position.set(0, -foreLen, 0);
  up.add(fo);
  fo.add(hand);
  up.updateMatrixWorld(true);
  return hand.getWorldPosition(out);
}
