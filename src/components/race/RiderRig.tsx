"use client";

import * as THREE from "three";
import { useEffect, useMemo, useRef } from "react";
import { useFrame } from "@react-three/fiber";
import { useGLTF } from "@react-three/drei";
import * as SkeletonUtils from "three/examples/jsm/utils/SkeletonUtils.js";
import { characterFor } from "@/lib/characters";
import { HIP_HEIGHT, jointsOf, poseSeated } from "@/components/play/character-rig";
import { SADDLE } from "./BikeModel";
import { LEAN, LEAN_RATE, TUCK, TUCK_SPEED } from "./ride";

/**
 * The character you bought, on the bike.
 *
 * ── Why this is not `CharacterRig` with a different pose ─────────────────
 *
 * That component exists to hang a walk cycle on a skin: it plants itself at a
 * ground offset derived from ecctrl's floating capsule, hides itself when the
 * first-person camera gets close, and drives every frame from `Gait`. A rider
 * has no capsule, no camera rig and no gait — the same three reasons
 * `Rider.tsx` gives for not being `CharacterModel`. What the two share is the
 * bone machinery, and that is exactly what lives in `character-rig.ts`.
 *
 * ── How it is placed ─────────────────────────────────────────────────────
 *
 * By the hips, not the feet. These models are authored with their feet at the
 * origin, which is the right anchor for someone standing and meaningless for
 * someone sitting — a rider's feet are on pegs, wherever those happen to be.
 * `hips` is the root of the skeleton and so never moves when the rig is posed,
 * which makes `HIP_HEIGHT` a fixed distance from the model's origin up to the
 * point that has to land on the saddle.
 *
 * ── One thing the voxel rider does that this does not ────────────────────
 *
 * Turn its head into the corner. `poseJoint` rotates about the model's X and Z
 * and a head turn is about Y, so it would need a third axis captured per joint
 * — worth doing when something else needs it, and not worth widening the
 * shared rig for one cosmetic touch on one of two riders.
 */
export function RiderRig({
  characterId,
  steerRef,
  speedRef,
}: {
  characterId: string;
  steerRef?: React.RefObject<number>;
  speedRef?: React.RefObject<number>;
}) {
  const character = characterFor(characterId);
  const gltf = useGLTF(character.url!);

  const lean = useRef<THREE.Group>(null!);
  const current = useRef(0);
  const tuck = useRef(0);

  /**
   * One skeleton per rider. `SkeletonUtils` rather than `Object3D.clone()` for
   * the same reason `CharacterRig` gives: the latter copies the meshes and
   * leaves them bound to the ORIGINAL skeleton, so a grid of riders wearing the
   * same character would animate as a single puppet.
   */
  const scene = useMemo(() => SkeletonUtils.clone(gltf.scene), [gltf.scene]);
  const joints = useMemo(() => jointsOf(scene), [scene]);

  useEffect(() => {
    scene.traverse((o) => {
      const mesh = o as THREE.Mesh;
      if (!mesh.isMesh) return;
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      // A skinned mesh's bounds come from the bind pose, and a seated rider is
      // a long way out of a T-pose — without this the whole rider blinks out
      // near the edge of the screen. Same reason CharacterRig does it.
      mesh.frustumCulled = false;
    });
  }, [scene]);

  useFrame((_, dt) => {
    if (!lean.current) return;
    const steer = steerRef?.current ?? 0;
    current.current = THREE.MathUtils.lerp(
      current.current,
      -steer * LEAN,
      1 - Math.pow(LEAN_RATE, dt)
    );
    lean.current.rotation.z = current.current;

    const v = Math.min(1, Math.abs(speedRef?.current ?? 0) / TUCK_SPEED);
    tuck.current = THREE.MathUtils.lerp(tuck.current, v, 1 - Math.pow(LEAN_RATE, dt));

    // The pose is rewritten every frame rather than diffed. It is ten
    // quaternion multiplies against a skin the GPU is going to re-evaluate
    // anyway, and holding a "did the tuck change" flag would be a second copy
    // of the state that can disagree with the first.
    poseSeated(joints, tuck.current, TUCK);
  });

  return (
    <group position={[0, SADDLE.y, SADDLE.z]}>
      {/* Roll about the bike's own axis, so a lean pivots at the saddle rather
          than about the rider's middle — the voxel rider's rule too. */}
      <group ref={lean}>
        <group scale={character.scale} position={[0, -HIP_HEIGHT * character.scale, 0]}>
          <primitive object={scene} />
        </group>
      </group>
    </group>
  );
}

export function preloadRider(id: string) {
  const url = characterFor(id).url;
  if (url) useGLTF.preload(url);
}
