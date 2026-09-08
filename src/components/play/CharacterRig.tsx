"use client";

import * as THREE from "three";
import { useEffect, useMemo, useRef } from "react";
import { useFrame } from "@react-three/fiber";
import { useGLTF } from "@react-three/drei";
import * as SkeletonUtils from "three/examples/jsm/utils/SkeletonUtils.js";
import type { RefObject } from "react";
import type { EcctrlHandle } from "ecctrl";
import { FEEL } from "@/lib/feel";
import { characterFor } from "@/lib/characters";
import { Gait, type AvatarMotion } from "./gait";
import {
  ARM_DROP,
  ELBOW_BEND,
  FACE_SIGN,
  jointsOf,
  poseJoint,
} from "./character-rig";
import { look } from "./camera-rig";

/**
 * A shop character: a skinned GLB, animated by hand.
 *
 * ── Why the bones are driven rather than played ──────────────────────────
 *
 * None of the three GLBs ships a single animation clip. That sounds like the
 * problem and it is actually the reason this works: the game's movement is
 * physics, not a state machine, so a canned walk cycle would have to be
 * blended against a speed it cannot see and would drift out of sync with the
 * feet exactly the way `CharacterModel` has always said. Instead these use the
 * *same* `Gait` the voxel courier does — same swing, same stride-direction
 * test, same landing squash — and only hang the angles on bones instead of on
 * groups.
 *
 * All three characters are the same `Rig_Medium` armature with different
 * meshes bound to it, so one set of bone names covers every one of them, and a
 * fourth character exported from that rig needs no code at all.
 *
 * ── The T-pose is a rest pose, not an idle ───────────────────────────────
 *
 * The arms are straight out sideways, which is how a rig is authored and not
 * how anybody stands. Swinging a T-posed arm about the model's X axis spins it
 * around its own length and reads as nothing at all, so the shoulders get a
 * fixed drop first (`ARM_DROP`) and the gait swings what is left. The legs
 * already hang downward at rest and need no such thing.
 */

/**
 * The models are authored with the feet at the origin, so the character is
 * planted by putting that origin on the floor — no per-model offset, and
 * nothing to re-measure when a new one is added.
 *
 * ecctrl holds the capsule on a spring a `floatHeight` gap above the ground,
 * so the contact point is `-(capsuleHalfHeight + capsuleRadius + floatHeight)`.
 * This must stay in step with the <Ecctrl> props in Player.tsx — the same
 * constraint CharacterModel's GROUND_OFFSET is under.
 */
const CONTACT_Y = -(0.3 + 0.3 + 0.2);

export function CharacterRig({
  characterId,
  handleRef,
  motionRef,
  hideUpClose = true,
}: {
  characterId: string;
  handleRef?: RefObject<EcctrlHandle | null>;
  motionRef?: RefObject<AvatarMotion | null>;
  hideUpClose?: boolean;
}) {
  const character = characterFor(characterId);
  const gltf = useGLTF(character.url!);

  const outer = useRef<THREE.Group>(null!);
  const root = useRef<THREE.Group>(null!);
  const rig = useRef<THREE.Group>(null!);
  const walk = useRef(new Gait());

  /**
   * One skeleton per avatar, so two players wearing the same character do not
   * share a set of bones and animate as a single puppet. `SkeletonUtils`
   * rather than `Object3D.clone()`: the latter copies the meshes but leaves
   * them bound to the ORIGINAL skeleton, which is exactly that bug.
   */
  const scene = useMemo(() => SkeletonUtils.clone(gltf.scene), [gltf.scene]);
  const joints = useMemo(() => jointsOf(scene), [scene]);

  useEffect(() => {
    scene.traverse((o) => {
      const mesh = o as THREE.Mesh;
      if (!mesh.isMesh) return;
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      // A skinned mesh's bounding volume is computed from the bind pose, and
      // these bones move a long way out of it — an arm thrown up mid-jump puts
      // the real silhouette outside the box three is testing, and the whole
      // character blinks out near the edge of the screen.
      mesh.frustumCulled = false;
    });
  }, [scene]);

  useFrame((state, dt) => {
    const h = handleRef?.current ?? motionRef?.current;
    if (!h || !root.current) return;

    if (hideUpClose) {
      root.current.visible = look.distance > 1.8;
      if (!root.current.visible) return;
    }

    walk.current.advance(outer.current, h, dt, state.clock.elapsedTime);
    const p = walk.current.pose;

    root.current.scale.set(
      1 + (FEEL.squashScale[0] - 1) * p.squash,
      1 + (FEEL.squashScale[1] - 1) * p.squash,
      1 + (FEEL.squashScale[2] - 1) * p.squash
    );
    root.current.rotation.x = FACE_SIGN * p.lean;
    root.current.rotation.z = FACE_SIGN * p.roll;
    // The bob is authored in the courier's units, and this group sits above
    // the model's own scale — so it has to be divided back out or a character
    // half the size would bob twice as far up its own body.
    rig.current.position.y = p.bob / character.scale;

    // Legs hang at rest, so the swing is the whole story. Arms come down out
    // of the T first, mirrored, and swing on top of that.
    poseJoint(joints.legL, FACE_SIGN * p.legL);
    poseJoint(joints.legR, FACE_SIGN * p.legR);
    poseJoint(joints.armL, FACE_SIGN * p.armL, -ARM_DROP);
    poseJoint(joints.armR, FACE_SIGN * p.armR, ARM_DROP);
    // A flex has no sign of its own, so the anatomy supplies it: the shin
    // folds backwards and the forearm forwards, which are opposite rotations
    // about the same axis before FACE_SIGN turns them into this model's space.
    // `lowerleg.*` was in the rig all along and had never been driven, which is
    // why these characters ran on stilts.
    poseJoint(joints.kneeL, FACE_SIGN * -p.kneeL);
    poseJoint(joints.kneeR, FACE_SIGN * -p.kneeR);
    poseJoint(joints.elbowL, FACE_SIGN * p.elbowL, -ELBOW_BEND);
    poseJoint(joints.elbowR, FACE_SIGN * p.elbowR, ELBOW_BEND);
    // The head counter-rotates against the lean so it stays level-ish, and the
    // chest takes a little of it so the tip is not all at the hips.
    poseJoint(joints.head, FACE_SIGN * -p.lean * 0.6);
    poseJoint(joints.chest, FACE_SIGN * -p.lean * 0.25);
  });

  return (
    <group ref={outer} position={[0, CONTACT_Y, 0]}>
      {/* `root` carries squash and lean and pivots about the feet, the way the
          courier's does; `rig` takes the bob. The model's own scale sits under
          both, so neither has to know how big this character is. */}
      <group ref={root}>
        <group ref={rig} scale={character.scale}>
          <primitive object={scene} />
        </group>
      </group>
    </group>
  );
}

/** Warm the cache for a character before it is worn. */
export function preloadCharacter(id: string) {
  const url = characterFor(id).url;
  if (url) useGLTF.preload(url);
}
