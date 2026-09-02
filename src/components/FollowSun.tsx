"use client";

import * as THREE from "three";
import { useEffect, useMemo, useRef } from "react";
import { useFrame, useThree } from "@react-three/fiber";
import { useRenderQuality } from "@/lib/quality";

/**
 * The key light, with its shadow camera kept over whatever the player is
 * looking at.
 *
 * A directional light's shadow camera is a fixed box. Both canvases used to
 * pin one at the origin — the editor at three.js's default ±5, so *shadows
 * only existed within 10 units of the origin*, and Play at ±40, which the
 * parkour course (x up to 90) runs clean out of. Widening the box instead
 * would trade that for mush: the same 2048 map stretched over a bigger area.
 *
 * So the box follows the focus point and stays tight. Snapping the focus to
 * whole units keeps the depth map from crawling as it slides — and this world
 * is on an integer grid anyway, so a whole unit is the natural quantum.
 */
export function FollowSun({
  getFocus,
  extent = 36,
}: {
  getFocus: () => THREE.Vector3 | null | undefined;
  extent?: number;
}) {
  const light = useRef<THREE.DirectionalLight>(null);
  const scene = useThree((s) => s.scene);
  // The sun follows the player, so its shadow map is re-rendered on most
  // frames — which makes its size one of the few numbers that matters on a
  // phone. Decided by device class in lib/quality.ts, not here.
  const { shadowMap } = useRenderQuality();
  // The light aims at this rather than at the origin; three needs the target
  // to be in the scene graph for its world matrix to update.
  const target = useMemo(() => new THREE.Object3D(), []);

  useEffect(() => {
    scene.add(target);
    return () => {
      scene.remove(target);
    };
  }, [scene, target]);

  useFrame(() => {
    const focus = getFocus();
    const l = light.current;
    if (!focus || !l) return;

    const x = Math.round(focus.x);
    const y = Math.round(focus.y);
    const z = Math.round(focus.z);
    const t = target.position;
    if (t.x === x && t.y === y && t.z === z) return;

    t.set(x, y, z);
    target.updateMatrixWorld();
    l.position.set(x + 24, y + 36, z + 15);
    l.updateMatrixWorld();
  });

  return (
    <directionalLight
      ref={light}
      target={target}
      position={[24, 36, 15]}
      intensity={1.8}
      castShadow
      shadow-mapSize={[shadowMap, shadowMap]}
      shadow-camera-left={-extent}
      shadow-camera-right={extent}
      shadow-camera-top={extent}
      shadow-camera-bottom={-extent}
      shadow-camera-near={1}
      shadow-camera-far={180}
      // Chamfered blocks self-shadow badly at grazing angles without this.
      shadow-normalBias={0.04}
    />
  );
}
