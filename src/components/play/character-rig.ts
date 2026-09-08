import * as THREE from "three";

/**
 * Posing a humanoid rig by hand.
 *
 * Split out of `CharacterRig.tsx` so it can be tested against the real GLBs.
 * The bone hierarchy in a glTF file is plain JSON — names, translations and
 * rotations — so everything here can be checked without a renderer, a canvas
 * or a browser, which is the only way the claims below are ever going to be
 * verified: "the arms come down out of the T" is not something a type checker
 * has an opinion about.
 */

/**
 * How far the shoulders come down from the T-pose, in radians.
 *
 * A shade under 90°, so the arms hang close to the body with a little daylight
 * at the elbow rather than clipping through the ribs.
 */
export const ARM_DROP = 1.32;

/** A little permanent bend, so the elbows are not locked straight. */
export const ELBOW_BEND = 0.22;

/**
 * The bones the gait touches. Every other bone keeps its rest pose.
 *
 * Deliberately the four limb roots, the chest and the head: the skin carries
 * everything below them. Driving the whole chain by hand would be a second,
 * worse inverse-kinematics solver living in a file about walking.
 *
 * These are `Rig_Medium`'s names. All the shop characters are that one
 * armature with different meshes bound to it, so this covers every one of them
 * — and `character-rig.test.ts` checks each shipped GLB still has all of them,
 * so a model exported from a renamed rig fails the suite rather than silently
 * standing still in the game.
 */
export const BONES = {
  chest: "chest",
  head: "head",
  armL: "upperarm.l",
  armR: "upperarm.r",
  elbowL: "lowerarm.l",
  elbowR: "lowerarm.r",
  legL: "upperleg.l",
  legR: "upperleg.r",
  kneeL: "lowerleg.l",
  kneeR: "lowerleg.r",
} as const;

export type BoneKey = keyof typeof BONES;

/**
 * Which way these models face, against the space the gait is authored in.
 *
 * Measured off the shipped rigs rather than assumed, and pinned by
 * `character-rig.test.ts`: `toes.l` sits at z +0.096 against `foot.l` at
 * -0.019, and `upperleg.l` — the character's LEFT leg — is at x +0.171. Toes
 * forward on +Z with left on +X is a model facing **+Z**.
 *
 * The voxel courier is built facing -Z and turned around by `MODEL_FACING`,
 * and its limb rotations happen inside that turn, so every angle `Gait`
 * produces is a -Z-forward angle. Handing those straight to a +Z model mirrors
 * the whole pose. On the legs and arms that is invisible — a swing cycle
 * reflected is just the other foot leading — but on anything that is not
 * symmetric it is not: it tipped these characters BACKWARDS as they ran, and
 * threw their legs out behind them instead of tucking, mid-jump.
 *
 * It applies to the WALK only. The bike faces +Z, the same way these models
 * do, so `SEATED` below is authored in the model's own space and takes no
 * correction — see the note there.
 */
export const FACE_SIGN = -1;

/**
 * How high the hips sit above a model's origin, in the model's own units.
 *
 * These GLBs are authored with the feet at the origin, and `hips` is the root
 * of the skeleton — so posing the rig never moves it. That makes this a
 * constant of the shared armature rather than of a pose, and it is what lets a
 * seated rider be placed by their hips: the saddle is a point on the bike, and
 * this is the distance from it down to where the model's origin has to go.
 */
export const HIP_HEIGHT = 0.406;

/**
 * A bone, its rest pose, and the model's own axes expressed in the bone's
 * PARENT space.
 *
 * Rotating a bone about a fixed model axis means pre-multiplying its rest
 * quaternion by a rotation stated in the parent's frame — which is why the
 * axes are captured against the parent rather than against the bone itself.
 * Captured once, while the model is still detached from the scene, so "model
 * space" really is the model's and not whatever the avatar's parent group
 * happens to be doing at the time.
 */
export interface Joint {
  bone: THREE.Object3D;
  rest: THREE.Quaternion;
  axisX: THREE.Vector3;
  axisZ: THREE.Vector3;
}

export type Joints = Partial<Record<BoneKey, Joint>>;

export function jointsOf(root: THREE.Object3D): Joints {
  root.updateMatrixWorld(true);
  const byName = new Map<string, THREE.Object3D>();
  root.traverse((o) => byName.set(o.name, o));

  const out: Joints = {};
  const inv = new THREE.Quaternion();
  for (const [key, name] of Object.entries(BONES) as [BoneKey, string][]) {
    const bone = byName.get(name);
    if (!bone || !bone.parent) continue;
    bone.parent.getWorldQuaternion(inv).invert();
    out[key] = {
      bone,
      rest: bone.quaternion.clone(),
      axisX: new THREE.Vector3(1, 0, 0).applyQuaternion(inv).normalize(),
      axisZ: new THREE.Vector3(0, 0, 1).applyQuaternion(inv).normalize(),
    };
  }
  return out;
}

/** Scratch, reused every frame by every joint. */
const qa = new THREE.Quaternion();

/** Rotate a joint about the model's X, then its Z, on top of its rest pose. */
export function poseJoint(j: Joint | undefined, swing: number, twist = 0) {
  if (!j) return;
  j.bone.quaternion
    .setFromAxisAngle(j.axisX, swing)
    .multiply(qa.setFromAxisAngle(j.axisZ, twist))
    .multiply(j.rest);
}

/** The angles the gait produces, as far as the bones are concerned. */
export interface LimbAngles {
  legL: number;
  legR: number;
  armL: number;
  armR: number;
  lean: number;
}

/**
 * Put the whole rig in one pose.
 *
 * The arms take the drop as well as the swing; the legs already hang down at
 * rest and take only the swing. Mirrored signs on the left and right, because
 * the shoulders point in opposite directions along the model's X.
 */
export function poseRig(joints: Joints, a: LimbAngles) {
  poseJoint(joints.legL, a.legL);
  poseJoint(joints.legR, a.legR);
  poseJoint(joints.armL, a.armL, -ARM_DROP);
  poseJoint(joints.armR, a.armR, ARM_DROP);
  poseJoint(joints.elbowL, 0, -ELBOW_BEND);
  poseJoint(joints.elbowR, 0, ELBOW_BEND);
  // The head counter-rotates against the lean so it stays level-ish, and the
  // chest takes a little of it so the tip is not all at the hips.
  poseJoint(joints.head, -a.lean * 0.6);
  poseJoint(joints.chest, -a.lean * 0.25);
}

/**
 * How much of a tuck the elbows absorb.
 *
 * Cancelling the shoulder's rotation leaves its translation, and no single
 * joint cancels that — only a real IK solve would. What is left with this at
 * 1.6 is 45 mm of hand travel against 94 mm at the head, over a full tuck: the
 * hand slides on the grip rather than coming off the bar.
 */
const ELBOW_ABSORB = 1.6;

/**
 * Sitting on a bike.
 *
 * ── Why this is not the gait with different numbers ──────────────────────
 *
 * A walk is a cycle driven by speed; a riding pose is a fixed shape the rider
 * holds, with a lean and a tuck laid over it. Nothing about `Gait` applies —
 * `Rider.tsx` says so and has said so since it was written — so these are
 * their own constants rather than a `GaitPose` with the phase held at zero.
 *
 * ── And why FACE_SIGN does NOT apply to them ─────────────────────────────
 *
 * The gait's angles are authored in the courier's -Z-forward space and have to
 * be flipped for these models. These are authored in the MODEL's own space,
 * because the bike faces +Z and so do they — the two agree, and there is
 * nothing to correct. Writing them the other way round and negating would be
 * the same pose and a worse explanation.
 *
 * Every angle is a rotation about the model's X, applied on top of the rest
 * pose. Positive carries a hanging limb's far end toward -Z, which is
 * backwards for these models, so the forward-reaching ones are negative.
 *
 * The numbers are checked rather than eyeballed: `character-rig.test.ts` runs
 * forward kinematics over each shipped rig and asserts the hands arrive at the
 * handlebars and the feet at the pegs, both taken from `BikeModel`'s anchors.
 */
export const SEATED = {
  /** Thigh up and forward, toward the pegs ahead of the rider. */
  leg: -1.15,
  /** Shin back down from the knee. A seated leg is folded, not extended. */
  knee: 1.25,
  /** Upper arm forward and down, reaching for the bars. */
  arm: -0.95,
  /** A little bend, so the arms are not locked columns. */
  elbow: 0.3,
  /** The torso folded down over the tank. */
  chest: 0.3,
  /** Given back at the neck, because a rider tucks their body, not their eyes. */
  head: -0.25,
} as const;

/**
 * Put a rig on a bike.
 *
 * `fold` is 0..1 — how far into the tuck the rider is, which `Rider.tsx`
 * derives from speed. It deepens the chest and lifts the head to match, and
 * leaves the limbs alone: a rider tucking does not move their hands off the
 * bars or their feet off the pegs.
 */
export function poseSeated(joints: Joints, fold: number, tuck: number) {
  poseJoint(joints.legL, SEATED.leg);
  poseJoint(joints.legR, SEATED.leg);
  poseJoint(joints.kneeL, SEATED.knee);
  poseJoint(joints.kneeR, SEATED.knee);
  /**
   * The arms take the fold back out.
   *
   * The shoulders are children of the chest, so folding the torso carries them
   * — and the hands on the ends of them — down and forward with it. On a bike
   * that is backwards: the bars do not move, so it is the rider's arms that
   * absorb a tuck, which is why a tucked rider's elbows are more bent and not
   * why their hands are somewhere else. Subtracting the same angle here holds
   * the upper arm's world orientation still while the chest rotates under it.
   *
   * `character-rig.test.ts` measures what is left: the head travels a long way
   * into a tuck and the hands barely move.
   */
  poseJoint(joints.armL, SEATED.arm - fold * tuck, -ARM_DROP);
  poseJoint(joints.armR, SEATED.arm - fold * tuck, ARM_DROP);
  // And the elbows take the rest. Cancelling the shoulder's ROTATION still
  // leaves its TRANSLATION — the whole arm is carried forward as the chest
  // folds — and bending the elbow is exactly how a rider absorbs that, so the
  // compensation and the anatomy are the same movement.
  poseJoint(joints.elbowL, SEATED.elbow + fold * tuck * ELBOW_ABSORB, -ELBOW_BEND);
  poseJoint(joints.elbowR, SEATED.elbow + fold * tuck * ELBOW_ABSORB, ELBOW_BEND);
  poseJoint(joints.chest, SEATED.chest + fold * tuck);
  poseJoint(joints.head, SEATED.head - fold * tuck);
}
