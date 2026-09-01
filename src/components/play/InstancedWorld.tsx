"use client";

import * as THREE from "three";
import { useEffect, useMemo, useRef } from "react";
import { PALETTE, type PartTuple } from "@/lib/worlddoc";
import { SHAPE_GEOMETRIES, FINISH_PARAMS } from "@/components/editor/shapes";

const dummy = new THREE.Object3D();
const col = new THREE.Color();

/**
 * Read-only instanced renderer for Play mode.
 *
 * The editor's InstancedParts subscribes to the mutable editor store; here the
 * world never changes once loaded, so this takes a plain array and writes its
 * matrices exactly once.
 */
function Bucket({
  shape,
  finish,
  parts,
}: {
  shape: number;
  finish: number;
  parts: PartTuple[];
}) {
  const ref = useRef<THREE.InstancedMesh>(null!);

  const material = useMemo(() => {
    const p = FINISH_PARAMS[finish];
    return new THREE.MeshStandardMaterial({
      roughness: p.roughness,
      metalness: p.metalness,
      emissiveIntensity: p.emissiveIntensity,
    });
  }, [finish]);

  useEffect(() => () => material.dispose(), [material]);

  useEffect(() => {
    const mesh = ref.current;
    if (!mesh) return;

    for (let i = 0; i < parts.length; i++) {
      const p = parts[i];
      dummy.position.set(p[0] + 0.5, p[1] + 0.5, p[2] + 0.5);
      dummy.rotation.set(0, (p[6] * Math.PI) / 2, 0);
      dummy.updateMatrix();
      mesh.setMatrixAt(i, dummy.matrix);

      col.set(PALETTE[p[4]]);
      mesh.setColorAt(i, col);
      if (finish === 3) material.emissive.copy(col);
    }

    mesh.count = parts.length;
    mesh.instanceMatrix.needsUpdate = true;
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
    mesh.computeBoundingSphere();
  }, [parts, finish, material]);

  return (
    <instancedMesh
      ref={ref}
      args={[SHAPE_GEOMETRIES[shape], material, Math.max(parts.length, 1)]}
      frustumCulled={false}
      castShadow
      receiveShadow
    />
  );
}

export function InstancedWorld({ parts }: { parts: PartTuple[] }) {
  // Group into (shape, finish) buckets — one InstancedMesh each, since an
  // InstancedMesh has a single material but colour varies per instance.
  const buckets = useMemo(() => {
    const map = new Map<string, PartTuple[]>();
    for (const p of parts) {
      const key = `${p[3]},${p[5]}`;
      const list = map.get(key);
      if (list) list.push(p);
      else map.set(key, [p]);
    }
    return [...map.entries()].map(([key, list]) => {
      const [shape, finish] = key.split(",").map(Number);
      return { shape, finish, parts: list };
    });
  }, [parts]);

  return (
    <>
      {buckets.map((b) => (
        <Bucket
          key={`${b.shape}-${b.finish}`}
          shape={b.shape}
          finish={b.finish}
          parts={b.parts}
        />
      ))}
    </>
  );
}
