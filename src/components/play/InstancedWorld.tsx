"use client";

import * as THREE from "three";
import { useEffect, useMemo, useRef } from "react";
import { PALETTE, type PartTuple } from "@/lib/worlddoc";
import { createFinishMaterial, releaseFinishMaterial, shapeGeometries } from "@/components/editor/shapes";
import { useRenderQuality } from "@/lib/quality";
import { useBlockArrays } from "@/lib/textures/block-arrays";
import { ownedGeometry, writeInstanceTextures } from "@/lib/textures/instance-texture";

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
  const quality = useRenderQuality();

  // Same shape as the editor's Bucket: the plain material until the arrays
  // arrive, rebuilt once when they do, and an owned geometry carrying this
  // bucket's surface indices. See lib/textures/instance-texture.ts.
  const arrays = useBlockArrays();
  const material = useMemo(
    () => createFinishMaterial(finish, arrays, quality.textures),
    [finish, arrays, quality.textures]
  );
  const capacity = Math.max(parts.length, 1);
  const geometry = useMemo(
    () => ownedGeometry(shapeGeometries(quality.blockDetail)[shape], capacity),
    [quality.blockDetail, shape, capacity]
  );

  useEffect(() => () => releaseFinishMaterial(material), [material]);
  useEffect(() => () => geometry.dispose(), [geometry]);

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
    }
    writeInstanceTextures(geometry, parts);

    mesh.count = parts.length;
    mesh.instanceMatrix.needsUpdate = true;
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
    mesh.computeBoundingSphere();
  }, [parts, material, geometry]);

  return (
    <instancedMesh
      // Remount when the geometry changes: `args` are constructor arguments
      // and R3F does not swap them on a live object.
      key={geometry.uuid}
      ref={ref}
      args={[geometry, material, capacity]}
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
