import * as THREE from "three";
import type { PropCatalogEntry } from "./props-catalog";
import type { PropInstance } from "./worlddoc";

/**
 * SPEC §12 Phase 3: "per-prop AABB box-collider approximation fed into Play
 * physics." A prop can be tilted on any axis via PivotControls, so the box
 * has to be recomputed per instance rather than reusing the catalog's rest
 * size directly — this rotates the 8 local corners by the instance's
 * rotation and takes their world-space min/max, which for a yaw-only
 * rotation (the common case) is exact, and for an arbitrary tilt is a
 * conservative box that fully contains the model.
 *
 * The prop's own pivot is its base-center (gltf-pipeline.ts's
 * centerAndNormalize), so the local bounding box is
 * x/z ∈ [-size/2, size/2], y ∈ [0, size] before scale.
 */
export function propWorldAABB(
  entry: PropCatalogEntry,
  instance: PropInstance
): { center: [number, number, number]; half: [number, number, number] } {
  const [sx, sy, sz] = entry.size;
  const [scx, scy, scz] = instance.scale;
  const hx = (sx * scx) / 2;
  const hy = sy * scy;
  const hz = (sz * scz) / 2;

  const euler = new THREE.Euler(...instance.rot);
  const corner = new THREE.Vector3();
  const min = new THREE.Vector3(Infinity, Infinity, Infinity);
  const max = new THREE.Vector3(-Infinity, -Infinity, -Infinity);

  for (const x of [-hx, hx]) {
    for (const y of [0, hy]) {
      for (const z of [-hz, hz]) {
        corner.set(x, y, z).applyEuler(euler);
        min.min(corner);
        max.max(corner);
      }
    }
  }

  const [px, py, pz] = instance.pos;
  return {
    center: [
      px + (min.x + max.x) / 2,
      py + (min.y + max.y) / 2,
      pz + (min.z + max.z) / 2,
    ],
    half: [(max.x - min.x) / 2, (max.y - min.y) / 2, (max.z - min.z) / 2],
  };
}
