"use client";

import * as THREE from "three";
import { useEffect, useMemo, useRef } from "react";
import { useFrame } from "@react-three/fiber";
import { SUN_SPRITE_DISTANCE, SUN_SPRITE_SIZE } from "@/lib/atmosphere";

/**
 * The visible sun.
 *
 * MAP.md §4.3 is specific that this must be a real mesh rather than something
 * the dome shader draws, and the reason is GodRays: the effect needs an actual
 * object in the scene to occlusion-test against. A disc painted into the sky
 * gradient has no geometry for it to anchor to.
 *
 * Generated rather than downloaded. A radial gradient is four lines of canvas
 * work and the alternative is shipping a PNG of a blurry circle.
 */

/** The disc: a hot core, a fast falloff, and a wide faint bloom skirt. */
function makeSunTexture(): THREE.CanvasTexture {
  const S = 128;
  const canvas = document.createElement("canvas");
  canvas.width = canvas.height = S;
  const ctx = canvas.getContext("2d")!;

  const g = ctx.createRadialGradient(S / 2, S / 2, 0, S / 2, S / 2, S / 2);
  // Three stops rather than two: a straight white-to-transparent ramp reads as
  // a soft blob, and the sun needs a hard bright centre to look like a light
  // source rather than a smudge.
  g.addColorStop(0.0, "rgba(255,255,250,1)");
  g.addColorStop(0.12, "rgba(255,238,205,1)");
  g.addColorStop(0.3, "rgba(255,180,120,0.55)");
  g.addColorStop(1.0, "rgba(255,150,90,0)");

  ctx.fillStyle = g;
  ctx.fillRect(0, 0, S, S);

  const tex = new THREE.CanvasTexture(canvas);
  // Additive blending multiplies by the source, so this is colour data and
  // must be tagged sRGB or the sun comes out a dull orange.
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

export function SunSprite({ sunDir }: { sunDir: React.RefObject<THREE.Vector3> }) {
  const mesh = useRef<THREE.Mesh>(null);
  const texture = useMemo(() => makeSunTexture(), []);

  // Created imperatively, so it is disposed imperatively. R3F disposes what it
  // created from JSX; a CanvasTexture built in a useMemo is not that.
  useEffect(() => () => texture.dispose(), [texture]);

  useFrame(({ camera }) => {
    const m = mesh.current;
    if (!m) return;
    m.position
      .copy(sunDir.current)
      .multiplyScalar(SUN_SPRITE_DISTANCE)
      .add(camera.position);
    // A billboard, so it is a disc from every angle rather than an ellipse
    // from most of them.
    m.quaternion.copy(camera.quaternion);
  });

  return (
    <mesh ref={mesh} renderOrder={-900} frustumCulled={false}>
      <planeGeometry args={[SUN_SPRITE_SIZE, SUN_SPRITE_SIZE]} />
      <meshBasicMaterial
        map={texture}
        transparent
        // Additive, because the sun is light being added to the sky behind it,
        // not a surface sitting in front of it. Alpha blending here gives a
        // visible grey rim where the sprite's edge meets the gradient.
        blending={THREE.AdditiveBlending}
        depthWrite={false}
        depthTest={false}
        fog={false}
        toneMapped={false}
      />
    </mesh>
  );
}
