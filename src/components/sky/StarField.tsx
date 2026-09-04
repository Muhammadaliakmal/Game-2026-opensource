"use client";

import * as THREE from "three";
import { useEffect, useMemo, useRef } from "react";
import { useFrame } from "@react-three/fiber";
import {
  STAR_FRAGMENT,
  STAR_VERTEX,
  advanceStars,
  makeStarGeometry,
  makeStarUniforms,
} from "./star-field";

/**
 * The stars.
 *
 * ── One draw call, whatever the count ────────────────────────────────────
 *
 * A `Points` cloud with a shader material. The obvious alternative — a small
 * sprite per star — would be thirteen hundred objects, thirteen hundred matrix
 * updates and thirteen hundred draw calls, against a measured budget of about
 * sixty for the entire race. This is one buffer, uploaded once, and the only
 * thing that changes per frame is a float.
 *
 * The buffer and the shaders are in `star-field.ts`; this file is the mount,
 * the per-frame uniform write, and nothing else.
 *
 * ── Why they are drawn without depth ─────────────────────────────────────
 *
 * The same reason the dome is: this is welded to the camera and stands in for
 * infinity, so it must never be occlusion-tested against real geometry that is
 * nominally further away. Draw order alone keeps it behind the world — after
 * the dome (-1000), before everything else.
 */
export function StarField() {
  const points = useRef<THREE.Points>(null);

  const geometry = useMemo(() => makeStarGeometry(), []);
  const uniforms = useMemo(() => makeStarUniforms(), []);

  // Built imperatively, so disposed imperatively: R3F disposes what it created
  // from JSX, and a BufferGeometry out of a useMemo is not that.
  useEffect(() => () => geometry.dispose(), [geometry]);

  useFrame(({ camera, gl, clock }) => {
    const p = points.current;
    if (!p) return;
    p.position.copy(camera.position);
    // The pixel ratio is read per frame rather than once: it comes from the
    // quality tier and changes when the player overrides it, and a stale value
    // here is a starfield at half or double size.
    advanceStars(uniforms, clock.elapsedTime, gl.getPixelRatio());
  });

  return (
    <points
      ref={points}
      geometry={geometry}
      // After the dome, before the world. See the header.
      renderOrder={-999}
      frustumCulled={false}
    >
      <shaderMaterial
        vertexShader={STAR_VERTEX}
        fragmentShader={STAR_FRAGMENT}
        uniforms={uniforms as unknown as Record<string, THREE.IUniform>}
        transparent
        depthWrite={false}
        // Depth-TESTED, unlike the dome, and this is the one place the two
        // differ. three draws every opaque object before any transparent one
        // and only sorts by renderOrder within each group — so the dome (which
        // is opaque) really does go first, but these are transparent and would
        // otherwise paint over every solid block in the level. Testing against
        // the depth the world has already written puts them behind it, which
        // is also simply correct: they sit at STAR_RADIUS, inside the far
        // plane, so the comparison is meaningful rather than a trick.
        depthTest
        // Additive, so a star over the black zenith is the brightest thing
        // there and a star over the blue horizon band merely lifts it.
        blending={THREE.AdditiveBlending}
        // The sky is what fog fades into; fogging the stars would grey them
        // toward the horizon colour on top of the fade they already have.
        fog={false}
      />
    </points>
  );
}
