import * as THREE from "three";
import { textureOf, type PartTuple } from "@/lib/worlddoc";
import { TEXTURE_ATTRIBUTE } from "./block-shader";

/**
 * The per-instance surface index, as a geometry attribute.
 *
 * ── Why an attribute and not a bucket ────────────────────────────────────
 *
 * The instanced renderers bucket by (shape, finish, ground, chunk) and every
 * bucket is a draw call. Adding surface to that key would multiply the call
 * count by eleven. One float per instance on the geometry costs nothing per
 * frame and lets a single draw carry every surface in the bucket — the same
 * reason colour is `instanceColor` and not a bucket axis.
 *
 * ── Why the geometry is cloned ───────────────────────────────────────────
 *
 * An InstancedBufferAttribute lives on the geometry, and the shape
 * geometries are module-level singletons shared by every bucket. Writing the
 * attribute onto the shared one would hand every bucket the last bucket's
 * layers. So each bucket owns a clone — a few kilobytes: 300 triangles of
 * position, normal and uv — and disposes it with its material. The clone
 * shares nothing with the original, so disposing it is safe.
 */
export function ownedGeometry(shared: THREE.BufferGeometry, capacity: number): THREE.BufferGeometry {
  const g = shared.clone();
  const attr = new THREE.InstancedBufferAttribute(new Float32Array(capacity), 1);
  attr.setUsage(THREE.DynamicDrawUsage);
  g.setAttribute(TEXTURE_ATTRIBUTE, attr);
  return g;
}

/**
 * Write every instance's surface index. Call alongside setMatrixAt /
 * setColorAt, over the same range, and it flags the upload itself.
 */
export function writeInstanceTextures(geometry: THREE.BufferGeometry, parts: PartTuple[]): void {
  const attr = geometry.getAttribute(TEXTURE_ATTRIBUTE) as THREE.InstancedBufferAttribute | undefined;
  if (!attr) return;
  const arr = attr.array as Float32Array;
  for (let i = 0; i < parts.length; i++) arr[i] = textureOf(parts[i]);
  attr.needsUpdate = true;
}
