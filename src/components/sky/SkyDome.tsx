"use client";

import * as THREE from "three";
import { useMemo, useRef } from "react";
import { useFrame } from "@react-three/fiber";
import { SKY_RADIUS, SUNSET_LOOK, type SkyLook } from "@/lib/atmosphere";
import { makeSkyUniforms, skyFragmentShader, skyVertexShader } from "./sky-shader";

/**
 * The visible sky: a hand-authored gradient on an inverted sphere.
 *
 * MAP.md §4.2 layer 1. Not drei's <Sky>, which is a Preetham atmospheric model
 * — physically reasonable for daytime, but it renders sunsets washed-out and
 * gives no control at all over where the rose band sits or how wide it is,
 * which is the entire art direction of this scene.
 *
 * The gradient itself is in sky-shader.ts, shared with the environment map so
 * the sky and its own reflections cannot drift apart. The stops are in
 * lib/atmosphere.ts, and scripts/render-sky.ts draws them to a PNG so the ramp
 * can be judged without a browser.
 */
export function SkyDome({
  sunDir,
  /** Which sky to paint. See lib/atmosphere.ts. */
  look = SUNSET_LOOK,
}: {
  sunDir: React.RefObject<THREE.Vector3>;
  look?: SkyLook;
}) {
  const mesh = useRef<THREE.Mesh>(null);
  const uniforms = useMemo(() => makeSkyUniforms(look), [look]);
  const fragmentShader = useMemo(() => skyFragmentShader(true), []);

  useFrame(({ camera }) => {
    const m = mesh.current;
    if (!m) return;
    // Welded to the camera. This is what lets a 700-unit dome stand in for an
    // infinite sky inside a 900-unit far plane — see SKY_RADIUS.
    m.position.copy(camera.position);
    uniforms.uSunDir.value.copy(sunDir.current);
  });

  return (
    <mesh
      ref={mesh}
      // Before everything. With depthWrite and depthTest both off, draw order
      // is the only thing keeping the sky behind the world.
      renderOrder={-1000}
      frustumCulled={false}
    >
      {/* Modest segment count: this is a smooth gradient with no high-frequency
          detail anywhere on it, and the banding people reach for more segments
          to fix comes from 8-bit colour, not from geometry. */}
      <sphereGeometry args={[SKY_RADIUS, 32, 20]} />
      <shaderMaterial
        vertexShader={skyVertexShader}
        fragmentShader={fragmentShader}
        uniforms={uniforms as unknown as Record<string, THREE.IUniform>}
        side={THREE.BackSide}
        depthWrite={false}
        depthTest={false}
        // The sky is what the fog fades INTO. Fogging it would fade it into
        // itself, washing the whole gradient toward the horizon colour.
        fog={false}
      />
    </mesh>
  );
}
