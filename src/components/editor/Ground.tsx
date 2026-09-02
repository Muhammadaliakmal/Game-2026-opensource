"use client";

import * as THREE from "three";
import { forwardRef } from "react";

/**
 * Full extent of the build plane, and therefore of the buildable area
 * (Builder clamps edits to it).
 *
 * This has to contain everything the game ships. The default parkour course
 * runs from x=-5 to x=90, so at the old 64 (±32) more than half of the course
 * every new world starts with sat *outside* the grid: visible, but impossible
 * to erase or build against, with no ground under it.
 *
 * ±192 rather than the ±96 that was merely enough for the course: the plane is
 * the ceiling on how big anything anyone builds can ever get, and it costs two
 * triangles and a grid helper to raise. The built-in worlds are the floor of
 * what a world can be, not the roof.
 */
export const GROUND_SIZE = 384;

/**
 * 1-unit cells only near the origin. A full-extent fine grid seen at a shallow
 * angle is a moiré field, and it's the first few dozen cells that anyone
 * actually aims at; further out a coarse 16-unit grid is enough to read
 * distance and direction by.
 *
 * The coarse step scales with the plane — at 8 units a 384-wide plane is 48
 * divisions of hairlines that alias into grey mush at any distance.
 */
const FINE_GRID = 64;
const COARSE_STEP = 16;

/**
 * The build plane: grid overlays plus an invisible pickable plane.
 *
 * The plane is what raycasts hit when the world is still empty, which is how
 * the very first block gets placed. It has to be a real mesh (not just the
 * grid helper lines) because lines are effectively unhittable at any sane
 * pointer tolerance.
 */
export const Ground = forwardRef<THREE.Mesh>(function Ground(_props, ref) {
  return (
    <group>
      {/* Coarse first, so the fine grid draws over it near the origin. */}
      <gridHelper
        args={[GROUND_SIZE, GROUND_SIZE / COARSE_STEP, "#4a525c", "#2b3037"]}
        position={[0, 0.001, 0]}
      />
      <gridHelper
        args={[FINE_GRID, FINE_GRID, "#ffb020", "#343b45"]}
        position={[0, 0.002, 0]}
      />
      <mesh
        ref={ref}
        rotation={[-Math.PI / 2, 0, 0]}
        receiveShadow
        userData={{ isGround: true }}
      >
        <planeGeometry args={[GROUND_SIZE, GROUND_SIZE]} />
        {/* Very dark and nearly matte so the grid lines stay legible on top. */}
        <meshStandardMaterial color="#212529" roughness={1} />
      </mesh>
    </group>
  );
});
