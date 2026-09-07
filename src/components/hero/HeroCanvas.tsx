"use client";

import * as THREE from "three";
import { RoomEnvironment } from "three/examples/jsm/environments/RoomEnvironment.js";
import { useCallback, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Canvas, type ThreeEvent } from "@react-three/fiber";
import { OrbitControls } from "@react-three/drei";
import { InstancedWorld } from "@/components/play/InstancedWorld";
import { FollowSun } from "@/components/FollowSun";
import { cellFromHit } from "@/lib/grid";
import { PALETTE, type PartTuple } from "@/lib/worlddoc";
import { heroParts, heroWorldDoc } from "@/lib/hero-world";
import { DRAFT_ID, hasDraft, saveDraft } from "@/lib/draft";
import { sfxPlace } from "@/lib/audio";

/**
 * The landing page hero: a real, live Blockworld world you can turn and build
 * on before you have read a word (UI spec §3.1).
 *
 * It is deliberately NOT the editor. No store, no undo stack, no toolbar —
 * just the renderer, an orbit camera and one interaction, because the job here
 * is to make the product legible in three seconds, not to be usable for real
 * work. Anything the visitor does place follows them into the editor.
 */

// A few cheerful indices to cycle through, so successive clicks are not one
// flat colour and the palette is visibly part of the product.
const CLICK_COLOURS = [8, 13, 20, 26, 16, 6];

/** Drag further than this and it was a camera move, not a placement. */
const CLICK_SLOP_PX = 6;

export default function HeroCanvas() {
  const router = useRouter();
  const [parts, setParts] = useState<PartTuple[]>(() => heroParts());
  const [placed, setPlaced] = useState(0);

  // Where the pointer went down, to tell a click from an orbit drag. In a ref
  // because it changes on every pointer event and nothing renders from it.
  const down = useRef<{ x: number; y: number } | null>(null);
  const focus = useRef(new THREE.Vector3(0, 3, 0));

  const onPointerDown = useCallback((e: ThreeEvent<PointerEvent>) => {
    down.current = { x: e.clientX, y: e.clientY };
  }, []);

  const onPointerUp = useCallback((e: ThreeEvent<PointerEvent>) => {
    const start = down.current;
    down.current = null;
    if (!start) return;
    // Left button only, and only if the pointer stayed put — otherwise the
    // visitor was turning the world and would not expect a block.
    if (e.button !== 0) return;
    if (Math.hypot(e.clientX - start.x, e.clientY - start.y) > CLICK_SLOP_PX) return;

    const hit = {
      point: e.point,
      face: e.face,
      instanceId: e.instanceId,
      object: e.object,
    } as unknown as THREE.Intersection;
    const [x, y, z] = cellFromHit(hit, true);

    setParts((prev) => {
      if (prev.some((p) => p[0] === x && p[1] === y && p[2] === z)) return prev;
      const colour = CLICK_COLOURS[prev.length % CLICK_COLOURS.length];
      return [...prev, [x, y, z, 0, colour, 0, 0] as PartTuple];
    });
    setPlaced((n) => n + 1);
    sfxPlace();
  }, []);

  /**
   * Carry the visitor's blocks into the editor.
   *
   * Whatever they just built is the most persuasive thing on the page, so it
   * should not evaporate on navigation — but an existing draft is a real
   * unclaimed build and must never be overwritten by a landing-page doodle.
   */
  const startBuilding = useCallback(() => {
    if (placed > 0 && !hasDraft()) {
      saveDraft(heroWorldDoc(parts, DRAFT_ID));
    }
    router.push("/build/new");
  }, [parts, placed, router]);

  return (
    <div className="relative h-[55dvh] max-h-[34rem] min-h-[min(20rem,55dvh)] w-full">
      <Canvas
        frameloop="demand"
        shadows
        camera={{ position: [14, 11, 14], fov: 45 }}
        gl={{ powerPreference: "high-performance" }}
        onCreated={({ scene, gl }) => {
          scene.background = new THREE.Color("#14171a");
          const pmrem = new THREE.PMREMGenerator(gl);
          scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
          scene.environmentIntensity = 0.4;
          pmrem.dispose();
          gl.toneMapping = THREE.ACESFilmicToneMapping;
          gl.toneMappingExposure = 1.05;
        }}
      >
        <hemisphereLight args={["#c8d2dd", "#1a1d21", 1.15]} />
        <FollowSun getFocus={() => focus.current} extent={18} />

        <group onPointerDown={onPointerDown} onPointerUp={onPointerUp}>
          <InstancedWorld parts={parts} />
        </group>

        <OrbitControls
          makeDefault
          target={[0, 3, 0]}
          enablePan={false}
          maxPolarAngle={Math.PI / 2 - 0.05}
          minDistance={12}
          maxDistance={34}
          enableDamping
          dampingFactor={0.12}
          // Slow idle rotation until the visitor takes over, so the scene
          // reads as live rather than as a screenshot.
          autoRotate={placed === 0}
          autoRotateSpeed={0.35}
        />
      </Canvas>

      {/* One prompt, and only until it has been acted on. */}
      <div className="pointer-events-none absolute inset-x-0 bottom-3 flex flex-col items-center gap-2 px-3">
        {placed === 0 && (
          <div className="hud-panel text-dim px-3 py-2 text-2xs">
            Click anywhere to place a block · drag to turn
          </div>
        )}
        {placed === 1 && (
          <div className="hud-panel text-dim px-3 py-2 text-2xs">
            That is the whole idea. Place another.
          </div>
        )}
        {placed >= 2 && (
          <button
            onClick={startBuilding}
            className="hud-chip hud-chip--primary panel-enter pointer-events-auto px-5 py-2.5"
          >
            Keep building this →
          </button>
        )}
      </div>

      {/* A quiet swatch strip: the palette is the product, and showing it
          costs nothing here. */}
      <div className="pointer-events-none absolute top-3 left-3 flex gap-1">
        {CLICK_COLOURS.map((i) => (
          <span
            key={i}
            className="h-2.5 w-2.5"
            style={{ background: PALETTE[i] }}
            aria-hidden
          />
        ))}
      </div>
    </div>
  );
}
