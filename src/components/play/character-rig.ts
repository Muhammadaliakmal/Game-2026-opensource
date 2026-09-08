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
} as const;

export type BoneKey = keyof typeof BONES;

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
