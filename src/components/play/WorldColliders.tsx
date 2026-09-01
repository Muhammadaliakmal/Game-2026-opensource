"use client";

import { RigidBody } from "@react-three/rapier";
import { useMemo } from "react";
import type { PartTuple } from "@/lib/worlddoc";
import { PALETTE } from "@/lib/worlddoc";
import { buildColliders } from "@/lib/greedy-mesh";
import { SHAPE_GEOMETRIES, FINISH_PARAMS } from "@/components/editor/shapes";

/**
 * Static world geometry with physics.
 *
 * Full cubes are greedy-merged into big boxes so Rapier gets tens of colliders
 * instead of thousands. Non-cube shapes keep their real geometry and get a
 * trimesh collider each — merging a slab into a box would give it an invisible
 * full-height collider to walk on.
 */
export function WorldColliders({ parts }: { parts: PartTuple[] }) {
  const { boxes, others } = useMemo(() => buildColliders(parts), [parts]);

  return (
    <>
      {boxes.map((b, i) => (
        <RigidBody
          key={`box-${i}`}
          type="fixed"
          colliders="cuboid"
          position={[
            b.min[0] + b.size[0] / 2,
            b.min[1] + b.size[1] / 2,
            b.min[2] + b.size[2] / 2,
          ]}
        >
          <mesh scale={b.size} castShadow receiveShadow>
            <boxGeometry />
            {/* Merged boxes span many differently-coloured cells, so they're
                rendered by InstancedWorld instead — this mesh is invisible and
                exists only to give Rapier a shape. */}
            <meshStandardMaterial visible={false} />
          </mesh>
        </RigidBody>
      ))}

      {others.map((p, i) => (
        <RigidBody
          key={`part-${i}`}
          type="fixed"
          colliders="trimesh"
          position={[p[0] + 0.5, p[1] + 0.5, p[2] + 0.5]}
          rotation={[0, (p[6] * Math.PI) / 2, 0]}
        >
          <mesh geometry={SHAPE_GEOMETRIES[p[3]]} castShadow receiveShadow>
            <meshStandardMaterial
              color={PALETTE[p[4]]}
              roughness={FINISH_PARAMS[p[5]].roughness}
              metalness={FINISH_PARAMS[p[5]].metalness}
              emissive={p[5] === 3 ? PALETTE[p[4]] : "#000000"}
              emissiveIntensity={FINISH_PARAMS[p[5]].emissiveIntensity}
            />
          </mesh>
        </RigidBody>
      ))}
    </>
  );
}
