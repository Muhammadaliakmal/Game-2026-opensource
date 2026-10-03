"use client";

import * as THREE from "three";
import { RoomEnvironment } from "three/examples/jsm/environments/RoomEnvironment.js";

/**
 * `RoomEnvironment` through PMREM — the studio probe every canvas lights
 * metal with (see CLAUDE.md, "The sky") — without freezing the page.
 *
 * `pmrem.fromScene()` links six programs and draws with each immediately,
 * and the first draw of a program waits for the GPU to finish compiling it.
 * The GGX convolution's sample loop is the expensive one: measured on the
 * landing hero, 2.1 s of a 2.8 s main-thread stall under a phone-class CPU,
 * and about a second unthrottled on a Windows desktop, where ANGLE hands
 * every shader to the D3D compiler.
 *
 * three has no async PMREM, but its program cache makes one possible. A
 * program is reused by any material whose cache key matches, and a link only
 * blocks when it is *used* before it finishes. So: link the same programs
 * under the same state `fromScene` will use (a linear half-float target, no
 * tone mapping), wait for `KHR_parallel_shader_compile` to say they are done
 * — `compileAsync` does that polling — and only then call `fromScene`,
 * which finds every program ready.
 *
 * The blur and GGX materials are private to the generator, but one
 * generator keeps them across calls for the same size, so this allocates
 * them on the instance it then uses. Those private methods are guarded: if
 * a three upgrade renames them, this falls back to the plain blocking
 * `fromScene`, which is exactly what it replaced.
 */

type PmremInternals = {
  _setSize?: (cubeSize: number) => void;
  _allocateTargets?: () => THREE.WebGLRenderTarget;
  _pingPongRenderTarget?: THREE.WebGLRenderTarget | null;
  _blurMaterial?: THREE.Material | null;
  _ggxMaterial?: THREE.Material | null;
  _lodMeshes?: THREE.Mesh[];
};

/** `fromScene`'s default size; the warm-up must allocate for the same one. */
const SIZE = 256;

/**
 * Links fromScene's programs and waits for them. Returns what to release
 * once fromScene has run — not before: three destroys a program when the
 * last material using it is disposed, so freeing the backdrop material here
 * would throw away the very program fromScene is about to need.
 */
async function warm(
  gl: THREE.WebGLRenderer,
  pmrem: THREE.PMREMGenerator,
  room: THREE.Scene
): Promise<() => void> {
  const p = pmrem as unknown as PmremInternals;
  if (typeof p._setSize !== "function" || typeof p._allocateTargets !== "function") {
    return () => {};
  }

  p._setSize(SIZE);
  const scratch = p._allocateTargets();
  const target = p._pingPongRenderTarget ?? scratch;

  // What `_sceneToCubeUV` draws besides the scene: a backdrop box in the
  // clear colour. Same material options, so the same program.
  const boxMaterial = new THREE.MeshBasicMaterial({
    side: THREE.BackSide,
    depthWrite: false,
    depthTest: false,
  });
  const box = new THREE.BoxGeometry();
  const extras = new THREE.Scene();
  extras.add(new THREE.Mesh(box, boxMaterial));
  // On the generator's own plane geometry: a program's key includes which
  // attributes the geometry has, so an empty stand-in links a different one.
  const plane = p._lodMeshes?.[0]?.geometry ?? new THREE.BufferGeometry();
  for (const m of [p._blurMaterial, p._ggxMaterial]) {
    if (m) extras.add(new THREE.Mesh(plane, m));
  }

  const camera = new THREE.PerspectiveCamera(90, 1, 0.1, 100);
  const prevTarget = gl.getRenderTarget();
  const prevTone = gl.toneMapping;
  let pending: Promise<unknown>[];
  try {
    // The state the program keys are built from is read synchronously
    // inside compileAsync, so it only has to hold for this call.
    gl.setRenderTarget(target);
    gl.toneMapping = THREE.NoToneMapping;
    pending = [gl.compileAsync(room, camera), gl.compileAsync(extras, camera)];
  } finally {
    gl.setRenderTarget(prevTarget);
    gl.toneMapping = prevTone;
  }
  await Promise.all(pending);

  return () => {
    scratch.dispose();
    box.dispose();
    boxMaterial.dispose();
  };
}

/** The room probe as a scene environment, prepared without blocking. */
export async function roomEnvironmentAsync(
  gl: THREE.WebGLRenderer,
  sigma = 0.04
): Promise<THREE.Texture> {
  const pmrem = new THREE.PMREMGenerator(gl);
  const room = new RoomEnvironment();
  let release = () => {};
  try {
    release = await warm(gl, pmrem, room);
  } catch {
    // fromScene below works either way, only slower.
  }
  const env = pmrem.fromScene(room, sigma).texture;
  release();
  pmrem.dispose();
  return env;
}
