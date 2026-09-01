"use client";

import * as THREE from "three";
import { forwardRef } from "react";

export const GROUND_SIZE = 64;

/**
 * The build plane: a grid overlay plus an invisible pickable plane.
 *
 * The plane is what raycasts hit when the world is still empty, which is how
 * the very first block gets placed. It has to be a real mesh (not just the
 * grid helper lines) because lines are effectively unhittable at any sane
 * pointer tolerance.
 */
export const Ground = forwardRef<THREE.Mesh>(function Ground(_props, ref) {
  return (
    <group>
      <gridHelper
        args={[GROUND_SIZE, GROUND_SIZE, "#64748b", "#334155"]}
        position={[0, 0.001, 0]}
      />
      <mesh
        ref={ref}
        rotation={[-Math.PI / 2, 0, 0]}
        receiveShadow
        userData={{ isGround: true }}
      >
        <planeGeometry args={[GROUND_SIZE, GROUND_SIZE]} />
        {/* Very dark and nearly matte so the grid lines stay legible on top. */}
        <meshStandardMaterial color="#0f172a" roughness={1} />
      </mesh>
    </group>
  );
});
