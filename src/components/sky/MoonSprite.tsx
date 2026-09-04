"use client";

import * as THREE from "three";
import { useEffect, useMemo, useRef } from "react";
import { useFrame } from "@react-three/fiber";
import {
  MOON_SPRITE_DISTANCE,
  MOON_SPRITE_SIZE,
  moonDirection,
} from "@/lib/atmosphere";

/**
 * The moon.
 *
 * Generated on a canvas rather than shipped as a PNG, for the same reason
 * `SunSprite` is: it is a disc with some blotches on it, and a texture nobody
 * has to download cannot be the thing that is missing on a slow connection.
 *
 * ── Why it is not the sun sprite with a different tint ───────────────────
 *
 * The sun is a light source seen through atmosphere: a hot core that blows out
 * to white and a wide soft bloom, with no visible edge at all. The moon is a
 * lit *object*: it has a definite disc, a hard limb, and features on it. Tint
 * the sun blue and you get a glowing blue smudge, which reads as a second sun
 * rather than as a moon — so this draws the disc and the halo as two separate
 * things, and only the halo is soft.
 */

/** Diameter of the drawing, in texture pixels. */
const S = 256;
/** The lit disc, as a fraction of the texture. The rest is halo. */
const DISC = 0.3;

function makeMoonTexture(): THREE.CanvasTexture {
  const canvas = document.createElement("canvas");
  canvas.width = canvas.height = S;
  const ctx = canvas.getContext("2d")!;
  const c = S / 2;
  const r = S * DISC;

  // ── Halo ───────────────────────────────────────────────────────────────
  // Wide, cool and faint. This is the part that makes it sit *in* the sky
  // rather than on top of it, and it is why the texture is much larger than
  // the disc it contains.
  const halo = ctx.createRadialGradient(c, c, r * 0.8, c, c, S / 2);
  halo.addColorStop(0.0, "rgba(150,175,255,0.34)");
  halo.addColorStop(0.35, "rgba(120,145,230,0.11)");
  halo.addColorStop(1.0, "rgba(90,110,200,0)");
  ctx.fillStyle = halo;
  ctx.fillRect(0, 0, S, S);

  // ── The disc ───────────────────────────────────────────────────────────
  // Brightest a little off-centre, toward the upper left, so the sphere reads
  // as lit from a direction instead of as a flat coin.
  const face = ctx.createRadialGradient(
    c - r * 0.25,
    c - r * 0.25,
    0,
    c,
    c,
    r
  );
  face.addColorStop(0.0, "rgba(255,255,252,1)");
  face.addColorStop(0.55, "rgba(232,238,255,1)");
  face.addColorStop(0.9, "rgba(196,208,240,1)");
  // Not transparent at the rim — a moon has an edge. The single pixel of
  // softness is anti-aliasing, not glow.
  face.addColorStop(1.0, "rgba(178,190,225,0.85)");

  ctx.save();
  ctx.beginPath();
  ctx.arc(c, c, r, 0, Math.PI * 2);
  ctx.clip();
  ctx.fillStyle = face;
  ctx.fillRect(0, 0, S, S);

  // Maria: a handful of soft darker patches. Fixed rather than random, because
  // a moon that is a different moon on every page load is a moon somebody will
  // eventually notice changing.
  const seas: [number, number, number, number][] = [
    [-0.30, -0.22, 0.30, 0.1],
    [0.16, -0.34, 0.22, 0.08],
    [0.28, 0.14, 0.34, 0.09],
    [-0.18, 0.32, 0.26, 0.07],
    [-0.02, 0.02, 0.18, 0.06],
  ];
  for (const [dx, dy, size, alpha] of seas) {
    const g = ctx.createRadialGradient(
      c + dx * r * 2,
      c + dy * r * 2,
      0,
      c + dx * r * 2,
      c + dy * r * 2,
      size * r * 2
    );
    g.addColorStop(0, `rgba(120,132,170,${alpha})`);
    g.addColorStop(1, "rgba(120,132,170,0)");
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, S, S);
  }
  ctx.restore();

  const tex = new THREE.CanvasTexture(canvas);
  // Colour data, so it must be tagged sRGB or the moon comes out dingy grey.
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

export function MoonSprite() {
  const mesh = useRef<THREE.Mesh>(null);
  const texture = useMemo(() => makeMoonTexture(), []);
  // Fixed. The sun drifts because a race is a few minutes of a sunset going
  // on; a moon that visibly moves over three laps would be the same bug the
  // sun's drift rate was chosen to avoid, only worse.
  const dir = useMemo(() => moonDirection(), []);

  // Created imperatively, disposed imperatively — R3F only disposes what it
  // built from JSX, and a CanvasTexture from a useMemo is not that.
  useEffect(() => () => texture.dispose(), [texture]);

  useFrame(({ camera }) => {
    const m = mesh.current;
    if (!m) return;
    // Anchored to the camera, like everything else in the sky: it is meant to
    // be unreachably far away, and this is how a 620-unit offset stands in for
    // that inside a 900-unit far plane.
    m.position.copy(dir).multiplyScalar(MOON_SPRITE_DISTANCE).add(camera.position);
    m.quaternion.copy(camera.quaternion);
  });

  return (
    <mesh ref={mesh} renderOrder={-998} frustumCulled={false}>
      <planeGeometry args={[MOON_SPRITE_SIZE, MOON_SPRITE_SIZE]} />
      <meshBasicMaterial
        map={texture}
        transparent
        depthWrite={false}
        // Occluded by the world, for the reason given in StarField: a
        // transparent object draws after every opaque one whatever its
        // renderOrder, so without this the moon would show through the track.
        depthTest
        // Normal blending, not additive. Additive is right for the sun, which
        // is light; it would make the moon's dark maria invisible, and the
        // maria are the only thing distinguishing it from a white circle.
        toneMapped={false}
        fog={false}
      />
    </mesh>
  );
}
