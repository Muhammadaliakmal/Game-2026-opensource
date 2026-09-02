import * as THREE from "three";

// Re-exported so every existing `from "@/lib/grid"` import keeps working.
export { keyOf, parseKey } from "./cell-key";

/**
 * Turn a raycast hit into the integer grid cell to act on.
 *
 * `place` steps OUT along the hit face's normal (the empty cell next to the
 * face you clicked); erasing steps INTO the cell you actually hit.
 *
 * The subtlety: for an InstancedMesh, `hit.face.normal` is in the BASE
 * geometry's local space, not world space. Without applying the instance's
 * normal matrix, a rotated slab/ramp/wedge places against the wrong face.
 */
export function cellFromHit(
  hit: THREE.Intersection,
  place: boolean
): [number, number, number] {
  const p = hit.point.clone();
  const n = hit.face ? hit.face.normal.clone() : new THREE.Vector3(0, 1, 0);

  if (hit.instanceId != null && hit.object instanceof THREE.InstancedMesh) {
    const m = new THREE.Matrix4();
    hit.object.getMatrixAt(hit.instanceId, m);
    const nm = new THREE.Matrix3().getNormalMatrix(m);
    n.applyMatrix3(nm).normalize();
  }

  // Nudge half a cell along the normal so floor() lands in the intended cell
  // rather than exactly on the boundary between two.
  p.addScaledVector(n, place ? 0.5 : -0.5);
  return [Math.floor(p.x), Math.floor(p.y), Math.floor(p.z)];
}

/** Cell under a hit on the ground plane (y=0), used when the world is empty. */
export function cellFromGroundHit(point: THREE.Vector3): [number, number, number] {
  return [Math.floor(point.x), 0, Math.floor(point.z)];
}
