/**
 * Turns the sci-fi bike FBX into a GLB this game can actually draw.
 *
 *   npm run bike:import -- <path-to-BIke_Low.fbx>
 *
 * ── Why this is a script and not a one-off ───────────────────────────────
 *
 * The same argument `scripts/optimize-props.ts` makes: the input is somebody
 * else's export and the output is a file in `public/`, so the only way the
 * repo can ever answer "how was this made" is for the answer to be runnable.
 * Re-running it on a new export of the same model has to produce the same
 * result, or the bike moves under the rider the next time anyone touches it.
 *
 * ── What the raw file is, and why none of it can ship as-is ──────────────
 *
 * 87 meshes, 209,505 vertices, 69,835 triangles, 19 Maya-default materials
 * (`blinn12`, `lambert7`), and four references to texture files the archive
 * does not contain. Every one of those is a problem here:
 *
 * - **87 meshes is 87 draw calls, per bike.** A five-bike grid would be 435,
 *   against a race that currently spends 60 in total (see `plan-phase6.md`
 *   6f). Merging by material takes it to five.
 * - **19 materials cannot be tinted per rider.** `bikeColor()` gives every
 *   rider their own colour and the whole point is telling four bikes apart
 *   through a corner. The materials are collapsed into five named ones, of
 *   which two — `body` and `accent` — are what a rider's colour lands on.
 * - **The missing textures are a feature here.** The model is grey, black and
 *   two flat colours, so it loses nothing by being untextured, and an
 *   untextured GLB has no image to decode, resize or ship.
 * - **It is 22.8 units long, lying along X.** This game's bike is ~2.4 long
 *   along +Z with its origin at axle height. Normalising that is the whole
 *   reason the rider still fits afterwards.
 *
 * ── The one thing a script cannot decide ─────────────────────────────────
 *
 * Which end is the front. Nothing in the file says so, and getting it wrong
 * produces a bike that drives backwards while looking perfectly fine standing
 * still. So `npm run bike:preview` rasterises the result to a PNG that a human
 * (or a model that can read images) can look at, and `FRONT_IS_PLUS_X` below
 * is the single constant that flips it.
 */
import { mkdirSync, readFileSync, statSync } from "node:fs";
import { dirname } from "node:path";

// FBXLoader builds a TextureLoader for every referenced map, and TextureLoader
// reaches for `document.createElementNS`. The archive ships no textures and we
// strip every map below anyway, so this only has to be shaped like an <img>
// and must never actually load anything.
const g = globalThis as unknown as {
  document?: unknown;
  self?: unknown;
  FileReader?: unknown;
};
g.document ??= {
  createElementNS: () => ({
    addEventListener() {},
    removeEventListener() {},
    setAttribute() {},
    style: {},
    src: "",
  }),
};
g.self ??= globalThis;

// GLTFExporter hands its finished binary back as a Blob and then reads it with
// a FileReader, which Node has no global for — though it does have the Blob,
// and a Blob can already produce its own ArrayBuffer. So this is a shim over a
// capability that is present rather than a reimplementation of a missing one.
g.FileReader ??= class {
  result: ArrayBuffer | null = null;
  onloadend: (() => void) | null = null;
  readAsArrayBuffer(blob: Blob) {
    void blob.arrayBuffer().then((ab) => {
      this.result = ab;
      this.onloadend?.();
    });
  }
};

import * as THREE from "three";
import { FBXLoader } from "three/examples/jsm/loaders/FBXLoader.js";
import { GLTFExporter } from "three/examples/jsm/exporters/GLTFExporter.js";
import * as BufferGeometryUtils from "three/examples/jsm/utils/BufferGeometryUtils.js";
import { NodeIO } from "@gltf-transform/core";
import { ALL_EXTENSIONS } from "@gltf-transform/extensions";
import { dedup, draco, flatten, join, prune, simplify, weld } from "@gltf-transform/functions";
import { MeshoptSimplifier } from "meshoptimizer";
import draco3d from "draco3dgltf";

const OUT = "public/bikes/scifi.glb";

/**
 * The target shape, taken from `BikeModel.tsx` rather than invented.
 *
 * That component's origin sits at **axle height** with the wheels' contact
 * point 0.43 below it, its length runs along +Z, and `Rider.tsx` is fitted to
 * the saddle and bars that follow from it. Matching those three facts is what
 * lets the GLB be dropped in at the same `position={[0, -0.12, 0]}` with the
 * rider still sitting on the seat instead of inside the engine.
 */
const TARGET_LENGTH = 2.36; // front tyre to rear tyre, along Z
const AXLE_TO_GROUND = 0.43; // wheel radius: where y = 0 has to sit

/**
 * Triangles to keep.
 *
 * The raw model is 69,835, which is not absurd for one hero vehicle and is
 * absurd for six of them on a grid: `plan-phase6.md` 6f measured Neon Circuit
 * at 1.6M triangles total, so a full grid of raw bikes would add a quarter as
 * much again, and the frame budget on a tier-3 phone has still never been
 * measured on hardware. 20k keeps the silhouette — this is a smooth-surfaced
 * model whose detail is in its shapes, not in fine geometry — and puts a full
 * grid under 8% of the track.
 */
const TARGET_TRIANGLES = 20_000;

/**
 * Which end of the raw model is the front, along its own X axis.
 *
 * Flip this if the preview shows the bike facing away. It is a constant rather
 * than a heuristic because every heuristic for "which end of a vehicle is the
 * front" is wrong on some vehicle, and this one is checkable in one look.
 */
const FRONT_IS_PLUS_X = true;

/**
 * The five materials the 19 collapse into, and the rule that decides which.
 *
 * Keyed on what the source actually contains: near-black is rubber, the two
 * saturated colours (#2e56a5 blue, #2e959b teal) are the only styling on the
 * model and so become the accent, anything translucent is glass, mid-greys are
 * hardware, and the light grey that covers most of the model is the bodywork.
 *
 * `body` and `accent` are the two a rider's colour lands on, so they are named
 * — `BikeModel` looks them up by name, and a rename here is a bike that comes
 * out of the factory in one colour for everybody.
 */
const MATERIALS = {
  body: new THREE.MeshStandardMaterial({
    name: "body",
    color: "#cccccc",
    roughness: 0.32,
    metalness: 0.85,
  }),
  accent: new THREE.MeshStandardMaterial({
    name: "accent",
    color: "#2e959b",
    roughness: 0.35,
    metalness: 0.5,
    emissive: "#2e959b",
    emissiveIntensity: 0.6,
  }),
  dark: new THREE.MeshStandardMaterial({
    name: "dark",
    color: "#4c4c4c",
    roughness: 0.5,
    metalness: 0.6,
  }),
  tyre: new THREE.MeshStandardMaterial({
    name: "tyre",
    color: "#15171a",
    roughness: 0.92,
    metalness: 0,
  }),
  glass: new THREE.MeshStandardMaterial({
    name: "glass",
    color: "#8fb6c4",
    roughness: 0.1,
    metalness: 0.2,
    transparent: true,
    opacity: 0.55,
  }),
} as const;

type Slot = keyof typeof MATERIALS;

/** Which of the five a source material becomes. */
function slotFor(m: THREE.Material): Slot {
  const mat = m as THREE.MeshPhongMaterial;
  if (mat.opacity !== undefined && mat.opacity < 0.95) return "glass";
  const c = mat.color;
  if (!c) return "dark";
  const hsl = { h: 0, s: 0, l: 0 };
  c.getHSL(hsl);
  // Saturation is the whole test for the accent: everything else on this model
  // is a grey, so anything with colour in it is the styling.
  if (hsl.s > 0.25) return "accent";
  if (hsl.l < 0.06) return "tyre";
  if (hsl.l < 0.55) return "dark";
  return "body";
}

/** Triangles in a document, across every primitive of every mesh. */
function countTriangles(doc: import("@gltf-transform/core").Document): number {
  let n = 0;
  for (const mesh of doc.getRoot().listMeshes()) {
    for (const prim of mesh.listPrimitives()) {
      const idx = prim.getIndices();
      const pos = prim.getAttribute("POSITION");
      n += (idx ? idx.getCount() : (pos?.getCount() ?? 0)) / 3;
    }
  }
  return n;
}

/** position/normal/uv only, and every geometry carrying all three. */
function conform(geo: THREE.BufferGeometry): THREE.BufferGeometry {
  const out = new THREE.BufferGeometry();
  const pos = geo.getAttribute("position");
  out.setAttribute("position", pos.clone());
  if (geo.getAttribute("normal")) out.setAttribute("normal", geo.getAttribute("normal").clone());
  else {
    out.computeVertexNormals();
  }
  // mergeGeometries refuses a set whose attributes differ, and the FBX has
  // meshes with UVs and meshes without. Nothing here is textured, so the
  // cheapest way to agree is for everyone to have zeroes.
  const uv = geo.getAttribute("uv");
  out.setAttribute(
    "uv",
    uv ? uv.clone() : new THREE.BufferAttribute(new Float32Array(pos.count * 2), 2)
  );
  if (geo.index) out.setIndex(geo.index.clone());
  return out;
}

async function main() {
  // Defaults to where the convention puts it: raw exports live under
  // assets/raw-*, gitignored, and public/ carries the optimised output. Same
  // arrangement as the props and the characters.
  const source = process.argv[2] ?? "assets/raw-bikes/BIke_Low.fbx";

  const buf = readFileSync(source);
  const ab = buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength);
  const raw = new FBXLoader().parse(ab, "");
  raw.updateMatrixWorld(true);

  // ── Collect, by slot, in world space ──────────────────────────────────
  // Each mesh's own transform is baked in here rather than kept: after the
  // merge there is one mesh per material and no hierarchy left to carry it.
  const buckets = new Map<Slot, THREE.BufferGeometry[]>();
  let sourceMeshes = 0;
  raw.traverse((o) => {
    const mesh = o as THREE.Mesh;
    if (!mesh.isMesh) return;
    sourceMeshes++;
    const mats = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
    const slot = slotFor(mats[0]);
    const geo = conform(mesh.geometry);
    geo.applyMatrix4(mesh.matrixWorld);
    const list = buckets.get(slot) ?? [];
    list.push(geo);
    buckets.set(slot, list);
  });

  const merged = new THREE.Group();
  merged.name = "Bike";
  for (const [slot, geos] of buckets) {
    const geo = BufferGeometryUtils.mergeGeometries(geos, false);
    if (!geo) throw new Error(`could not merge the ${slot} geometry`);
    const mesh = new THREE.Mesh(geo, MATERIALS[slot]);
    mesh.name = slot;
    merged.add(mesh);
  }

  // ── Normalise ─────────────────────────────────────────────────────────
  // Length along X becomes length along +Z. A quarter turn either way does
  // that; which one decides whether the headlight leads or follows.
  merged.rotateY(FRONT_IS_PLUS_X ? Math.PI / 2 : -Math.PI / 2);
  merged.updateMatrixWorld(true);

  let box = new THREE.Box3().setFromObject(merged);
  const size = box.getSize(new THREE.Vector3());
  const scale = TARGET_LENGTH / size.z;
  merged.scale.setScalar(scale);
  merged.updateMatrixWorld(true);

  box = new THREE.Box3().setFromObject(merged);
  const centre = box.getCenter(new THREE.Vector3());
  // Centred across the bike and along it, and lifted so the tyres' contact
  // point — the box's floor — lands AXLE_TO_GROUND below the origin, which is
  // where BikeModel puts its own.
  merged.position.set(
    merged.position.x - centre.x,
    merged.position.y - box.min.y - AXLE_TO_GROUND,
    merged.position.z - centre.z
  );
  merged.updateMatrixWorld(true);

  const final = new THREE.Box3().setFromObject(merged);
  const fs = final.getSize(new THREE.Vector3());

  // ── Export, then optimise ─────────────────────────────────────────────
  const scene = new THREE.Scene();
  scene.add(merged);
  const glb = await new Promise<ArrayBuffer>((resolve, reject) => {
    new GLTFExporter().parse(
      scene,
      (result) => resolve(result as ArrayBuffer),
      (err) => reject(err),
      { binary: true }
    );
  });

  const io = new NodeIO().registerExtensions(ALL_EXTENSIONS).registerDependencies({
    "draco3d.decoder": await draco3d.createDecoderModule(),
    "draco3d.encoder": await draco3d.createEncoderModule(),
  });
  const doc = await io.readBinary(new Uint8Array(glb));
  // `join` is what actually collapses the scene to one primitive per material;
  // the merge above only got the geometry into the same buckets.
  await doc.transform(dedup(), flatten(), join(), weld(), prune(), dedup());

  const before = countTriangles(doc);
  if (before > TARGET_TRIANGLES) {
    await MeshoptSimplifier.ready;
    // `error` is generous because nothing here is a precise mechanism: the
    // parts that must stay recognisable are the fairing curves and the wheels,
    // and both survive an aggressive ratio far better than a hard edge would.
    await doc.transform(
      simplify({ simplifier: MeshoptSimplifier, ratio: TARGET_TRIANGLES / before, error: 0.008 })
    );
    await doc.transform(prune(), dedup());
  }
  // Draco, like every other GLB this game ships — drei's useGLTF turns its
  // decoder on by default, which is what the props and characters already rely
  // on. An uncompressed hero asset would be the odd one out AND the big one.
  await doc.transform(draco());

  mkdirSync(dirname(OUT), { recursive: true });
  await io.write(OUT, doc);

  const prims = doc
    .getRoot()
    .listMeshes()
    .reduce((n, m) => n + m.listPrimitives().length, 0);
  const tris = countTriangles(doc);

  console.log(`in:   ${source}`);
  console.log(`      ${sourceMeshes} meshes, ${buckets.size} material slots`);
  console.log(`out:  ${OUT}`);
  console.log(`      ${prims} draw calls, ${Math.round(tris)} triangles, ${(statSync(OUT).size / 1024).toFixed(0)} kB`);
  console.log(
    `size: ${fs.x.toFixed(2)} wide x ${fs.y.toFixed(2)} tall x ${fs.z.toFixed(2)} long` +
      `   floor y=${final.min.y.toFixed(3)} (want ${(-AXLE_TO_GROUND).toFixed(3)})`
  );
  console.log(`slots: ${[...buckets.keys()].join(", ")}`);
}

main().catch((e) => {
  console.error(e instanceof Error ? e.stack : e);
  process.exit(1);
});

