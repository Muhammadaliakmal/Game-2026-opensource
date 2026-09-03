"use client";

import * as THREE from "three";
import { useEffect, useMemo, useRef } from "react";
import { useFrame, useThree } from "@react-three/fiber";
import { useEditorStore } from "@/stores/editor-store";
import { PALETTE, type PartTuple } from "@/lib/worlddoc";
import { FEEL } from "@/lib/feel";
import { keyOf } from "@/lib/grid";
import { punches } from "./punch";
import { createFinishMaterial, shapeGeometries } from "./shapes";
import { useRenderQuality } from "@/lib/quality";

const dummy = new THREE.Object3D();
const col = new THREE.Color();

/**
 * How long the placement scale-in should last, honouring the OS motion
 * setting. Queried per use rather than cached, so toggling the setting takes
 * effect without a reload.
 */
function reducedMotion(): number {
  const reduce =
    typeof window !== "undefined" &&
    window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
  return reduce ? FEEL.placePunchTimeReduced : FEEL.placePunchTime;
}

/** Round up to a power of two so capacity changes (and remounts) stay rare. */
function capacityFor(count: number): number {
  let cap = 256;
  while (cap < count) cap *= 2;
  return cap;
}

/**
 * Edge of a spatial bucket, world units.
 *
 * ── Why the world is bucketed by position at all ─────────────────────────
 *
 * It used to be bucketed only by (shape, finish), which meant one InstancedMesh
 * held every matching block in the world. An InstancedMesh is culled as a
 * single object, so a bounding volume spanning the whole map is always on
 * screen and *nothing is ever culled* — the far side of the track was drawn in
 * full, every frame, including into the shadow map.
 *
 * Splitting by position gives each mesh a tight bounding sphere that three can
 * actually reject. On Neon Circuit — a 260-unit loop — the chase camera sees
 * roughly a quarter of the track at a time, so most buckets fall outside the
 * frustum on any given frame.
 *
 * 48 is a compromise between two costs that pull opposite ways: smaller
 * buckets cull better but multiply draw calls, and every bucket is a separate
 * instance buffer rounded up to a power of two, so very small ones waste
 * memory on padding.
 */
const CHUNK = 48;

/**
 * Below this many parts, position bucketing is switched off.
 *
 * A small world fits in the frustum anyway, so chunking it would trade real
 * draw calls for culling that never fires. The threshold is set above the
 * built-in cottage and island and below the circuit.
 */
const CHUNK_THRESHOLD = 1500;

const chunkOf = (v: number) => Math.floor(v / CHUNK);

/**
 * One InstancedMesh per (shape, finish) bucket.
 *
 * An InstancedMesh carries a single material, and the four finishes need
 * genuinely different material params — so the buckets are shape x finish
 * (16 draw calls), not shape alone. Colour still varies per instance via
 * instanceColor, which is why the palette is an index rather than a material.
 */
function Bucket({
  shape,
  finish,
  parts: mine,
  castShadow = true,
  detail = 2,
  cullable = false,
}: {
  shape: number;
  finish: number;
  /** This bucket's parts, already separated out by the parent. */
  parts: PartTuple[];
  /** See the `groundY` note on <InstancedParts>. */
  castShadow?: boolean;
  detail?: 1 | 2;
  /**
   * Whether this bucket is small enough in space to be worth culling.
   *
   * Only true when the parent split by position — see CHUNK. An unchunked
   * bucket spans the whole world, so leaving culling on for it would cost a
   * frustum test per frame to reject nothing.
   */
  cullable?: boolean;
}) {
  const ref = useRef<THREE.InstancedMesh>(null!);
  // Which instance slot each cell landed in, so the punch animation can find
  // one block's matrix again without rescanning the whole world.
  const slotOf = useRef(new Map<string, PartTuple>());
  const indexOf = useRef(new Map<string, number>());
  const invalidate = useThree((s) => s.invalidate);

  // Capacity is derived from the live part count, not stored in state — so
  // growing the world never triggers a second render pass. Rounding up to a
  // power of two keeps the remount (which reallocates the buffers) rare.
  const capacity = useMemo(() => capacityFor(mine.length), [mine.length]);

  const material = useMemo(() => createFinishMaterial(finish), [finish]);
  const geometry = useMemo(() => shapeGeometries(detail), [detail]);

  // Dispose the material when this bucket unmounts — R3F only auto-disposes
  // what it created declaratively, not objects built in a useMemo.
  useEffect(() => () => material.dispose(), [material]);

  useEffect(() => {
    const mesh = ref.current;
    if (!mesh) return;

    // `capacity` was derived from this same count, so it always fits.
    indexOf.current.clear();
    slotOf.current.clear();
    for (let i = 0; i < mine.length; i++) {
      const p = mine[i];
      const key = keyOf(p[0], p[1], p[2]);
      indexOf.current.set(key, i);
      slotOf.current.set(key, p);
      dummy.position.set(p[0] + 0.5, p[1] + 0.5, p[2] + 0.5);
      dummy.rotation.set(0, (p[6] * Math.PI) / 2, 0);
      dummy.updateMatrix();
      mesh.setMatrixAt(i, dummy.matrix);

      col.set(PALETTE[p[4]]);
      mesh.setColorAt(i, col);
    }

    mesh.count = mine.length;
    mesh.instanceMatrix.needsUpdate = true;
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
    // Required after moving instances, or the raycaster silently misses them.
    mesh.computeBoundingSphere();
    invalidate();
  }, [mine, shape, finish, capacity, material, invalidate]);

  // Placement punch: a fresh block scales in from `placePunchScale` down to 1.
  // Runs only while something is animating, and only touches those instances —
  // an idle editor still does no per-frame work at all.
  useFrame(() => {
    if (punches.size === 0) return;
    const mesh = ref.current;
    if (!mesh) return;

    const now = performance.now();
    const ms = reducedMotion() * 1000;
    let touched = false;

    for (const [key, started] of punches) {
      const i = indexOf.current.get(key);
      const part = slotOf.current.get(key);
      // Belongs to a different (shape, finish) bucket — leave it to that one.
      if (i === undefined || !part) continue;

      const t = (now - started) / ms;
      const done = t >= 1;
      // Ease out, so it settles to size rather than creeping.
      const scale = done
        ? 1
        : 1 + (FEEL.placePunchScale - 1) * Math.pow(1 - t, 2);

      dummy.position.set(part[0] + 0.5, part[1] + 0.5, part[2] + 0.5);
      dummy.rotation.set(0, (part[6] * Math.PI) / 2, 0);
      dummy.scale.setScalar(scale);
      dummy.updateMatrix();
      dummy.scale.setScalar(1); // shared dummy — leave it neutral for others
      mesh.setMatrixAt(i, dummy.matrix);
      touched = true;

      if (done) punches.delete(key);
    }

    if (touched) {
      mesh.instanceMatrix.needsUpdate = true;
      invalidate();
    }
  });

  return (
    <instancedMesh
      // Remounting on capacity change reallocates the underlying buffers.
      key={capacity}
      ref={ref}
      args={[geometry[shape], material, capacity]}
      // Culled only when the bucket is a chunk of the world rather than all of
      // it. `computeBoundingSphere` runs after the matrices are written below,
      // so a chunk's bounds are tight around the blocks it actually holds and
      // three can reject it honestly.
      frustumCulled={cullable}
      castShadow={castShadow}
      // Always receives, even when it does not cast. A road that stops taking
      // the bike's shadow is immediately obvious; a road that stops casting
      // one onto itself is not.
      receiveShadow
      userData={{ isWorldPart: true }}
    />
  );
}

export function InstancedParts({
  /**
   * The Y of a flat, coplanar ground layer whose shadow-casting is wasted.
   *
   * Neon Circuit is 8,446 blocks, and 6,340 of them are the racing surface at
   * y=0. Every one was being drawn a second time into the shadow map — to cast
   * a shadow onto other blocks whose top faces are at exactly the same height,
   * which is to say onto nothing you can see. Splitting them out and turning
   * `castShadow` off removes 75% of the shadow pass at no visual cost at all.
   *
   * Deliberately a caller-supplied Y rather than "the lowest layer in the
   * world", because the claim being made is *coplanar and flat*, and only the
   * caller knows whether that is true. A user-built world with a stepped floor
   * would lose real shadows if this guessed. Omit it and nothing changes.
   */
  groundY,
}: {
  groundY?: number;
} = {}) {
  const quality = useRenderQuality();

  // Recompute buckets only when the part set changes, not every frame.
  const dirty = useEditorStore((s) => s.dirtyTick);

  /**
   * Split the world into (shape, finish) buckets in ONE pass.
   *
   * Each bucket used to scan the entire parts map twice on its own — once to
   * size its buffer and once to fill it — on top of a third pass here to
   * discover which buckets existed. That is 2n+1 walks of every part in the
   * world for work that is one walk of bucketing, and it ran on every edit.
   * Measured on Sky Yard (5,763 parts) it was 2.29 ms against 1.18 ms; on the
   * course, with more finishes in play, 3.7x.
   */
  const buckets = useMemo(() => {
    // Ground is a third axis of the key, not a filter applied afterwards: an
    // InstancedMesh carries one castShadow flag for all of its instances, so
    // the split has to happen at bucket level or not at all. It costs a few
    // extra draw calls — the circuit goes from 4 to 6 — against a budget of
    // 120, which is not where this scene's problem was.
    const all = [...useEditorStore.getState().parts.values()];
    const ground = groundY !== undefined && !quality.groundCastsShadow;
    const chunked = all.length >= CHUNK_THRESHOLD;

    const by = new Map<string, PartTuple[]>();
    for (const p of all) {
      const isGround = ground && p[1] === groundY;
      // Y is not part of the key: a voxel world is far wider than it is tall,
      // so splitting vertically would multiply buckets without narrowing what
      // the frustum rejects.
      const cx = chunked ? chunkOf(p[0]) : 0;
      const cz = chunked ? chunkOf(p[2]) : 0;
      const key = `${p[3]},${p[5]},${isGround ? 1 : 0},${cx},${cz}`;
      let arr = by.get(key);
      if (!arr) by.set(key, (arr = []));
      arr.push(p);
    }

    return [...by.entries()].map(([key, parts]) => {
      const [shape, finish, isGround] = key.split(",").map(Number) as [
        number,
        number,
        number,
      ];
      return { key, shape, finish, casts: isGround === 0, parts, chunked };
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dirty, groundY, quality.groundCastsShadow]);

  return (
    <>
      {buckets.map(({ key, shape, finish, casts, parts, chunked }) => (
        <Bucket
          key={key}
          shape={shape}
          finish={finish}
          parts={parts}
          castShadow={casts}
          detail={quality.blockDetail}
          cullable={chunked}
        />
      ))}
    </>
  );
}
