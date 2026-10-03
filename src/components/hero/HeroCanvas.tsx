"use client";

import * as THREE from "three";
import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from "react";
import { useRouter } from "next/navigation";
import { Canvas, useThree, type ThreeEvent } from "@react-three/fiber";
import { OrbitControls } from "@react-three/drei";
import { InstancedWorld } from "@/components/play/InstancedWorld";
import { BlockSurfaces } from "@/components/BlockSurfaces";
import { FollowSun } from "@/components/FollowSun";
import { FrameLimiter } from "@/components/FrameLimiter";
import { useRenderQuality } from "@/lib/quality";
import { useReducedMotion } from "@/lib/motion";
import { useBlockArraysSettled } from "@/lib/textures/block-arrays";
import { roomEnvironmentAsync } from "@/lib/room-environment";
import { cellFromHit } from "@/lib/grid";
import { PALETTE, type PartTuple } from "@/lib/worlddoc";
import { NATURAL, dressParts } from "@/lib/surface-dressing";
import { heroParts, heroWorldDoc } from "@/lib/hero-world";
import { DRAFT_ID, hasDraft, saveDraft } from "@/lib/draft";
import { sfxPlace } from "@/lib/audio";
import { UGC } from "@/lib/features";
import { getPageTheme, subscribePageTheme, type Theme } from "@/lib/theme";
import { HeroSky } from "./HeroSky";
import { VoxelClouds } from "./VoxelClouds";

/**
 * The landing page hero: a real, live Spec Driven Games world you can turn and build
 * on before you have read a word (UI spec §3.1).
 *
 * It is deliberately NOT the editor. No store, no undo stack, no toolbar —
 * just the renderer, an orbit camera and one interaction, because the job here
 * is to make the product legible in three seconds, not to be usable for real
 * work. Anything the visitor does place follows them into the editor.
 *
 * ── With the builder hidden (lib/features) ───────────────────────────────
 *
 * Placement and the "keep building" door are the builder's pitch, so both go
 * when it does. What is left is the same world, still lit, still turnable,
 * still rotating on its own — a hero that shows the place off rather than one
 * that teaches a click the rest of the app then refuses to honour. The first
 * thing a visitor does here should be a thing they can keep doing.
 */

// A few cheerful indices to cycle through, so successive clicks are not one
// flat colour and the palette is visibly part of the product.
const CLICK_COLOURS = [8, 13, 20, 26, 16, 6];

/** Drag further than this and it was a camera move, not a placement. */
const CLICK_SLOP_PX = 6;

/** Where the orbit looks, and how far the camera starts on a wide screen. */
const TARGET = new THREE.Vector3(0, 3, 0);
const WIDE_DISTANCE = 22.7;
/**
 * Half the island's width plus a margin, in world units. On a portrait
 * phone it is the horizontal field of view that runs out first, so the
 * camera has to stand back far enough for this to fit across it.
 */
const ISLAND_HALF_WIDTH = 10;
const FOV = 45;

/**
 * How far back the camera stands for a viewport of this shape.
 *
 * The camera used to sit at one distance everywhere, which framed the
 * island on a 16:9 monitor and cut both its edges off on a phone held
 * upright. The horizontal half-angle is `atan(tan(vfov / 2) × aspect)`, so
 * the distance at which a half-width fits is that width over its tangent.
 * Never nearer than the wide framing, never past the orbit's own limit.
 */
export function fitDistance(aspect: number): number {
  const halfV = THREE.MathUtils.degToRad(FOV / 2);
  const tanH = Math.tan(halfV) * Math.max(aspect, 0.1);
  return THREE.MathUtils.clamp(ISLAND_HALF_WIDTH / tanH, WIDE_DISTANCE, 34);
}

/** Re-fits the camera when the canvas changes shape (a phone rotating). */
function FitCamera() {
  const camera = useThree((s) => s.camera);
  const aspect = useThree((s) => s.size.width / Math.max(1, s.size.height));
  const invalidate = useThree((s) => s.invalidate);
  useEffect(() => {
    const offset = camera.position.clone().sub(TARGET).setLength(fitDistance(aspect));
    camera.position.copy(offset.add(TARGET));
    invalidate();
  }, [aspect, camera, invalidate]);
  return null;
}

/** Hands the prepared environment to the scene — outside a hook, by design. */
function applyEnvironment(scene: THREE.Scene, env: THREE.Texture) {
  scene.environment = env;
  scene.environmentIntensity = 0.4;
}

/**
 * Prepares every shader the scene needs off the main thread, then says so.
 *
 * This is the hero's whole load cost. three compiles a program the first
 * time it draws a material, and that first draw waits for the GPU to finish
 * compiling it: measured on this page, one function held the main thread
 * for 4,975 ms on a desktop, and far longer on a phone-class CPU.
 *
 * Two steps, both without waiting on the GPU. The studio probe first
 * (lib/room-environment — its PMREM pass was the worst single offender),
 * because whether a material has an environment changes its program. Then
 * `compileAsync` for the scene itself, which uses
 * `KHR_parallel_shader_compile` to poll rather than block.
 *
 * It waits for the block textures before either, because their arrival
 * rebuilds every bucket's material and compiling before that would compile
 * twice. Mounted last inside the Canvas, so every mesh is already in the
 * scene. A failure anywhere still shows the canvas: the same failure would
 * be visible on draw, and a spinner that never leaves is worse.
 */
function Warmup({ onReady }: { onReady: () => void }) {
  const gl = useThree((s) => s.gl);
  const scene = useThree((s) => s.scene);
  const camera = useThree((s) => s.camera);
  const settled = useBlockArraysSettled();

  useEffect(() => {
    if (!settled) return;
    let live = true;
    // One frame for the buckets to rebuild with the textures they just got.
    const raf = requestAnimationFrame(async () => {
      try {
        const env = await roomEnvironmentAsync(gl);
        if (!live) {
          env.dispose();
          return;
        }
        applyEnvironment(scene, env);
        await gl.compileAsync(scene, camera);
      } catch {
        // Fall through and show what there is.
      }
      if (live) onReady();
    });
    return () => {
      live = false;
      cancelAnimationFrame(raf);
    };
  }, [settled, gl, scene, camera, onReady]);

  return null;
}

/** Whether the hero is on screen, so an idle rotation is not drawn under the fold. */
function useOnScreen(ref: React.RefObject<HTMLElement | null>): boolean {
  const [on, setOn] = useState(true);
  useEffect(() => {
    const el = ref.current;
    if (!el || typeof IntersectionObserver === "undefined") return;
    const io = new IntersectionObserver(([e]) => setOn(e.isIntersecting));
    io.observe(el);
    return () => io.disconnect();
  }, [ref]);
  return on;
}

/** The theme the page around the canvas is showing — see lib/theme. */
function usePageTheme(): Theme {
  return useSyncExternalStore(subscribePageTheme, getPageTheme, () => "dark");
}

/** Sky and ground colours for the hemisphere light, per sky. */
const HEMI: Record<Theme, [string, string, number]> = {
  // A blue sky bounces blue onto the tops and a little green up from below.
  light: ["#d6ecff", "#5b6b4a", 1.35],
  dark: ["#c8d2dd", "#1a1d21", 1.15],
};

export default function HeroCanvas() {
  const router = useRouter();
  const [parts, setParts] = useState<PartTuple[]>(() => dressParts(heroParts(), NATURAL));
  const [placed, setPlaced] = useState(0);
  const theme = usePageTheme();
  const quality = useRenderQuality();
  const still = useReducedMotion();
  const [ready, setReady] = useState(false);
  const onReady = useCallback(() => setReady(true), []);
  const box = useRef<HTMLDivElement>(null);
  const onScreen = useOnScreen(box);

  // Where the pointer went down, to tell a click from an orbit drag. In a ref
  // because it changes on every pointer event and nothing renders from it.
  const down = useRef<{ x: number; y: number } | null>(null);
  const focus = useRef(TARGET.clone());

  const onPointerDown = useCallback((e: ThreeEvent<PointerEvent>) => {
    down.current = { x: e.clientX, y: e.clientY };
  }, []);

  const onPointerUp = useCallback((e: ThreeEvent<PointerEvent>) => {
    const start = down.current;
    down.current = null;
    if (!start) return;
    // The world is a diorama when the builder is hidden: still turnable,
    // because OrbitControls is a separate concern, but not placeable.
    if (!UGC) return;
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
    <div ref={box} className="hero-sky relative h-[55dvh] max-h-[34rem] min-h-[min(20rem,55dvh)] w-full">
      <HeroSky />
      {!ready && (
        <div className="absolute inset-0 flex items-center justify-center">
          <span className="border-accent h-6 w-6 animate-spin rounded-full border-2 border-t-transparent" />
        </div>
      )}
      <Canvas
        // "never" plus a FrameLimiter, like every animating canvas (see
        // CLAUDE.md, "Frame rate"). On "demand" the idle rotation redrew the
        // scene at the panel's full rate for as long as the page was open,
        // on screen or not. Nothing is drawn until Warmup has compiled.
        frameloop="never"
        dpr={quality.dpr}
        style={{ opacity: ready ? 1 : 0, transition: "opacity 600ms ease-out" }}
        // "percentage" = PCF, named outright. Bare `shadows` is PCFSoft, which three
        // r185 deprecates and swaps for PCF on the first shadow pass, after every
        // material had already compiled for PCFSoft: each shader compiled twice.
        shadows="percentage"
        camera={{ position: [14, 11, 14], fov: FOV }}
        // Transparent: the sky is CSS behind the canvas (HeroSky), so the
        // theme can change it without a frame of WebGL, and it is already
        // painted before three.js loads.
        gl={{ powerPreference: "high-performance", alpha: true }}
        onCreated={({ scene, gl }) => {
          scene.background = null;
          gl.setClearColor(0x000000, 0);
          // The environment is not made here any more: see Warmup.
          gl.toneMapping = THREE.ACESFilmicToneMapping;
          gl.toneMappingExposure = 1.05;
        }}
      >
        <hemisphereLight args={HEMI[theme]} />
        <FitCamera />
        <VoxelClouds theme={theme} />
        <FollowSun getFocus={() => focus.current} extent={18} />

        <group onPointerDown={onPointerDown} onPointerUp={onPointerUp}>
          <InstancedWorld parts={parts} />
        </group>
        <BlockSurfaces />
        {ready && onScreen && <FrameLimiter />}

        <OrbitControls
          makeDefault
          target={TARGET.toArray()}
          enablePan={false}
          maxPolarAngle={Math.PI / 2 - 0.05}
          minDistance={12}
          maxDistance={34}
          enableDamping
          dampingFactor={0.12}
          // Slow idle rotation until the visitor takes over, so the scene
          // reads as live rather than as a screenshot.
          autoRotate={placed === 0 && !still}
          autoRotateSpeed={0.35}
        />
        <Warmup onReady={onReady} />
      </Canvas>

      {/* One prompt, and only until it has been acted on. */}
      <div className="pointer-events-none absolute inset-x-0 bottom-3 flex flex-col items-center gap-2 px-3">
        {placed === 0 && (
          <div className="hud-panel hud-panel--readout text-ink px-3 py-2 text-2xs font-semibold">
            {UGC
              ? "Click anywhere to place a block · drag to turn"
              : "Drag to turn"}
          </div>
        )}
        {placed === 1 && (
          <div className="hud-panel hud-panel--readout text-ink px-3 py-2 text-2xs font-semibold">
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
            // A white rim: over a blue sky the cyan swatch was the sky.
            className="h-2.5 w-2.5 shadow-[0_0_0_1.5px_rgb(255_255_255/0.85)]"
            style={{ background: PALETTE[i] }}
            aria-hidden
          />
        ))}
      </div>
    </div>
  );
}
