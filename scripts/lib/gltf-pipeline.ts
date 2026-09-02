// Phase 3 asset pipeline — replaces SPEC.md §11.2's Blender pass.
//
// Blender isn't available in this environment, and every one of its stated
// jobs (decimate, normalize scale, set origin to base-center, join meshes
// into one material) has a direct equivalent in the gltf-transform toolchain
// that's already a devDependency for §11.3. Doing it in-process also means
// one Node script instead of shelling out to a separate `blender -b -P`
// headless process. If you later install Blender and prefer its decimation
// quality for hand-authored (non-Meshy) props, this file is the only thing
// that would need a Blender-backed alternative.
import { statSync } from "node:fs";
import { Document, NodeIO, type Accessor, type Node } from "@gltf-transform/core";
import { ALL_EXTENSIONS } from "@gltf-transform/extensions";
import {
  dedup,
  draco,
  flatten,
  join,
  prune,
  simplify,
  textureCompress,
  weld,
} from "@gltf-transform/functions";
import draco3d from "draco3dgltf";
import { MeshoptSimplifier } from "meshoptimizer";
import sharp from "sharp";

/** SPEC §11.2: "~2-5k tris/prop". We target the low end so props stay cheap
 * even once dozens are placed in one world (SPEC §7.3's ~100-200 draw-call
 * budget is for the whole scene, not just the voxel grid). */
export const TARGET_TRIANGLES = 3000;

export interface OptimizedProp {
  /** Bytes written for the final .glb — used to flag anything over the
   * SPEC §11.3 ~200 KB/prop target rather than silently accepting it. */
  bytes: number;
  triangleCount: number;
  /** World-space size in metres after normalization, base-corner at the
   * origin. Feeds the placement ghost and the Phase-3 AABB collider directly
   * — no need to re-inspect the GLB at runtime to size either one. */
  size: [number, number, number];
}

function countTriangles(doc: Document): number {
  let tris = 0;
  for (const mesh of doc.getRoot().listMeshes()) {
    for (const prim of mesh.listPrimitives()) {
      const indices = prim.getIndices();
      const position = prim.getAttribute("POSITION");
      const count = indices ? indices.getCount() : (position?.getCount() ?? 0);
      tris += Math.floor(count / 3);
    }
  }
  return tris;
}

function listPositionAccessors(doc: Document): Accessor[] {
  const seen = new Set<Accessor>();
  for (const mesh of doc.getRoot().listMeshes()) {
    for (const prim of mesh.listPrimitives()) {
      const pos = prim.getAttribute("POSITION");
      if (pos) seen.add(pos);
    }
  }
  return [...seen];
}

/**
 * Every mesh-bearing node's world transform, assuming `flatten()` has already
 * pushed parent transforms down — so what's left on each node IS its world
 * transform, with no ancestor left to compose it against.
 */
function assertBakeable(node: Node) {
  const [rx, ry, rz, rw] = node.getRotation();
  const [sx, sy, sz] = node.getScale();
  const isIdentityRotation = rx === 0 && ry === 0 && rz === 0 && rw === 1;
  const isUnitScale = sx === 1 && sy === 1 && sz === 1;
  if (!isIdentityRotation || !isUnitScale) {
    // join() is expected to bake per-node TRS into vertex data as it merges
    // meshes. If a future gltf-transform version stops doing that, this
    // throws instead of silently mis-centering every prop — the SPEC §11.2
    // failure mode ("props load misaligned with the grid") is exactly the
    // kind of bug that's easy to ship unnoticed.
    throw new Error(
      `Expected an identity rotation/scale after join(), got rotation=[${node.getRotation()}] scale=[${node.getScale()}]. ` +
        `join() may no longer bake node transforms into vertices — see scripts/lib/gltf-pipeline.ts.`
    );
  }
}

/** Base-center the mesh (x/z centered, y=0 at the lowest vertex) and scale it
 * to fit a 1-unit bounding box on its longest axis — SPEC §11.2 steps 2-3,
 * done by writing directly into the POSITION buffers instead of a node
 * transform, so there's no T*R*S composition to get wrong. */
function centerAndNormalize(doc: Document): [number, number, number] {
  const nodes = doc.getRoot().listNodes().filter((n) => n.getMesh());
  for (const node of nodes) assertBakeable(node);

  let minX = Infinity, minY = Infinity, minZ = Infinity;
  let maxX = -Infinity, maxY = -Infinity, maxZ = -Infinity;
  const positions = listPositionAccessors(doc);
  for (const pos of positions) {
    const arr = pos.getArray()!;
    for (let i = 0; i < arr.length; i += 3) {
      minX = Math.min(minX, arr[i]); maxX = Math.max(maxX, arr[i]);
      minY = Math.min(minY, arr[i + 1]); maxY = Math.max(maxY, arr[i + 1]);
      minZ = Math.min(minZ, arr[i + 2]); maxZ = Math.max(maxZ, arr[i + 2]);
    }
  }

  const cx = (minX + maxX) / 2;
  const cz = (minZ + maxZ) / 2;
  const baseY = minY;
  const rawSize: [number, number, number] = [maxX - minX, maxY - minY, maxZ - minZ];
  const maxDim = Math.max(...rawSize) || 1; // guard a degenerate/empty mesh
  const scale = 1 / maxDim;

  for (const pos of positions) {
    const arr = Float32Array.from(pos.getArray()!);
    for (let i = 0; i < arr.length; i += 3) {
      arr[i] = (arr[i] - cx) * scale;
      arr[i + 1] = (arr[i + 1] - baseY) * scale;
      arr[i + 2] = (arr[i + 2] - cz) * scale;
    }
    pos.setArray(arr);
  }
  // Uniform scale about the shared pivot doesn't change normal directions,
  // so NORMAL accessors need no equivalent pass.

  for (const node of nodes) {
    // The mesh data is already centered/scaled; any leftover node transform
    // must be reset or it would be applied a second time on top.
    node.setTranslation([0, 0, 0]).setRotation([0, 0, 0, 1]).setScale([1, 1, 1]);
  }

  return [rawSize[0] * scale, rawSize[1] * scale, rawSize[2] * scale];
}

let dracoDeps: { "draco3d.decoder": unknown; "draco3d.encoder": unknown } | null = null;
async function getDracoDeps() {
  if (!dracoDeps) {
    const [decoder, encoder] = await Promise.all([
      draco3d.createDecoderModule(),
      draco3d.createEncoderModule(),
    ]);
    dracoDeps = { "draco3d.decoder": decoder, "draco3d.encoder": encoder };
  }
  return dracoDeps;
}

/**
 * Runs one raw Meshy GLB through decimate → base-center/normalize → Draco +
 * texture compression, and writes the result to `outputPath`.
 */
export async function optimizeProp(
  inputPath: string,
  outputPath: string
): Promise<OptimizedProp> {
  const io = new NodeIO().registerExtensions(ALL_EXTENSIONS).registerDependencies(
    await getDracoDeps()
  );

  const doc = await io.read(inputPath);

  // Collapse the scene graph and merge everything into as few meshes/draw
  // calls as gltf-transform can manage — SPEC §11.2 step 4 ("join meshes +
  // bake to a single material/atlas"), and the reason a placed prop can be
  // rendered through drei's <Instances> in Phase 3's editor component: that
  // API wants one geometry + one material per catalog entry.
  await doc.transform(dedup(), flatten(), join(), weld());

  const rawTris = countTriangles(doc);
  if (rawTris > TARGET_TRIANGLES) {
    await MeshoptSimplifier.ready;
    await doc.transform(
      simplify({
        simplifier: MeshoptSimplifier,
        ratio: TARGET_TRIANGLES / rawTris,
        error: 0.02,
      })
    );
  }

  await doc.transform(prune(), dedup());

  const size = centerAndNormalize(doc);

  if (doc.getRoot().listTextures().length > 0) {
    await doc.transform(
      textureCompress({ encoder: sharp, resize: [1024, 1024], targetFormat: "webp" })
    );
  }

  // Draco needs a welded mesh (already true) and adds the compression
  // extension + per-primitive encoding; NodeIO does the actual binary
  // encoding at write() time using the registered draco3d.encoder.
  await doc.transform(draco());

  await io.write(outputPath, doc);
  const bytes = statSync(outputPath).size;

  return { bytes, triangleCount: countTriangles(doc), size };
}
