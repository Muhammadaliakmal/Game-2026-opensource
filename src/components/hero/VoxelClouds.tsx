"use client";

import * as THREE from "three";
import { useLayoutEffect, useRef } from "react";
import type { Theme } from "@/lib/theme";

/**
 * Clouds made of the same stuff as the island: white blocks in the scene,
 * standing off around it at different heights.
 *
 * They are what turns the painted sky behind the canvas (HeroSky) into
 * depth. The camera orbits, so these slide past the island at their own
 * distance while the CSS clouds drift on behind — two layers of parallax
 * from one auto-rotating camera, and not a single extra frame: nothing here
 * animates, and `frameloop="demand"` only renders when the orbit moves.
 *
 * One InstancedMesh for every block of every cloud (CLAUDE.md: blocks render
 * instanced, one draw per shape). Geometry and materials at module scope.
 */

/** A cloud as rows of blocks, top row first, one string per layer in depth. */
const SHAPES: string[][] = [
  ["..##..", ".####.", "######"],
  [".###...", "#######", ".#####."],
  ["..#..", "#####"],
];

type Placement = { shape: number; x: number; y: number; z: number; s: number };

/**
 * Hand-placed rather than random, for the reason the island is: the same
 * picture on every load.
 *
 * A sea of clouds the island floats ABOVE, far out. Two constraints set
 * where they can go. The orbit camera stands up to 34 units out
 * (`maxDistance`), so every cloud sits beyond ~41 horizontally and the
 * camera can never pass beside one — the first placement put them at the
 * camera's own radius and height, and one swung past the lens as a white
 * slab across half the screen. And the camera looks down at the island, so
 * the top of the frame is a few degrees *below* the horizon: a cloud at eye
 * height is never in shot. Below the island, far out, is where the camera
 * actually looks.
 */
const PLACEMENTS: Placement[] = [
  { shape: 0, x: -38, y: -2, z: -20, s: 2.2 },
  { shape: 1, x: 30, y: 0, z: -32, s: 2.6 },
  { shape: 2, x: 40, y: -4, z: 12, s: 2 },
  { shape: 1, x: -20, y: 2, z: 38, s: 2.4 },
  { shape: 2, x: 8, y: -6, z: -42, s: 2 },
  { shape: 0, x: -42, y: -5, z: 14, s: 2 },
  { shape: 1, x: 22, y: -3, z: 36, s: 2.2 },
];

function cells(): { x: number; y: number; z: number; shade: boolean }[] {
  const out: { x: number; y: number; z: number; shade: boolean }[] = [];
  for (const p of PLACEMENTS) {
    const rows = SHAPES[p.shape];
    const w = Math.max(...rows.map((r) => r.length));
    rows.forEach((row, ry) => {
      [...row].forEach((c, rx) => {
        if (c !== "#") return;
        // Two blocks deep, so a cloud has a side when the camera is round it.
        for (const dz of [0, 1]) {
          out.push({
            x: p.x + (rx - w / 2) * p.s,
            y: p.y - ry * p.s,
            z: p.z + dz * p.s,
            shade: ry === rows.length - 1,
          });
        }
      });
    });
  }
  return out;
}

const CELLS = cells();
const SCALES = PLACEMENTS.flatMap((p) => {
  const rows = SHAPES[p.shape];
  const n = rows.reduce((a, r) => a + [...r].filter((c) => c === "#").length, 0) * 2;
  return Array<number>(n).fill(p.s);
});

const geometry = new THREE.BoxGeometry(1, 1, 1);
// Lambert, not Standard: a cloud has no specular and wants none of the
// environment map's reflections, and it is cheaper.
const materials: Record<Theme, THREE.MeshLambertMaterial> = {
  light: new THREE.MeshLambertMaterial({ color: "#ffffff", emissive: "#cfe6ff", emissiveIntensity: 0.35 }),
  dark: new THREE.MeshLambertMaterial({ color: "#262b45", emissive: "#0b0e20", emissiveIntensity: 0.5 }),
};
const SHADE = new THREE.Color("#d9e9f8");
const WHITE = new THREE.Color("#ffffff");

export function VoxelClouds({ theme }: { theme: Theme }) {
  const mesh = useRef<THREE.InstancedMesh>(null);

  useLayoutEffect(() => {
    const m = mesh.current;
    if (!m) return;
    const o = new THREE.Object3D();
    CELLS.forEach((c, i) => {
      o.position.set(c.x, c.y, c.z);
      o.scale.setScalar(SCALES[i]);
      o.updateMatrix();
      m.setMatrixAt(i, o.matrix);
      // The bottom row a shade darker, which is how a block cloud reads as
      // lit from above without any shadow pass.
      m.setColorAt(i, c.shade ? SHADE : WHITE);
    });
    m.instanceMatrix.needsUpdate = true;
    if (m.instanceColor) m.instanceColor.needsUpdate = true;
  }, []);

  return (
    <instancedMesh
      ref={mesh}
      // The material as a prop, not in `args`: a changed `args` rebuilds the
      // mesh and would drop the matrices the layout effect wrote once.
      args={[geometry, undefined, CELLS.length]}
      material={materials[theme]}
      // Clouds neither cast nor catch shadows: a shadow from a cloud on the
      // island would read as a dirty patch, not as weather.
      castShadow={false}
      receiveShadow={false}
      // Not part of the island: a click on a cloud is not a placement, and
      // raycasting fifty extra blocks on every pointer move is waste.
      raycast={() => null}
    />
  );
}
