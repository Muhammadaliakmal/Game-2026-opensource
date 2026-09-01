"use client";

import * as THREE from "three";
import { useMemo } from "react";
import {
  ConvexHullCollider,
  CuboidCollider,
  RigidBody,
} from "@react-three/rapier";
import type { PartTuple } from "@/lib/worlddoc";
import { buildColliders } from "@/lib/greedy-mesh";
import { COLLIDER_GEOMETRIES } from "@/components/editor/shapes";

/**
 * Static world geometry with physics.
 *
 * Everything lives under ONE fixed RigidBody. The world never moves, so there
 * is nothing to gain from a body per block — and plenty to lose: the Quiet
 * Garden used to mount 1,642 <RigidBody> components (1,442 merged boxes plus a
 * body each for its 200 flower slabs), which is 1,642 React components, 1,642
 * Rapier bodies and 1,642 invisible three.js meshes to build before the world
 * can be walked on. Rapier is happy to hang many colliders off a single body,
 * so that's what this does: same collision, one body, and no meshes at all —
 * InstancedWorld already draws every part.
 *
 * Shape strategy:
 *  - Full cubes are greedy-merged into a few big cuboids (§7.4).
 *  - Slabs are boxes too, just half-height, so they get a cuboid directly
 *    rather than a trimesh.
 *  - Ramps and wedges are convex solids, so a convex hull of their collision
 *    geometry is both cheaper than a trimesh and, unlike a trimesh, *solid* —
 *    a trimesh is a thin shell a fast-moving character can tunnel through.
 */

/** Vertex soup for the hull, straight from the un-bevelled collision geometry. */
function hullVertices(shape: number): Float32Array {
  const geom = COLLIDER_GEOMETRIES[shape];
  const pos = geom.getAttribute("position") as THREE.BufferAttribute;
  return new Float32Array(pos.array);
}

// Built once: only two shapes ever need a hull.
const HULLS: Record<number, Float32Array> = {
  2: hullVertices(2), // ramp
  3: hullVertices(3), // wedge
};

export function WorldColliders({ parts }: { parts: PartTuple[] }) {
  const { boxes, others } = useMemo(() => buildColliders(parts), [parts]);

  // Slabs are axis-aligned boxes whatever their yaw, so they never need a hull.
  const { slabs, hulls } = useMemo(() => {
    const slabs: PartTuple[] = [];
    const hulls: PartTuple[] = [];
    for (const p of others) (p[3] === 1 ? slabs : hulls).push(p);
    return { slabs, hulls };
  }, [others]);

  return (
    <RigidBody type="fixed" colliders={false}>
      {boxes.map((b, i) => (
        <CuboidCollider
          key={`box-${i}`}
          // Rapier cuboids are specified as half-extents.
          args={[b.size[0] / 2, b.size[1] / 2, b.size[2] / 2]}
          position={[
            b.min[0] + b.size[0] / 2,
            b.min[1] + b.size[1] / 2,
            b.min[2] + b.size[2] / 2,
          ]}
        />
      ))}

      {slabs.map((p, i) => (
        <CuboidCollider
          key={`slab-${i}`}
          args={[0.5, 0.25, 0.5]}
          // The slab geometry sits on the cell floor (translated -0.25), so its
          // centre is a quarter cell above the floor, not the cell centre.
          position={[p[0] + 0.5, p[1] + 0.25, p[2] + 0.5]}
        />
      ))}

      {hulls.map((p, i) => (
        <ConvexHullCollider
          key={`hull-${i}`}
          args={[HULLS[p[3]]]}
          position={[p[0] + 0.5, p[1] + 0.5, p[2] + 0.5]}
          rotation={[0, (p[6] * Math.PI) / 2, 0]}
        />
      ))}
    </RigidBody>
  );
}
