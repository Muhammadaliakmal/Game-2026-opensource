"use client";

import * as THREE from "three";
import { useEffect, useMemo, useRef } from "react";
import { useThree } from "@react-three/fiber";
import { useEditorStore } from "@/stores/editor-store";
import { PALETTE, type PartTuple } from "@/lib/worlddoc";
import { SHAPE_GEOMETRIES, FINISH_PARAMS } from "./shapes";

const dummy = new THREE.Object3D();
const col = new THREE.Color();

/** Round up to a power of two so capacity changes (and remounts) stay rare. */
function capacityFor(count: number): number {
  let cap = 256;
  while (cap < count) cap *= 2;
  return cap;
}

/**
 * One InstancedMesh per (shape, finish) bucket.
 *
 * An InstancedMesh carries a single material, and the four finishes need
 * genuinely different material params — so the buckets are shape x finish
 * (16 draw calls), not shape alone. Colour still varies per instance via
 * instanceColor, which is why the palette is an index rather than a material.
 */
function Bucket({ shape, finish }: { shape: number; finish: number }) {
  const ref = useRef<THREE.InstancedMesh>(null!);
  const dirty = useEditorStore((s) => s.dirtyTick);
  const invalidate = useThree((s) => s.invalidate);

  // Capacity is derived from the live part count, not stored in state — so
  // growing the world never triggers a second render pass. Rounding up to a
  // power of two keeps the remount (which reallocates the buffers) rare.
  const capacity = useMemo(() => {
    let n = 0;
    for (const p of useEditorStore.getState().parts.values()) {
      if (p[3] === shape && p[5] === finish) n++;
    }
    return capacityFor(n);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dirty, shape, finish]);

  const material = useMemo(() => {
    const p = FINISH_PARAMS[finish];
    return new THREE.MeshStandardMaterial({
      roughness: p.roughness,
      metalness: p.metalness,
      emissiveIntensity: p.emissiveIntensity,
    });
  }, [finish]);

  // Dispose the material when this bucket unmounts — R3F only auto-disposes
  // what it created declaratively, not objects built in a useMemo.
  useEffect(() => () => material.dispose(), [material]);

  useEffect(() => {
    const mesh = ref.current;
    if (!mesh) return;

    const mine: PartTuple[] = [];
    for (const p of useEditorStore.getState().parts.values()) {
      if (p[3] === shape && p[5] === finish) mine.push(p);
    }

    // `capacity` was derived from this same count, so it always fits.
    for (let i = 0; i < mine.length; i++) {
      const p = mine[i];
      dummy.position.set(p[0] + 0.5, p[1] + 0.5, p[2] + 0.5);
      dummy.rotation.set(0, (p[6] * Math.PI) / 2, 0);
      dummy.updateMatrix();
      mesh.setMatrixAt(i, dummy.matrix);

      col.set(PALETTE[p[4]]);
      mesh.setColorAt(i, col);
      // The emissive finish glows in its own colour rather than a fixed white.
      if (finish === 3) material.emissive.copy(col);
    }

    mesh.count = mine.length;
    mesh.instanceMatrix.needsUpdate = true;
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
    // Required after moving instances, or the raycaster silently misses them.
    mesh.computeBoundingSphere();
    invalidate();
  }, [dirty, shape, finish, capacity, material, invalidate]);

  return (
    <instancedMesh
      // Remounting on capacity change reallocates the underlying buffers.
      key={capacity}
      ref={ref}
      args={[SHAPE_GEOMETRIES[shape], material, capacity]}
      // The bounding sphere spans the whole map, so per-instance culling
      // isn't automatic and frustum culling would wrongly drop the mesh.
      frustumCulled={false}
      castShadow
      receiveShadow
      userData={{ isWorldPart: true }}
    />
  );
}

export function InstancedParts() {
  // Recompute buckets only when the part set changes, not every frame.
  const dirty = useEditorStore((s) => s.dirtyTick);

  const buckets = useMemo(() => {
    const seen = new Set<string>();
    for (const p of useEditorStore.getState().parts.values()) {
      seen.add(`${p[3]},${p[5]}`);
    }
    return [...seen].map((k) => k.split(",").map(Number) as [number, number]);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dirty]);

  return (
    <>
      {buckets.map(([shape, finish]) => (
        <Bucket key={`${shape}-${finish}`} shape={shape} finish={finish} />
      ))}
    </>
  );
}
