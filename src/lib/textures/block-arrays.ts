"use client";

import * as THREE from "three";
import { useSyncExternalStore } from "react";
import { TEXTURES } from "@/lib/texture-list";

/**
 * The block surface textures, as two DataArrayTextures for the whole game.
 *
 * ── Why an array and not an atlas ───────────────────────────────────────
 *
 * An atlas packs every surface into one image and offsets UVs into it. At
 * distance the GPU averages neighbouring pixels across a mip level, so grass
 * starts sampling the stone beside it and every block grows a dirty fringe.
 * Padding reduces it; nothing removes it. A texture array keeps each surface
 * in its own layer, and layers never sample each other — full mipmapping and
 * anisotropy with no bleeding at all. three r185 is WebGL2-only, so there is
 * no WebGL1 to fall back for.
 *
 * ── Why a module singleton ───────────────────────────────────────────────
 *
 * Same rule as `block-materials.ts`: the key space is fixed (there is one
 * strip), the arrays outlive any canvas, and disposing them on unmount would
 * only mean re-decoding 625 KB the next time a world opens. They are loaded
 * once per page lifetime and read from React through `useSyncExternalStore`,
 * which is the repo's way to read a value that lives outside React.
 *
 * ── What is in them ──────────────────────────────────────────────────────
 *
 * `surface`: R = tint luminance × AO, G = roughness, both normalised so 0.5
 * is the identity (the shader doubles them). `normal`: the GL normal. Both
 * are DATA — `NoColorSpace` — because the shader reads them as multipliers
 * and slopes, never as colours. Giving the surface strip sRGB would gamma-
 * bend every multiplier and darken every textured block.
 */
export interface BlockArrays {
  surface: THREE.DataArrayTexture;
  normal: THREE.DataArrayTexture;
  /** Edge of one tile, px. */
  tile: number;
  /** layers[i] is the surface name for texture index i. */
  layers: string[];
  /** The Part 8 detail noise, a plain 2D texture. */
  detail: THREE.Texture;
}

interface Manifest {
  tile: number;
  layers: string[];
}

const BASE = "/textures/generated";

type State =
  | { status: "idle" }
  | { status: "loading" }
  | { status: "ready"; arrays: BlockArrays }
  | { status: "failed"; error: unknown };

let state: State = { status: "idle" };
const listeners = new Set<() => void>();
let anisotropy = 1;

function notify() {
  for (const fn of listeners) fn();
}

/** Decode an image to raw RGBA without the browser colour-managing it. */
async function pixelsOf(url: string): Promise<{ data: Uint8ClampedArray; width: number; height: number }> {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`${url}: HTTP ${res.status}`);
  const bitmap = await createImageBitmap(await res.blob(), {
    // The strip is data, not a picture. Every conversion the browser could
    // apply — orientation, colour profile, premultiplied alpha — would corrupt
    // a multiplier or a normal.
    imageOrientation: "none",
    premultiplyAlpha: "none",
    colorSpaceConversion: "none",
  });
  const { width, height } = bitmap;
  const canvas =
    typeof OffscreenCanvas !== "undefined"
      ? new OffscreenCanvas(width, height)
      : Object.assign(document.createElement("canvas"), { width, height });
  const ctx = canvas.getContext("2d", { willReadFrequently: true }) as
    | OffscreenCanvasRenderingContext2D
    | CanvasRenderingContext2D
    | null;
  if (!ctx) throw new Error("2D canvas unavailable");
  ctx.drawImage(bitmap, 0, 0);
  const { data } = ctx.getImageData(0, 0, width, height);
  bitmap.close();
  return { data, width, height };
}

function arrayTexture(
  data: Uint8ClampedArray,
  tile: number,
  count: number
): THREE.DataArrayTexture {
  const tex = new THREE.DataArrayTexture(new Uint8Array(data.buffer), tile, tile, count);
  tex.format = THREE.RGBAFormat;
  tex.type = THREE.UnsignedByteType;
  tex.colorSpace = THREE.NoColorSpace;
  // Linear, not Nearest: these are photographic tint maps, not pixel art, and
  // a 256px tile magnified to a block at arm's length would show its texels.
  tex.magFilter = THREE.LinearFilter;
  tex.minFilter = THREE.LinearMipmapLinearFilter;
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.generateMipmaps = true;
  tex.anisotropy = anisotropy;
  tex.needsUpdate = true;
  return tex;
}

async function load(): Promise<BlockArrays> {
  const manifest = (await (await fetch(`${BASE}/block_manifest.json`)).json()) as Manifest;
  const { tile, layers } = manifest;

  // The document was written against TEXTURES; the strip was built from it.
  // A strip from a stale build must not be silently sampled by the wrong
  // index — that would quietly retexture every world.
  const expected = TEXTURES.map((t) => t.name);
  if (layers.length !== expected.length || layers.some((l, i) => l !== expected[i])) {
    throw new Error(
      `block_manifest.json lists [${layers.join(", ")}] but TEXTURES is [${expected.join(", ")}] — run \`npm run textures\``
    );
  }

  const [surfacePx, normalPx, detailTex] = await Promise.all([
    pixelsOf(`${BASE}/block_surface.jpg`),
    pixelsOf(`${BASE}/block_normal.jpg`),
    new THREE.TextureLoader().loadAsync(`${BASE}/detail_noise.png`),
  ]);
  const count = layers.length;
  for (const px of [surfacePx, normalPx]) {
    if (px.width !== tile || px.height !== tile * count) {
      throw new Error(`strip is ${px.width}×${px.height}, expected ${tile}×${tile * count}`);
    }
  }

  detailTex.colorSpace = THREE.NoColorSpace;
  detailTex.wrapS = detailTex.wrapT = THREE.RepeatWrapping;
  detailTex.minFilter = THREE.LinearMipmapLinearFilter;
  detailTex.magFilter = THREE.LinearFilter;
  detailTex.anisotropy = anisotropy;
  detailTex.needsUpdate = true;

  return {
    surface: arrayTexture(surfacePx.data, tile, count),
    normal: arrayTexture(normalPx.data, tile, count),
    tile,
    layers,
    detail: detailTex,
  };
}

function ensureLoading() {
  if (state.status !== "idle") return;
  if (typeof window === "undefined") return;
  state = { status: "loading" };
  load().then(
    (arrays) => {
      state = { status: "ready", arrays };
      notify();
    },
    (error) => {
      // Fail closed to the untextured look, which is what the game was until
      // this phase. Nothing waits on this; a bucket keeps its plain material.
      console.error("[textures] block arrays failed to load", error);
      state = { status: "failed", error };
      notify();
    }
  );
}

function subscribe(cb: () => void) {
  listeners.add(cb);
  ensureLoading();
  return () => {
    listeners.delete(cb);
  };
}

const snapshot = (): BlockArrays | null =>
  state.status === "ready" ? state.arrays : null;

/**
 * The block arrays once loaded, null until then (and on the server).
 *
 * The first subscriber starts the download. A material built while this is
 * null is the plain, unpatched one; the bucket rebuilds it when the arrays
 * arrive, once, and never again.
 */
export function useBlockArrays(): BlockArrays | null {
  return useSyncExternalStore(subscribe, snapshot, () => null);
}

/** Start the download early — from a loading screen, before any bucket mounts. */
export function preloadBlockArrays() {
  ensureLoading();
}

/**
 * Anisotropic filtering level, from the quality tier.
 *
 * Part 4 calls this the cheapest visual upgrade in 3D, and for a voxel world
 * seen at a glancing angle down a track it is: the floor goes from a smear
 * past a few metres to sharp at the horizon. Changing it after upload needs a
 * re-upload, so a tier change costs one 5 MB transfer, once.
 */
export function setBlockArraysAnisotropy(level: number, gl: THREE.WebGLRenderer) {
  const max = gl.capabilities.getMaxAnisotropy();
  const next = Math.max(1, Math.min(level, max));
  if (next === anisotropy) return;
  anisotropy = next;
  if (state.status !== "ready") return;
  for (const tex of [state.arrays.surface, state.arrays.normal, state.arrays.detail]) {
    tex.anisotropy = next;
    tex.needsUpdate = true;
  }
}
