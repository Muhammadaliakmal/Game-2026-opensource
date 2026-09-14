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
/**
 * The default light offset: high and to one side, a generic "afternoon".
 *
 * MAP_V2 replaces this with the real sun direction from lib/atmosphere.ts, so
 * the shadows fall the way the visible sun says they should. Kept as the
 * default because the editor, Play and the hero canvas have no sky of their
 * own and a 7-degree sun would give them shadows several times longer than
 * anything casting them.
 */
const DEFAULT_OFFSET = new THREE.Vector3(24, 36, 15);

export function FollowSun({
  getFocus,
  extent = 36,
  /**
   * Direction from the scene toward the light, as a unit vector. Scaled by
   * `distance` to place the light. Omit for the default afternoon offset.
   */
  sunDir,
  /**
   * How far along `sunDir` the light sits.
   *
   * It matters more than it looks. A directional light's shadow camera is
   * orthographic, so this does not change the shadow's shape — but the light
   * has to stay inside `shadow-camera-far`, and at a low sun elevation the
   * distance needed to get any height at all grows fast (height = distance x
   * sin(elevation), so 7 degrees needs eight times the distance for the same
   * height as 60 degrees).
   */
  distance = 130,
  /** Defaults are the neutral daylight the editor and Play have always had. */
  color = "#ffffff",
  intensity = 1.8,
}: {
  getFocus: () => THREE.Vector3 | null | undefined;
  extent?: number;
  sunDir?: THREE.Vector3;
  distance?: number;
  color?: string;
  intensity?: number;
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

  // Resolved once per render rather than per frame: `sunDir` drifts by a
  // fraction of a degree over a whole race, which cannot move a light that is
  // snapped to whole units anyway.
  const offset = useMemo(
    () => (sunDir ? sunDir.clone().normalize().multiplyScalar(distance) : DEFAULT_OFFSET),
    [sunDir, distance]
  );

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
    l.position.set(x + offset.x, y + offset.y, z + offset.z);
    l.updateMatrixWorld();
  });

  return (
    <directionalLight
      ref={light}
      target={target}
      position={[offset.x, offset.y, offset.z]}
      color={color}
      intensity={intensity}
      // 0 is "off", not a zero-sized map: a player can switch shadows off in
      // Settings, and the tier field documents 0 as disabling them.
      castShadow={shadowMap > 0}
      shadow-mapSize={[Math.max(shadowMap, 1), Math.max(shadowMap, 1)]}
      shadow-camera-left={-extent}
      shadow-camera-right={extent}
      shadow-camera-top={extent}
      shadow-camera-bottom={-extent}
      shadow-camera-near={1}
      // Derived, not a constant. The light sits `distance` from the focus and
      // the scene extends `extent` past it in every direction, so a hardcoded
      // far plane silently clips the shadow the moment either is changed —
      // and a clipped shadow camera does not error, it just stops drawing
      // shadows for the far half of the scene.
      shadow-camera-far={distance + extent * 2}
      // Chamfered blocks self-shadow badly at grazing angles without this.
      shadow-normalBias={0.04}
    />
  );
}
