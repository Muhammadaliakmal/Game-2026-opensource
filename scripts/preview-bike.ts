/**
 * Draws a GLB to a PNG, on the CPU, so a model can be judged without a browser.
 *
 *   npm run bike:preview
 *
 * The same argument `scripts/render-sky.ts` makes: the exit criterion here is
 * visual — "the bike faces forward and looks like a bike" — and taking a real
 * screenshot needs a browser attached to a running game. A software rasteriser
 * is not a renderer, and it is not trying to be: no shadows, no environment,
 * no tone mapping. It answers the three questions an import actually fails on,
 * and all three are questions about shape rather than about shading.
 *
 * 1. **Which way is it facing?** Nothing in an FBX says which end of a vehicle
 *    is the front, and a bike imported backwards looks perfect standing still
 *    and drives in reverse.
 * 2. **Is it the right size, sitting on the floor?** The numbers say the box is
 *    right; only a picture says the wheels are what is touching it.
 * 3. **Did the material collapse land on the right parts?** Five slots chosen
 *    by colour is a guess until you see which pieces went where.
 *
 * Three orthographic views, because one is not enough to catch a model that is
 * subtly rotated, and the grid lines are the game's own units so the answer to
 * "how big is it" is readable off the image.
 */
import { mkdirSync } from "node:fs";
import { dirname } from "node:path";
import sharp from "sharp";
import { NodeIO, type Document } from "@gltf-transform/core";
import { ALL_EXTENSIONS } from "@gltf-transform/extensions";
import draco3d from "draco3dgltf";

const IN = "public/bikes/scifi.glb";
const OUT = "docs/bike-preview.png";

/** One view: pixels across, and the world size that spans. */
const W = Number(process.env.BIKE_PREVIEW_W ?? 520);
const H = Number(process.env.BIKE_PREVIEW_H ?? 380);
const PAD = 1.15;

/** Slot colours, so the material collapse is visible rather than inferred. */
const SLOT_RGB: Record<string, [number, number, number]> = {
  body: [200, 205, 212],
  accent: [46, 149, 155],
  dark: [96, 100, 108],
  tyre: [30, 32, 36],
  glass: [143, 182, 196],
};

interface Tri {
  /** Screen x/y and depth, per corner. */
  p: [number, number, number][];
  rgb: [number, number, number];
  shade: number;
}

/** Every triangle in the document, in world space, with its slot name. */
function trianglesOf(doc: Document) {
  const out: { a: number[]; b: number[]; c: number[]; slot: string }[] = [];
  for (const node of doc.getRoot().listNodes()) {
    const mesh = node.getMesh();
    if (!mesh) continue;
    const m = node.getWorldMatrix();
    for (const prim of mesh.listPrimitives()) {
      const pos = prim.getAttribute("POSITION");
      const idx = prim.getIndices();
      if (!pos) continue;
      const slot = prim.getMaterial()?.getName() ?? "body";
      const count = idx ? idx.getCount() : pos.getCount();
      const at = (i: number) => {
        const v = [0, 0, 0];
        pos.getElement(idx ? idx.getScalar(i) : i, v);
        // Column-major 4x4, applied by hand: pulling in three here would mean
        // a second copy of the geometry in a different library's types.
        return [
          m[0] * v[0] + m[4] * v[1] + m[8] * v[2] + m[12],
          m[1] * v[0] + m[5] * v[1] + m[9] * v[2] + m[13],
          m[2] * v[0] + m[6] * v[1] + m[10] * v[2] + m[14],
        ];
      };
      for (let i = 0; i < count; i += 3) {
        out.push({ a: at(i), b: at(i + 1), c: at(i + 2), slot });
      }
    }
  }
  return out;
}

/**
 * Rasterise one orthographic view.
 *
 * `axes` picks which world axes become screen x and y, and which is depth —
 * that is the whole of what makes this a side view rather than a top one.
 */
function view(
  tris: ReturnType<typeof trianglesOf>,
  axes: { x: number; y: number; z: number; flipX?: boolean },
  bounds: { min: number[]; max: number[] },
  label: string
): Buffer {
  const spanX = bounds.max[axes.x] - bounds.min[axes.x];
  const spanY = bounds.max[axes.y] - bounds.min[axes.y];
  const scale = Math.min(W / (spanX * PAD), H / (spanY * PAD));
  const cx = (bounds.min[axes.x] + bounds.max[axes.x]) / 2;
  const cy = (bounds.min[axes.y] + bounds.max[axes.y]) / 2;

  const project = (p: number[]): [number, number, number] => {
    const sx = (p[axes.x] - cx) * (axes.flipX ? -scale : scale) + W / 2;
    // Screen y grows downward; world y grows up.
    const sy = H / 2 - (p[axes.y] - cy) * scale;
    return [sx, sy, p[axes.z]];
  };

  const px = new Uint8Array(W * H * 3);
  // A dark ground, and a horizon line at world y = 0 so "is it standing on the
  // floor" is a thing you can see rather than measure.
  for (let i = 0; i < W * H; i++) {
    px[i * 3] = 18;
    px[i * 3 + 1] = 20;
    px[i * 3 + 2] = 24;
  }
  const depth = new Float32Array(W * H).fill(Infinity);

  const shaped: Tri[] = tris.map((t) => {
    const p = [project(t.a), project(t.b), project(t.c)];
    // Flat shading off the world-space face normal, lit from up and to the
    // front — enough to read a silhouette as a shape.
    const u = [t.b[0] - t.a[0], t.b[1] - t.a[1], t.b[2] - t.a[2]];
    const v = [t.c[0] - t.a[0], t.c[1] - t.a[1], t.c[2] - t.a[2]];
    const n = [
      u[1] * v[2] - u[2] * v[1],
      u[2] * v[0] - u[0] * v[2],
      u[0] * v[1] - u[1] * v[0],
    ];
    const len = Math.hypot(n[0], n[1], n[2]) || 1;
    const L = [0.35, 0.78, 0.52];
    const d = Math.abs((n[0] * L[0] + n[1] * L[1] + n[2] * L[2]) / len);
    return { p, rgb: SLOT_RGB[t.slot] ?? [255, 0, 255], shade: 0.32 + 0.68 * d };
  });

  for (const t of shaped) {
    const [a, b, c] = t.p;
    const minX = Math.max(0, Math.floor(Math.min(a[0], b[0], c[0])));
    const maxX = Math.min(W - 1, Math.ceil(Math.max(a[0], b[0], c[0])));
    const minY = Math.max(0, Math.floor(Math.min(a[1], b[1], c[1])));
    const maxY = Math.min(H - 1, Math.ceil(Math.max(a[1], b[1], c[1])));
    const area = (b[0] - a[0]) * (c[1] - a[1]) - (c[0] - a[0]) * (b[1] - a[1]);
    if (Math.abs(area) < 1e-9) continue;

    for (let y = minY; y <= maxY; y++) {
      for (let x = minX; x <= maxX; x++) {
        const px0 = x + 0.5;
        const py0 = y + 0.5;
        // Barycentric coverage, which also gives the depth interpolation for
        // free — the z-buffer is what stops the far side of the fairing
        // painting over the near side.
        const w0 = ((b[0] - a[0]) * (py0 - a[1]) - (px0 - a[0]) * (b[1] - a[1])) / area;
        const w1 = ((px0 - a[0]) * (c[1] - a[1]) - (c[0] - a[0]) * (py0 - a[1])) / area;
        const w2 = 1 - w0 - w1;
        if (w0 < 0 || w1 < 0 || w2 < 0) continue;
        const z = a[2] * w2 + b[2] * w1 + c[2] * w0;
        const i = y * W + x;
        if (z >= depth[i]) continue;
        depth[i] = z;
        px[i * 3] = Math.min(255, t.rgb[0] * t.shade);
        px[i * 3 + 1] = Math.min(255, t.rgb[1] * t.shade);
        px[i * 3 + 2] = Math.min(255, t.rgb[2] * t.shade);
      }
    }
  }

  // The floor line, drawn last so it sits over the model like a ruler.
  const floorY = Math.round(H / 2 - (0 - cy) * scale);
  if (floorY >= 0 && floorY < H) {
    for (let x = 0; x < W; x += 4) {
      const i = floorY * W + x;
      px[i * 3] = 220;
      px[i * 3 + 1] = 80;
      px[i * 3 + 2] = 80;
    }
  }
  // A one-unit tick from the origin along screen x, so scale is readable.
  const originX = Math.round(W / 2 - cx * scale);
  for (let d = 0; d <= Math.round(scale); d++) {
    const y = Math.min(H - 1, floorY + 6);
    const i = y * W + Math.min(W - 1, Math.max(0, originX + d));
    px[i * 3] = 90;
    px[i * 3 + 1] = 200;
    px[i * 3 + 2] = 120;
  }

  void label;
  return Buffer.from(px);
}

async function main() {
  const io = new NodeIO().registerExtensions(ALL_EXTENSIONS).registerDependencies({
    "draco3d.decoder": await draco3d.createDecoderModule(),
  });
  const doc = await io.read(IN);
  const tris = trianglesOf(doc);
  if (tris.length === 0) throw new Error(`${IN} has no triangles`);

  const min = [Infinity, Infinity, Infinity];
  const max = [-Infinity, -Infinity, -Infinity];
  for (const t of tris) {
    for (const p of [t.a, t.b, t.c]) {
      for (let i = 0; i < 3; i++) {
        if (p[i] < min[i]) min[i] = p[i];
        if (p[i] > max[i]) max[i] = p[i];
      }
    }
  }
  const bounds = { min, max };

  // Side (looking down -X, so +Z runs right), front (looking down -Z), top.
  const views = [
    view(tris, { x: 2, y: 1, z: 0 }, bounds, "side: +Z to the right"),
    view(tris, { x: 0, y: 1, z: 2 }, bounds, "front: looking at +Z"),
    view(tris, { x: 2, y: 0, z: 1 }, bounds, "top"),
  ];

  const tiles = await Promise.all(
    views.map((raw) =>
      sharp(raw, { raw: { width: W, height: H, channels: 3 } }).png().toBuffer()
    )
  );

  mkdirSync(dirname(OUT), { recursive: true });
  await sharp({
    create: { width: W, height: H * 3, channels: 3, background: { r: 8, g: 9, b: 11 } },
  })
    .composite(tiles.map((input, i) => ({ input, top: i * H, left: 0 })))
    .png()
    .toFile(OUT);

  console.log(`${tris.length} triangles from ${IN}`);
  console.log(`bounds  x ${min[0].toFixed(2)}..${max[0].toFixed(2)}`);
  console.log(`        y ${min[1].toFixed(2)}..${max[1].toFixed(2)}`);
  console.log(`        z ${min[2].toFixed(2)}..${max[2].toFixed(2)}`);
  console.log(`wrote ${OUT} — three views, top to bottom: side (+Z right), front, top`);
  console.log(`red dashes = world y 0 (the floor); green tick = one world unit`);
}

main().catch((e) => {
  console.error(e instanceof Error ? e.stack : e);
  process.exit(1);
});
